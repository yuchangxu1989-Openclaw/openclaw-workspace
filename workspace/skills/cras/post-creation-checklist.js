'use strict';

/**
 * post-creation-checklist.js
 * 技能创建后自动交付检查清单
 * 
 * 在CRAS创建完技能后自动运行，阻断空壳技能交付。
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 空壳特征 — 匹配CRAS模板生成的TODO占位符
const STUB_PATTERNS = [
  /\/\/\s*TODO:\s*实现(具体|核心)功能?逻辑/,
  /\/\/\s*TODO:\s*实现核心逻辑/,
  /\/\/\s*TODO: implement/i,
];

/**
 * 运行创建后检查清单
 * @param {string} skillPath - 技能目录的绝对路径
 * @returns {{ pass: boolean, results: object[], blockers: string[], warnings: string[] }}
 */
function runChecklist(skillPath) {
  const results = [];
  const blockers = [];
  const warnings = [];

  const skillName = path.basename(skillPath);

  // ── 1. SKILL.md 存在且非空 ──
  const skillMdPath = path.join(skillPath, 'SKILL.md');
  if (!fs.existsSync(skillMdPath)) {
    results.push({ check: 'SKILL.md', status: 'FAIL', detail: '文件不存在' });
    blockers.push('SKILL.md 缺失');
  } else {
    const content = fs.readFileSync(skillMdPath, 'utf-8').trim();
    if (content.length < 50) {
      results.push({ check: 'SKILL.md', status: 'FAIL', detail: `内容过短 (${content.length} chars)` });
      blockers.push('SKILL.md 内容过短（<50字符），疑似骨架');
    } else {
      results.push({ check: 'SKILL.md', status: 'PASS', detail: `${content.length} chars` });
    }
  }

  // ── 2. index.js 存在且非空壳 ──
  const indexPath = path.join(skillPath, 'index.js');
  if (!fs.existsSync(indexPath)) {
    results.push({ check: 'index.js exists', status: 'FAIL', detail: '文件不存在' });
    blockers.push('index.js 缺失');
  } else {
    const code = fs.readFileSync(indexPath, 'utf-8');
    // 检查空壳特征 — 去掉模板字面量和字符串中的内容再检查
    const codeNoStrings = code.replace(/`[\s\S]*?`/g, '""').replace(/'[^']*'/g, '""').replace(/"[^"]*"/g, '""');
    const isStub = STUB_PATTERNS.some(p => p.test(codeNoStrings));
    // 检查是否有真实函数体（至少包含非TODO的逻辑行）
    const meaningfulLines = code.split('\n').filter(l => {
      const t = l.trim();
      return t.length > 0
        && !t.startsWith('//')
        && !t.startsWith('*')
        && !t.startsWith('/*')
        && t !== '};'
        && t !== '}'
        && t !== '{'
        && !t.startsWith('console.log')
        && !t.startsWith('console.error')
        && !t.match(/^(const|let|var)\s+result\s*=\s*\{/)  // generic result object
        && !t.match(/^module\.exports/)
        && !t.match(/^if\s*\(require\.main/)
        && !t.match(/^['"]use strict['"]/)
        && !t.match(/^\*\/$/);
    });

    if (isStub) {
      results.push({ check: 'index.js non-stub', status: 'FAIL', detail: '包含 TODO 占位符，是空壳代码' });
      blockers.push('index.js 是空壳（含 TODO 占位符），无实际逻辑');
    } else if (meaningfulLines.length < 5) {
      results.push({ check: 'index.js non-stub', status: 'FAIL', detail: `有效逻辑行仅 ${meaningfulLines.length} 行` });
      blockers.push(`index.js 逻辑行过少（${meaningfulLines.length} 行），疑似空壳`);
    } else {
      results.push({ check: 'index.js non-stub', status: 'PASS', detail: `${meaningfulLines.length} meaningful lines` });
    }
  }

  // ── 3. index.js 语法正确 ──
  if (fs.existsSync(indexPath)) {
    try {
      execSync(`node -c "${indexPath}"`, { stdio: 'pipe', timeout: 5000 });
      results.push({ check: 'index.js syntax', status: 'PASS', detail: 'node -c passed' });
    } catch (e) {
      const stderr = (e.stderr || '').toString().trim();
      results.push({ check: 'index.js syntax', status: 'FAIL', detail: stderr || 'syntax error' });
      blockers.push(`index.js 语法错误: ${stderr.split('\n')[0]}`);
    }
  }

  // ── 4. package.json 存在且有 name+version ──
  const pkgPath = path.join(skillPath, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    results.push({ check: 'package.json', status: 'FAIL', detail: '文件不存在' });
    blockers.push('package.json 缺失');
  } else {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const missing = [];
      if (!pkg.name) missing.push('name');
      if (!pkg.version) missing.push('version');
      if (missing.length) {
        results.push({ check: 'package.json', status: 'FAIL', detail: `缺少字段: ${missing.join(', ')}` });
        blockers.push(`package.json 缺少: ${missing.join(', ')}`);
      } else {
        results.push({ check: 'package.json', status: 'PASS', detail: `${pkg.name}@${pkg.version}` });
      }
    } catch (e) {
      results.push({ check: 'package.json', status: 'FAIL', detail: 'JSON 解析失败' });
      blockers.push('package.json JSON 格式错误');
    }
  }

  // ── 5. ISC 五层展开 (可选警告) ──
  const skillMdContent = fs.existsSync(skillMdPath) ? fs.readFileSync(skillMdPath, 'utf-8') : '';
  const iscFields = ['verification', 'metadata', 'classification', 'capabilities', 'dependencies'];
  const presentFields = iscFields.filter(f => skillMdContent.toLowerCase().includes(f));
  if (presentFields.length < 3) {
    results.push({ check: 'ISC fields', status: 'WARN', detail: `仅 ${presentFields.length}/5 ISC字段 (${presentFields.join(',') || 'none'})` });
    warnings.push(`ISC五层展开不完整 (${presentFields.length}/5)`);
  } else {
    results.push({ check: 'ISC fields', status: 'PASS', detail: `${presentFields.length}/5 ISC fields` });
  }

  // ── 6. 评测用例 (可选警告) ──
  const hasEvals = fs.existsSync(path.join(skillPath, 'evals'))
    || fs.existsSync(path.join(skillPath, 'evaluation-set'))
    || fs.readdirSync(skillPath).some(f => f.match(/eval.*\.json$/i));
  if (!hasEvals) {
    results.push({ check: 'eval cases', status: 'WARN', detail: '无评测用例' });
    warnings.push('缺少评测用例（evals目录或eval JSON）');
  } else {
    results.push({ check: 'eval cases', status: 'PASS', detail: 'found' });
  }

  // ── 汇总 ──
  const pass = blockers.length === 0;
  return { pass, skillName, results, blockers, warnings };
}

/**
 * 打印检查报告
 */
function printReport(report) {
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`  Post-Creation Checklist: ${report.skillName}`);
  console.log(`${'═'.repeat(50)}`);
  for (const r of report.results) {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'WARN' ? '⚠️' : '❌';
    console.log(`  ${icon} ${r.check}: ${r.detail}`);
  }
  console.log(`${'─'.repeat(50)}`);
  if (report.pass) {
    console.log(`  ✅ 检查通过 — 技能已就绪`);
  } else {
    console.log(`  ❌ 检查未通过 — 技能标记为 draft`);
    report.blockers.forEach(b => console.log(`     🚫 ${b}`));
  }
  if (report.warnings.length) {
    report.warnings.forEach(w => console.log(`     ⚠️  ${w}`));
  }
  console.log('');
}

module.exports = { runChecklist, printReport };

// CLI 入口
if (require.main === module) {
  const target = process.argv[2];
  if (!target) {
    console.error('Usage: node post-creation-checklist.js <skill-path>');
    process.exit(1);
  }
  const skillPath = path.resolve(target);
  if (!fs.existsSync(skillPath)) {
    console.error(`Path not found: ${skillPath}`);
    process.exit(1);
  }
  const report = runChecklist(skillPath);
  printReport(report);
  process.exit(report.pass ? 0 : 1);
}
