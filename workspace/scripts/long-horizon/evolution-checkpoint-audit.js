#!/usr/bin/env node
// evolution-checkpoint-audit.js
// 每周五 17:00：验证核心进化系统（ISC规则、CRAS增长环、cron健康度）是否在预期轨道
// 生成进化检查点报告

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const WORKSPACE = '/root/.openclaw/workspace';
const REPORT_DIR = path.join(WORKSPACE, 'reports/weekly');
fs.mkdirSync(REPORT_DIR, { recursive: true });

const dateStr = new Date().toISOString().split('T')[0];
const outFile = path.join(REPORT_DIR, `evolution-checkpoint-${dateStr}.md`);

function run(cmd) {
  try { return execSync(cmd, { encoding: 'utf8', cwd: WORKSPACE }).trim(); }
  catch(e) { return `ERROR: ${e.message.slice(0, 80)}`; }
}

function checkFile(filePath) {
  try {
    const stat = fs.statSync(filePath);
    const ageDays = (Date.now() - stat.mtimeMs) / 86400000;
    return { exists: true, ageDays: ageDays.toFixed(1), size: stat.size };
  } catch { return { exists: false }; }
}

const checks = [];

// 1. SOUL.md / MEMORY.md 存在性
['SOUL.md', 'MEMORY.md', 'CRITICAL-MEMORY.md', 'HEARTBEAT.md'].forEach(f => {
  const c = checkFile(path.join(WORKSPACE, f));
  checks.push({
    name: f,
    status: c.exists ? (c.ageDays > 14 ? '⚠️ STALE' : '✅ OK') : '❌ MISSING',
    detail: c.exists ? `${c.ageDays}d ago, ${c.size}B` : 'not found'
  });
});

// 2. CRAS skill 存在
const crasSKILL = checkFile(path.join(WORKSPACE, 'skills/cras/SKILL.md'));
checks.push({
  name: 'CRAS Skill',
  status: crasSKILL.exists ? '✅ OK' : '❌ MISSING',
  detail: crasSKILL.exists ? `${crasSKILL.ageDays}d ago` : 'not found'
});

// 3. ISC enforcement
const iscCount = run('find skills -name "*.md" -exec grep -l "ISC\\|enforcement" {} \\; 2>/dev/null | wc -l');
checks.push({
  name: 'ISC规则文件数',
  status: parseInt(iscCount) > 5 ? '✅ OK' : '⚠️ LOW',
  detail: `${iscCount} files reference ISC/enforcement`
});

// 4. Cron job health (check last run times for key crons)
const cronLog = run('ls -lt infrastructure/logs/*.log 2>/dev/null | head -5');
checks.push({
  name: 'Cron日志活跃度',
  status: cronLog.includes('ERROR') ? '⚠️' : '✅ OK',
  detail: cronLog.split('\n').slice(0, 3).join(' | ')
});

// 5. Git health (commits this week)
const weekCommits = parseInt(run('git log --since="7 days ago" --oneline 2>/dev/null | wc -l')) || 0;
checks.push({
  name: '本周Git提交数',
  status: weekCommits >= 3 ? '✅ ACTIVE' : weekCommits > 0 ? '⚠️ LOW' : '❌ FROZEN',
  detail: `${weekCommits} commits in last 7d`
});

// 6. Research signals this week
const sigCount = run(`find reports/research-signals -name "*.md" -mtime -7 2>/dev/null | wc -l`);
checks.push({
  name: '本周研究信号采集',
  status: parseInt(sigCount) >= 5 ? '✅ OK' : parseInt(sigCount) > 0 ? '⚠️ PARTIAL' : '❌ NONE',
  detail: `${sigCount}/7 days harvested`
});

// 7. Entropy index trend
const metricFile = path.join(WORKSPACE, 'reports/trends/entropy-index.jsonl');
let entropyTrend = '无数据';
if (fs.existsSync(metricFile)) {
  const lines = fs.readFileSync(metricFile, 'utf8').trim().split('\n').filter(Boolean);
  if (lines.length >= 2) {
    try {
      const last = JSON.parse(lines[lines.length - 1]);
      const prev = JSON.parse(lines[Math.max(0, lines.length - 8)]);
      const delta = (parseFloat(last.order_score) - parseFloat(prev.order_score)).toFixed(2);
      entropyTrend = `${delta > 0 ? '+' : ''}${delta} (${prev.date} → ${last.date})`;
    } catch {}
  }
}
checks.push({
  name: '有序度指数趋势(7d)',
  status: entropyTrend.startsWith('+') ? '✅ 上升' : entropyTrend === '无数据' ? '⚠️ 无数据' : '⚠️ 下降',
  detail: entropyTrend
});

// 生成报告
const rows = checks.map(c => `| ${c.name} | ${c.status} | ${c.detail} |`).join('\n');
const allOk = checks.filter(c => c.status.startsWith('✅')).length;
const total = checks.length;

const report = `# 进化检查点审计 ${dateStr}

**通过率：${allOk}/${total}** ${allOk === total ? '🎉 全部通过' : allOk >= total * 0.7 ? '⚠️ 需关注' : '🚨 系统风险'}

## 检查项详情

| 检查项 | 状态 | 详情 |
|--------|------|------|
${rows}

## 📝 建议行动

${checks.filter(c => !c.status.startsWith('✅')).map(c =>
  `- **${c.name}**：${c.status} — 请检查并修复`
).join('\n') || '无需特别行动，系统运行正常。'}

---
_由 evolution-checkpoint-audit.js 自动生成 | ${new Date().toISOString()}_
`;

fs.writeFileSync(outFile, report);
console.log(`[${dateStr}] evolution-checkpoint-audit: ${allOk}/${total} checks passed → ${outFile}`);
