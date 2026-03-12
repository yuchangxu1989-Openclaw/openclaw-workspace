#!/usr/bin/env node
// capability-growth-tracker.js
// 每周日 09:00 UTC 运行：生成周度能力快照；每月1号额外生成月度汇总

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const WORKSPACE = '/root/.openclaw/workspace';
const REPORT_DIR = path.join(WORKSPACE, 'reports/capability');
const METRIC_FILE = path.join(REPORT_DIR, 'capability-growth.jsonl');
const GAPS_FILE = path.join(REPORT_DIR, 'gaps.jsonl');

fs.mkdirSync(REPORT_DIR, { recursive: true });

const shanghaiNow = new Date(new Date().toLocaleString('en-US', {timeZone: 'Asia/Shanghai'}));
const dateStr = shanghaiNow.getFullYear() + '-' + String(shanghaiNow.getMonth()+1).padStart(2,'0') + '-' + String(shanghaiNow.getDate()).padStart(2,'0');
const ts = Math.floor(shanghaiNow.getTime() / 1000);

function count(cmd) {
  try { return parseInt(execSync(cmd, { encoding: 'utf8', cwd: WORKSPACE }).trim(), 10) || 0; }
  catch { return 0; }
}

function safeExec(cmd) {
  try { return execSync(cmd, { encoding: 'utf8', cwd: WORKSPACE }).trim(); }
  catch { return ''; }
}

function countFiles(dir, ext) {
  try {
    return parseInt(execSync(
      `find ${path.join(WORKSPACE, dir)} -name "*.${ext}" 2>/dev/null | wc -l`,
      { encoding: 'utf8' }
    ).trim(), 10) || 0;
  } catch { return 0; }
}

function getISOWeek(d) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return { year: date.getUTCFullYear(), week: weekNo };
}

function growthRate(curr, prev) {
  if (prev === 0) return curr === 0 ? '0.00%' : 'N/A';
  return `${(((curr - prev) / prev) * 100).toFixed(2)}%`;
}

function loadMetrics() {
  if (!fs.existsSync(METRIC_FILE)) return [];
  return fs.readFileSync(METRIC_FILE, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => (a.ts || 0) - (b.ts || 0));
}

// ===== 实时指标采集 =====
const skillsMd = countFiles('skills', 'md');
const skillsJson = countFiles('skills', 'json');
const skillCount = skillsMd + skillsJson;

const evalCoverage = (() => {
  const evalsetFiles = countFiles('evals', 'json') + countFiles('evals', 'jsonl') + countFiles('evals', 'md');
  if (skillCount === 0) return 0;
  return Number(((evalsetFiles / skillCount) * 100).toFixed(2));
})();

const iscRuleCount = count(`find ${WORKSPACE}/skills -type f \( -name "*isc*" -o -name "*ISC*" \) 2>/dev/null | wc -l`);

const mcpCapabilityCount = (() => {
  const pkg = path.join(WORKSPACE, 'package.json');
  if (!fs.existsSync(pkg)) return 0;
  try {
    const j = JSON.parse(fs.readFileSync(pkg, 'utf8'));
    const deps = Object.keys(j.dependencies || {}).filter((k) => k.toLowerCase().includes('mcp')).length;
    const devDeps = Object.keys(j.devDependencies || {}).filter((k) => k.toLowerCase().includes('mcp')).length;
    const mcpConfig = safeExec(`find ${WORKSPACE} -type f \( -name "*mcp*.json" -o -name "*mcp*.yaml" -o -name "*mcp*.yml" \) 2>/dev/null | wc -l`);
    return deps + devDeps + (parseInt(mcpConfig || '0', 10) || 0);
  } catch {
    return 0;
  }
})();

const metrics = {
  date: dateStr,
  ts,
  kind: 'weekly-snapshot',
  metrics: {
    skill_count: skillCount,
    eval_coverage_pct: evalCoverage,
    isc_rule_count: iscRuleCount,
    mcp_capability_count: mcpCapabilityCount,
  }
};

const history = loadMetrics();
const prevWeekly = [...history].reverse().find((m) => m.kind === 'weekly-snapshot');

const delta = {
  skill_count: {
    value: skillCount,
    change: prevWeekly ? skillCount - (prevWeekly.metrics.skill_count || 0) : 0,
    growth_rate: prevWeekly ? growthRate(skillCount, prevWeekly.metrics.skill_count || 0) : 'N/A',
  },
  eval_coverage_pct: {
    value: evalCoverage,
    change: prevWeekly ? Number((evalCoverage - (prevWeekly.metrics.eval_coverage_pct || 0)).toFixed(2)) : 0,
    growth_rate: prevWeekly ? growthRate(evalCoverage, prevWeekly.metrics.eval_coverage_pct || 0) : 'N/A',
  },
  isc_rule_count: {
    value: iscRuleCount,
    change: prevWeekly ? iscRuleCount - (prevWeekly.metrics.isc_rule_count || 0) : 0,
    growth_rate: prevWeekly ? growthRate(iscRuleCount, prevWeekly.metrics.isc_rule_count || 0) : 'N/A',
  },
  mcp_capability_count: {
    value: mcpCapabilityCount,
    change: prevWeekly ? mcpCapabilityCount - (prevWeekly.metrics.mcp_capability_count || 0) : 0,
    growth_rate: prevWeekly ? growthRate(mcpCapabilityCount, prevWeekly.metrics.mcp_capability_count || 0) : 'N/A',
  },
};

metrics.delta_vs_last_week = delta;
fs.appendFileSync(METRIC_FILE, JSON.stringify(metrics) + '\n');

// ===== 周报 =====
const { year: isoYear, week: isoWeek } = getISOWeek(shanghaiNow);
const weekStr = String(isoWeek).padStart(2, '0');
const weeklyReportPath = path.join(REPORT_DIR, `weekly-${isoYear}-W${weekStr}.md`);

const weeklyReport = `# 能力周度快照 ${isoYear}-W${weekStr}

- 日期：${dateStr}
- 对比基线：${prevWeekly ? prevWeekly.date : '首次快照'}

## 核心指标变化（周环比）

### 1) 技能数量变化
- 当前：${delta.skill_count.value}
- 变化：${delta.skill_count.change >= 0 ? '+' : ''}${delta.skill_count.change}
- 增长率：${delta.skill_count.growth_rate}

### 2) 评测覆盖率变化
- 当前：${delta.eval_coverage_pct.value}%
- 变化：${delta.eval_coverage_pct.change >= 0 ? '+' : ''}${delta.eval_coverage_pct.change} pct
- 增长率：${delta.eval_coverage_pct.growth_rate}

### 3) ISC规则数变化
- 当前：${delta.isc_rule_count.value}
- 变化：${delta.isc_rule_count.change >= 0 ? '+' : ''}${delta.isc_rule_count.change}
- 增长率：${delta.isc_rule_count.growth_rate}

### 4) MCP能力变化
- 当前：${delta.mcp_capability_count.value}
- 变化：${delta.mcp_capability_count.change >= 0 ? '+' : ''}${delta.mcp_capability_count.change}
- 增长率：${delta.mcp_capability_count.growth_rate}

---
_由 capability-growth-tracker.js 自动生成_
`;

fs.writeFileSync(weeklyReportPath, weeklyReport);

// ===== 停滞识别 -> gaps.jsonl =====
const stagnant = [];
for (const [k, v] of Object.entries(delta)) {
  if (v.change <= 0) {
    stagnant.push({
      ts,
      date: dateStr,
      area: k,
      status: '待补齐',
      current: v.value,
      delta: v.change,
      growth_rate: v.growth_rate,
    });
  }
}
if (stagnant.length > 0) {
  fs.appendFileSync(GAPS_FILE, stagnant.map((x) => JSON.stringify(x)).join('\n') + '\n');
}

// ===== 月度汇总（每月1日） =====
if (shanghaiNow.getDate() === 1) {
  const month = `${shanghaiNow.getFullYear()}-${String(shanghaiNow.getMonth() + 1).padStart(2, '0')}`;
  const monthPrefix = `${month}-`;
  const monthMetrics = loadMetrics().filter((m) => m.kind === 'weekly-snapshot' && String(m.date || '').startsWith(monthPrefix));

  const first = monthMetrics[0];
  const last = monthMetrics[monthMetrics.length - 1];

  const monthlyReportPath = path.join(REPORT_DIR, `monthly-${month}.md`);

  let body = `# 能力月度复盘 ${month}\n\n`;
  body += `- 统计周快照数：${monthMetrics.length}\n`;

  if (first && last) {
    const monthlyDelta = {
      skill_count: last.metrics.skill_count - first.metrics.skill_count,
      eval_coverage_pct: Number((last.metrics.eval_coverage_pct - first.metrics.eval_coverage_pct).toFixed(2)),
      isc_rule_count: last.metrics.isc_rule_count - first.metrics.isc_rule_count,
      mcp_capability_count: last.metrics.mcp_capability_count - first.metrics.mcp_capability_count,
    };

    body += `\n## 月度变化（首周 -> 末周）\n`;
    body += `- 技能数量：${first.metrics.skill_count} -> ${last.metrics.skill_count} (${monthlyDelta.skill_count >= 0 ? '+' : ''}${monthlyDelta.skill_count})\n`;
    body += `- 评测覆盖率：${first.metrics.eval_coverage_pct}% -> ${last.metrics.eval_coverage_pct}% (${monthlyDelta.eval_coverage_pct >= 0 ? '+' : ''}${monthlyDelta.eval_coverage_pct} pct)\n`;
    body += `- ISC规则数：${first.metrics.isc_rule_count} -> ${last.metrics.isc_rule_count} (${monthlyDelta.isc_rule_count >= 0 ? '+' : ''}${monthlyDelta.isc_rule_count})\n`;
    body += `- MCP能力：${first.metrics.mcp_capability_count} -> ${last.metrics.mcp_capability_count} (${monthlyDelta.mcp_capability_count >= 0 ? '+' : ''}${monthlyDelta.mcp_capability_count})\n`;
  } else {
    body += `\n> 本月周快照不足，待后续数据累积。\n`;
  }

  body += `\n---\n_由 capability-growth-tracker.js 自动生成_\n`;
  fs.writeFileSync(monthlyReportPath, body);
}

const timeStr = String(shanghaiNow.getHours()).padStart(2,'0') + ':' + String(shanghaiNow.getMinutes()).padStart(2,'0') + ':' + String(shanghaiNow.getSeconds()).padStart(2,'0');
console.log(`[${dateStr}T${timeStr}+08:00] capability-growth-tracker: weekly=${weeklyReportPath}`);
