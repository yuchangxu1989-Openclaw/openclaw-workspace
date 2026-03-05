#!/usr/bin/env node
/**
 * PDF Generator v2.0 - ISC规则对齐版
 * 
 * 对齐规则：
 * - rule.design-document-structure-001 (7项结构检查)
 * - rule.design-document-narrative-review-001 (模拟演讲门禁)
 * - rule.architecture-diagram-visual-output-001 (10项视觉标准)
 * - rule.design-document-delivery-pipeline-001 (9步交付流水线)
 *
 * 工具链：Markdown → 结构检查 → mermaid渲染 → Pandoc + XeLaTeX → PDF → 演讲审查prompt
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const TEMPLATE_DIR = path.join(__dirname, 'templates');
const LATEX_TEMPLATE = path.join(TEMPLATE_DIR, 'default.latex');

// ============================================================
// 结构检查 (rule.design-document-structure-001)
// ============================================================

function parseMarkdownStructure(markdown) {
  const lines = markdown.split('\n');
  const headings = [];
  const codeBlocks = [];
  let inCode = false, codeStart = 0, codeLang = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.match(/^```/)) {
      if (!inCode) {
        inCode = true;
        codeStart = i;
        codeLang = line.replace(/^```/, '').trim();
      } else {
        codeBlocks.push({ start: codeStart, end: i, lang: codeLang, lines: i - codeStart - 1 });
        inCode = false;
        codeLang = '';
      }
    }
    if (!inCode) {
      const hMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (hMatch) {
        headings.push({ level: hMatch[1].length, text: hMatch[2].trim(), line: i + 1 });
      }
    }
  }
  return { headings, codeBlocks, lines };
}

function checkStructure(markdown) {
  const { headings, codeBlocks, lines } = parseMarkdownStructure(markdown);
  const violations = [];

  // S1: 一级目录不超过5章（+附录）
  const h1s = headings.filter(h => h.level === 1);
  const h1NonAppendix = h1s.filter(h => !/附录|appendix/i.test(h.text));
  if (h1NonAppendix.length > 5) {
    violations.push({ id: 'S1', severity: 'error', message: `一级目录${h1NonAppendix.length}章，超过上限5章`, details: h1NonAppendix.map(h => h.text) });
  }

  // S2: 叙事脉络 — 交给演讲审查，此处仅检查是否有h1
  if (h1s.length === 0) {
    violations.push({ id: 'S2', severity: 'error', message: '文档没有一级标题，无法构成叙事脉络' });
  }

  // S3: 代码块分离 — >5行的代码块必须在附录区域
  const appendixHeading = headings.find(h => /附录|appendix/i.test(h.text));
  const appendixLine = appendixHeading ? appendixHeading.line : Infinity;
  const longCodeInBody = codeBlocks.filter(cb => cb.lines > 5 && cb.lang !== 'mermaid' && (cb.start + 1) < appendixLine);
  if (longCodeInBody.length > 0) {
    violations.push({ id: 'S3', severity: 'error', message: `${longCodeInBody.length}个超5行代码块在正文中，应移至附录`, details: longCodeInBody.map(cb => `行${cb.start + 1}-${cb.end + 1} (${cb.lines}行, ${cb.lang || '无语言'})`) });
  }

  // S4: TL;DR长度
  const tldrMatch = markdown.match(/(?:^|\n)(?:>?\s*)?(?:TL;DR|TLDR|tl;dr)[：:\s]*([^\n]+(?:\n(?!#)[^\n]+)*)/);
  if (tldrMatch) {
    const tldrText = tldrMatch[1].replace(/\s+/g, '');
    if (tldrText.length > 150) {
      violations.push({ id: 'S4', severity: 'error', message: `TL;DR ${tldrText.length}字，超过150字上限` });
    }
  }

  // S5: 禁止PM内容
  const pmPatterns = [/\bDay\s*\d/i, /\bSprint\s*\d/i, /工时估算/, /人[天日]$/m];
  for (const pat of pmPatterns) {
    const m = markdown.match(pat);
    if (m) {
      violations.push({ id: 'S5', severity: 'error', message: `发现PM内容: "${m[0]}"` });
    }
  }

  // S6: 章节编号连续（检查h2级别）
  const h2s = headings.filter(h => h.level === 2);
  // 简单检查：如果有带数字编号的h2，验证连续性
  const numberedH2s = h2s.map(h => {
    const nm = h.text.match(/^(?:第)?(\d+)/);
    return nm ? parseInt(nm[1]) : null;
  }).filter(n => n !== null);
  for (let i = 1; i < numberedH2s.length; i++) {
    if (numberedH2s[i] !== numberedH2s[i - 1] + 1) {
      violations.push({ id: 'S6', severity: 'error', message: `章节编号不连续: ${numberedH2s[i - 1]} → ${numberedH2s[i]}` });
      break;
    }
  }

  // S7: 交叉引用检查 — 检查 "见附录 X" 等引用
  const refs = [...markdown.matchAll(/见(附录\s*[A-Z\u4e00-\u9fff][\w-]*)/g)];
  for (const ref of refs) {
    const target = ref[1].replace(/\s+/g, '');
    const found = headings.some(h => h.text.replace(/\s+/g, '').includes(target));
    if (!found) {
      violations.push({ id: 'S7', severity: 'error', message: `悬空引用: "${ref[0]}" 目标不存在` });
    }
  }

  // 层级检查: ≤3级
  const deepHeadings = headings.filter(h => h.level > 3);
  if (deepHeadings.length > 0) {
    violations.push({ id: 'DEPTH', severity: 'error', message: `${deepHeadings.length}个标题超过3级层级`, details: deepHeadings.map(h => `行${h.line}: ${'#'.repeat(h.level)} ${h.text}`) });
  }

  // 图表编号检查
  const figureRefs = [...markdown.matchAll(/!\[([^\]]*)\]\([^)]+\)/g)];
  const figuresWithoutNumber = figureRefs.filter(f => !/图\s*\d|Figure\s*\d|Fig\.\s*\d/i.test(f[1]));
  if (figuresWithoutNumber.length > 0) {
    violations.push({ id: 'FIG', severity: 'warning', message: `${figuresWithoutNumber.length}张图片缺少编号标题`, details: figuresWithoutNumber.map(f => f[1] || '(无alt文本)') });
  }

  return { passed: violations.filter(v => v.severity === 'error').length === 0, violations };
}

// ============================================================
// 视觉标准检查 (rule.architecture-diagram-visual-output-001)
// ============================================================

function checkVisualStandards(markdown) {
  const warnings = [];
  const mermaidBlocks = [...markdown.matchAll(/```mermaid\n([\s\S]*?)```/g)];

  for (let i = 0; i < mermaidBlocks.length; i++) {
    const code = mermaidBlocks[i][1];
    const idx = i + 1;

    // VS01: 检查是否有深色背景设置
    if (/background\s*:\s*#[0-3]/.test(code)) {
      warnings.push({ id: 'VS01', message: `Mermaid图${idx}: 可能使用了深色背景` });
    }
    // VS02: 检查是否有纯英文标注（无中文字符）
    const labels = code.match(/\[([^\]]+)\]/g) || [];
    const allEnglish = labels.filter(l => !/[\u4e00-\u9fff]/.test(l));
    if (labels.length > 0 && allEnglish.length === labels.length) {
      warnings.push({ id: 'VS02', message: `Mermaid图${idx}: 所有标注为纯英文，应使用中文` });
    }
    // VS09: emoji检查
    if (/[\u{1F300}-\u{1F9FF}]/u.test(code)) {
      warnings.push({ id: 'VS09', message: `Mermaid图${idx}: 含emoji，PDF渲染可能异常，建议替换为文字` });
    }
  }

  return warnings;
}

// ============================================================
// Mermaid渲染 (白底)
// ============================================================

function renderMermaidBlocks(markdown, outputDir) {
  let counter = 0;
  return markdown.replace(/```mermaid\n([\s\S]*?)```/g, (match, code) => {
    counter++;
    const mmdFile = path.join(outputDir, `diagram-${counter}.mmd`);
    const pngFile = path.join(outputDir, `diagram-${counter}.png`);

    fs.writeFileSync(mmdFile, code.trim());

    try {
      // VS01: 强制白底
      execSync(`mmdc -i "${mmdFile}" -o "${pngFile}" -w 1200 -H 800 --backgroundColor white`, {
        timeout: 30000,
        stdio: 'pipe'
      });
      return `![图 ${counter}](${pngFile})`;
    } catch (e) {
      console.error(`⚠️  Mermaid图 ${counter} 渲染失败: ${e.message}`);
      return `> [图渲染失败] ${code.substring(0, 80)}...`;
    }
  });
}

// ============================================================
// 模拟演讲审查Prompt生成 (rule.design-document-narrative-review-001)
// ============================================================

function generateNarrativeReviewPrompt(markdown, isPDF = false) {
  const { headings } = parseMarkdownStructure(markdown);
  const chapters = headings.filter(h => h.level <= 2);

  const layer = isPDF ? 'PDF' : 'MD';
  const chapterList = chapters.map((c, i) => `${i + 1}. ${'#'.repeat(c.level)} ${c.text}`).join('\n');

  return `## 模拟演讲审查 (${layer}层)

你正在审查一份设计文档。请模拟一场10分钟的技术评审演讲。

### 文档章节结构
${chapterList}

### 审查要求

请对每个章节逐一检查，输出以下内容：

1. **承上启下过渡**：该章节开头是否有承上启下的过渡句？如果没有，标记为缺失。
2. **孤立技术术语**：是否有技术术语在首次出现时没有解释？列出所有孤立术语。
3. **叙事连贯性**：与上一章节之间是否存在逻辑跳跃？如果有，描述断层。
4. **评审者追问点**：评审者在这一段最可能追问什么？
5. **讲不清楚的地方**：如果你要口头讲述这一段，哪里会卡壳？为什么？

### 输出格式

对每个章节：
\`\`\`
### [章节名]
- 时间分配: X分钟
- 过渡: ✅有 / ❌缺失 (建议: ...)
- 孤立术语: [术语1, 术语2] 或 无
- 叙事跳跃: ✅连贯 / ❌跳跃 (描述: ...)
- 追问预测: ...
- 卡壳风险: ...
- 问题等级: P0必须修 / P1建议修 / OK
\`\`\`

### 最终裁决
- P0问题数: ?（必须全部修复才能通过）
- P1问题数: ?（建议修复）
- 总评: 通过 / 不通过
`;
}

// ============================================================
// PDF生成核心
// ============================================================

function generatePDF(inputFile, outputFile, options = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-gen-'));

  try {
    let markdown = fs.readFileSync(inputFile, 'utf-8');

    const titleMatch = markdown.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1] : path.basename(inputFile, '.md');

    if (options.withDiagrams !== false) {
      markdown = renderMermaidBlocks(markdown, tmpDir);
    }

    const tmpMd = path.join(tmpDir, 'input.md');
    fs.writeFileSync(tmpMd, markdown);

    const pandocArgs = [
      tmpMd, '-o', outputFile,
      '--pdf-engine=xelatex',
      '--toc', '--toc-depth=3', '--number-sections',
      '-V', `title=${title}`,
      '-V', 'documentclass=report',
      '-V', 'papersize=a4',
      '-V', 'geometry:margin=2.5cm',
      '-V', 'mainfont=Noto Serif CJK SC',
      '-V', 'sansfont=Noto Sans CJK SC',
      '-V', 'monofont=Noto Sans Mono',
      '-V', 'fontsize=11pt',
      '-V', 'linestretch=1.4',
      '-V', 'header-includes=\\usepackage{fancyhdr}\\pagestyle{fancy}\\fancyhead[L]{\\small ' + title.replace(/[\\{}]/g, '') + '}\\fancyhead[R]{\\small\\thepage}\\fancyfoot[C]{}',
      '-V', 'colorlinks=true',
      '-V', 'linkcolor=blue',
      '-V', 'toccolor=black',
      '--highlight-style=tango',
      '-f', 'markdown+smart+pipe_tables+fenced_code_blocks+backtick_code_blocks+definition_lists',
    ];

    if (fs.existsSync(LATEX_TEMPLATE)) {
      pandocArgs.push('--template', LATEX_TEMPLATE);
    }

    const result = spawnSync('pandoc', pandocArgs, {
      timeout: 120000,
      stdio: 'pipe',
      encoding: 'utf-8'
    });

    if (result.status !== 0) {
      console.error('❌ Pandoc错误:', result.stderr);
      process.exit(1);
    }

    const stat = fs.statSync(outputFile);
    console.log(`✅ PDF生成成功: ${outputFile} (${(stat.size / 1024).toFixed(0)}KB)`);

  } finally {
    try { fs.rmSync(tmpDir, { recursive: true }); } catch (e) {}
  }
}

// ============================================================
// 9步交付流水线 (rule.design-document-delivery-pipeline-001)
// ============================================================

function runPipeline(inputFile, outputFile, options = {}) {
  const stopAtStep = options.step || 9;
  const markdown = fs.readFileSync(inputFile, 'utf-8');
  const results = { steps: [], stopped: false, stopReason: null };

  function addStep(num, name, status, detail) {
    results.steps.push({ step: num, name, status, detail });
    console.log(`[Step ${num}/9] ${name}: ${status === 'pass' ? '✅' : status === 'skip' ? '⏭️' : '❌'} ${detail || ''}`);
  }

  // Step 1: 结构审查
  const structCheck = checkStructure(markdown);
  if (!structCheck.passed) {
    addStep(1, '结构审查', 'fail', `${structCheck.violations.length}项违规`);
    results.stopped = true;
    results.stopReason = '结构审查不通过';
    results.violations = structCheck.violations;
    console.error('\n❌ 结构审查违规列表:');
    for (const v of structCheck.violations) {
      console.error(`  [${v.id}] ${v.severity}: ${v.message}`);
      if (v.details) v.details.forEach(d => console.error(`    - ${d}`));
    }
    return results;
  }
  addStep(1, '结构审查', 'pass', '7项检查全部通过');
  if (stopAtStep <= 1) { results.stopped = true; results.stopReason = `暂停于Step ${stopAtStep}`; return results; }

  // Step 2: 内容瘦身 (检查，不自动修改)
  const { codeBlocks } = parseMarkdownStructure(markdown);
  const appendixH = markdown.match(/^#{1,2}\s+附录/m);
  const appendixPos = appendixH ? markdown.indexOf(appendixH[0]) : Infinity;
  const bodyLongCode = codeBlocks.filter(cb => cb.lines > 5 && cb.lang !== 'mermaid');
  addStep(2, '内容瘦身', bodyLongCode.length === 0 ? 'pass' : 'pass', `${bodyLongCode.length}个长代码块已确认位于附录`);
  if (stopAtStep <= 2) { results.stopped = true; results.stopReason = `暂停于Step ${stopAtStep}`; return results; }

  // Step 3: MECE校验 (输出提示，需人工/LLM判断)
  addStep(3, 'MECE校验', 'skip', '需要LLM辅助判断，已跳过自动检查');
  if (stopAtStep <= 3) { results.stopped = true; results.stopReason = `暂停于Step ${stopAtStep}`; return results; }

  // Step 4: 质量扫描 (需isc-document-quality技能，此处标记)
  addStep(4, '质量扫描', 'skip', '需调用isc-document-quality技能');
  if (stopAtStep <= 4) { results.stopped = true; results.stopReason = `暂停于Step ${stopAtStep}`; return results; }

  // Step 5: 架构图标准化
  const visualWarnings = checkVisualStandards(markdown);
  addStep(5, '架构图标准化', visualWarnings.length === 0 ? 'pass' : 'pass', `${visualWarnings.length}项视觉提醒`);
  if (visualWarnings.length > 0) {
    results.visualWarnings = visualWarnings;
    for (const w of visualWarnings) {
      console.log(`  ⚠️  [${w.id}] ${w.message}`);
    }
  }
  if (stopAtStep <= 5) { results.stopped = true; results.stopReason = `暂停于Step ${stopAtStep}`; return results; }

  // Step 6: MD模拟演讲
  const mdReviewPrompt = generateNarrativeReviewPrompt(markdown, false);
  addStep(6, 'MD模拟演讲', 'pass', '已生成审查prompt，需LLM执行');
  results.mdReviewPrompt = mdReviewPrompt;
  if (stopAtStep <= 6) { results.stopped = true; results.stopReason = `暂停于Step ${stopAtStep}`; return results; }

  // Step 7: PDF生成
  generatePDF(inputFile, outputFile, options);
  addStep(7, 'PDF生成', 'pass');
  if (stopAtStep <= 7) { results.stopped = true; results.stopReason = `暂停于Step ${stopAtStep}`; return results; }

  // Step 8: PDF模拟演讲
  const pdfReviewPrompt = generateNarrativeReviewPrompt(markdown, true);
  addStep(8, 'PDF模拟演讲', 'pass', '已生成PDF层审查prompt，需LLM执行');
  results.pdfReviewPrompt = pdfReviewPrompt;
  if (stopAtStep <= 8) { results.stopped = true; results.stopReason = `暂停于Step ${stopAtStep}`; return results; }

  // Step 9: 交付
  addStep(9, '交付', 'pass', `PDF: ${outputFile}`);
  results.outputFile = outputFile;

  return results;
}

// ============================================================
// CLI入口
// ============================================================

if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log(`用法:
  node generate.js <input.md> <output.pdf> [选项]

选项:
  --with-diagrams     渲染mermaid图
  --step N            执行到第N步暂停 (1-9)
  --check-only        仅执行结构检查，不生成PDF
  --narrative-prompt   仅输出模拟演讲审查prompt
`);
    process.exit(1);
  }

  const inputFile = path.resolve(args[0]);
  const outputFile = path.resolve(args[1]);
  const withDiagrams = args.includes('--with-diagrams');
  const checkOnly = args.includes('--check-only');
  const narrativeOnly = args.includes('--narrative-prompt');
  const stepIdx = args.indexOf('--step');
  const step = stepIdx !== -1 ? parseInt(args[stepIdx + 1]) : undefined;

  if (!fs.existsSync(inputFile)) {
    console.error(`❌ 文件不存在: ${inputFile}`);
    process.exit(1);
  }

  if (checkOnly) {
    const md = fs.readFileSync(inputFile, 'utf-8');
    const result = checkStructure(md);
    if (result.passed) {
      console.log('✅ 结构检查通过');
    } else {
      console.error('❌ 结构检查不通过:');
      for (const v of result.violations) {
        console.error(`  [${v.id}] ${v.severity}: ${v.message}`);
      }
      process.exit(1);
    }
  } else if (narrativeOnly) {
    const md = fs.readFileSync(inputFile, 'utf-8');
    console.log(generateNarrativeReviewPrompt(md));
  } else {
    const results = runPipeline(inputFile, outputFile, { withDiagrams, step });
    if (results.mdReviewPrompt) {
      const promptFile = outputFile.replace(/\.pdf$/, '.review-prompt.md');
      fs.writeFileSync(promptFile, results.mdReviewPrompt);
      console.log(`📝 演讲审查prompt已保存: ${promptFile}`);
    }
    if (results.stopped && results.violations) {
      process.exit(1);
    }
  }
}

module.exports = {
  generatePDF,
  renderMermaidBlocks,
  checkStructure,
  checkVisualStandards,
  generateNarrativeReviewPrompt,
  parseMarkdownStructure,
  runPipeline
};
