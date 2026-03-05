#!/usr/bin/env node
/**
 * PDF Generator - 高质量文档生成器
 * 
 * 工具链：Markdown → (mermaid渲染) → Pandoc + XeLaTeX → PDF
 * 基准：isc-event-dto-binding-design-v5-final.pdf
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const TEMPLATE_DIR = path.join(__dirname, 'templates');
const LATEX_TEMPLATE = path.join(TEMPLATE_DIR, 'default.latex');

function renderMermaidBlocks(markdown, outputDir) {
  let counter = 0;
  return markdown.replace(/```mermaid\n([\s\S]*?)```/g, (match, code) => {
    counter++;
    const mmdFile = path.join(outputDir, `diagram-${counter}.mmd`);
    const pngFile = path.join(outputDir, `diagram-${counter}.png`);
    
    fs.writeFileSync(mmdFile, code.trim());
    
    try {
      execSync(`mmdc -i "${mmdFile}" -o "${pngFile}" -w 1200 -H 800 --backgroundColor transparent`, {
        timeout: 30000,
        stdio: 'pipe'
      });
      return `![](${pngFile})`;
    } catch (e) {
      console.error(`⚠️  Mermaid图 ${counter} 渲染失败: ${e.message}`);
      return `> [图渲染失败] ${code.substring(0, 80)}...`;
    }
  });
}

function generatePDF(inputFile, outputFile, options = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-gen-'));
  
  try {
    // 1. 读取Markdown
    let markdown = fs.readFileSync(inputFile, 'utf-8');
    
    // 2. 提取标题
    const titleMatch = markdown.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1] : path.basename(inputFile, '.md');
    
    // 3. 渲染Mermaid图
    if (options.withDiagrams !== false) {
      markdown = renderMermaidBlocks(markdown, tmpDir);
    }
    
    // 4. 写入临时MD文件
    const tmpMd = path.join(tmpDir, 'input.md');
    fs.writeFileSync(tmpMd, markdown);
    
    // 5. Pandoc → PDF
    const pandocArgs = [
      tmpMd,
      '-o', outputFile,
      '--pdf-engine=xelatex',
      '--toc',
      '--toc-depth=3',
      '--number-sections',
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
    
    // 使用自定义模板（如果存在）
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
    // 清理临时文件
    try { fs.rmSync(tmpDir, { recursive: true }); } catch(e) {}
  }
}

// CLI入口
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('用法: node generate.js <input.md> <output.pdf> [--with-diagrams]');
    process.exit(1);
  }
  
  const inputFile = path.resolve(args[0]);
  const outputFile = path.resolve(args[1]);
  const withDiagrams = args.includes('--with-diagrams');
  
  if (!fs.existsSync(inputFile)) {
    console.error(`❌ 文件不存在: ${inputFile}`);
    process.exit(1);
  }
  
  generatePDF(inputFile, outputFile, { withDiagrams });
}

module.exports = { generatePDF, renderMermaidBlocks };
