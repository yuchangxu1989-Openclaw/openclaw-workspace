#!/usr/bin/env node
/**
 * CRAS 慢通道：日级洞察聚合
 *
 * v3 修复：
 * 1) 四维数据改为真实数据源
 * 2) 每维输出：现状 -> 昨日对比 -> 优化建议
 * 3) 评分透明化（公式/输入/得分）
 * 4) 低于3分写入 action-items.jsonl
 * 5) 生成 brief-YYYY-MM-DD.md
 * 6) 日期统一 Asia/Shanghai
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const WORKSPACE = '/root/.openclaw/workspace';
const REPORT_DIR = path.join(WORKSPACE, 'reports/cras-daily');
const ACTION_ITEMS_FILE = path.join(REPORT_DIR, 'action-items.jsonl');
const INTENT_LOG = path.join(WORKSPACE, 'infrastructure/logs/intent-extractor.log');
const EVENT_BUS = path.join(WORKSPACE, 'infrastructure/event-bus/events.jsonl');
const INSIGHTS_DIR = path.join(WORKSPACE, 'skills/cras/insights');

fs.mkdirSync(REPORT_DIR, { recursive: true });

function shanghaiDate(date = new Date()) {
  return date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
}

function readIfExists(file) {
  if (!fs.existsSync(file)) return '';
  return fs.readFileSync(file, 'utf8');
}

function safeList(dir, filterFn = () => true) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(filterFn);
}

function countLines(file) {
  if (!fs.existsSync(file)) return 0;
  const c = fs.readFileSync(file, 'utf8');
  if (!c.trim()) return 0;
  return c.split('\n').length;
}

function parseIntentDistributionFromLog(content) {
  const dist = {};
  const lines = content.split('\n');
  for (const line of lines) {
    const m = line.match(/🎯\s*(intent\.[\w.\-]+)/);
    if (m) dist[m[1]] = (dist[m[1]] || 0) + 1;
  }
  return dist;
}

function getEvalsetFileCount() {
  const dir = path.join(WORKSPACE, 'tests/benchmarks/intent');
  return safeList(dir, f => f.endsWith('.json')).length;
}

function getIscRulesCount() {
  const dir = path.join(WORKSPACE, 'skills/isc-core/rules');
  return safeList(dir, f => f.endsWith('.json')).length;
}

function getSkillsCountByShell() {
  try {
    const out = execSync('ls skills/ | wc -l', { cwd: WORKSPACE, encoding: 'utf8' }).trim();
    const n = parseInt(out, 10);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function getGitCommitCount24h() {
  try {
    const out = execSync('git log --since="24 hours ago" --oneline | wc -l', { cwd: WORKSPACE, encoding: 'utf8' }).trim();
    const n = parseInt(out, 10);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function getPdcaReportCount(dateStr) {
  const reportRoot = path.join(WORKSPACE, 'reports');
  if (!fs.existsSync(reportRoot)) return 0;
  const names = fs.readdirSync(reportRoot);
  let count = 0;
  for (const n of names) {
    const full = path.join(reportRoot, n);
    if (!fs.statSync(full).isDirectory()) continue;
    const files = safeList(full, f => f.includes('pdca') && f.endsWith('.md') && f.includes(dateStr));
    count += files.length;
  }
  return count;
}

function scoreByRatio(current, target) {
  const ratio = target <= 0 ? 1 : current / target;
  const score = Math.max(1, Math.min(5, Math.round(ratio * 5)));
  return score;
}

function buildDimension(name, current, yesterday, formula, inputs, suggestionFn) {
  const delta = current - yesterday;
  const score = formula(inputs);
  return {
    name,
    current,
    yesterday,
    delta,
    score_detail: {
      formula_text: inputs.formula_text,
      inputs,
      score
    },
    suggestion: suggestionFn({ current, yesterday, delta, score, inputs })
  };
}

function appendActionItems(dateStr, dims) {
  const lows = dims.filter(d => d.score_detail.score < 3);
  if (lows.length === 0) return 0;
  const lines = lows.map(d => JSON.stringify({
    date: dateStr,
    dimension: d.name,
    score: d.score_detail.score,
    reason: d.suggestion,
    created_at: new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).replace(' ', 'T')
  }));
  fs.appendFileSync(ACTION_ITEMS_FILE, lines.join('\n') + '\n');
  return lows.length;
}

function generateBrief(dateStr, dimensions, actionCount) {
  const file = path.join(REPORT_DIR, `brief-${dateStr}.md`);
  const md = [];
  md.push(`# CRAS Daily Brief (${dateStr}, Asia/Shanghai)`);
  md.push('');
  for (const d of dimensions) {
    md.push(`## ${d.name}`);
    md.push(`- 现状: ${d.current}`);
    md.push(`- 昨日: ${d.yesterday}`);
    md.push(`- 对比: ${d.delta >= 0 ? '+' : ''}${d.delta}`);
    md.push(`- 评分: ${d.score_detail.score}/5`);
    md.push(`- 公式: ${d.score_detail.formula_text}`);
    md.push(`- 输入: ${JSON.stringify(d.score_detail.inputs)}`);
    md.push(`- 建议: ${d.suggestion}`);
    md.push('');
  }
  md.push(`- 低于3分行动项写入: ${ACTION_ITEMS_FILE}（新增 ${actionCount} 条）`);
  fs.writeFileSync(file, md.join('\n'));
  return file;
}

function main() {
  const today = shanghaiDate();
  const yesterday = shanghaiDate(new Date(Date.now() - 24 * 60 * 60 * 1000));

  // 学习维度：research-signals 当天文件 + memory行数
  const rsDir = path.join(WORKSPACE, 'reports/research-signals');
  const rsTodayCount = safeList(rsDir, f => f.includes(today)).length;
  const rsYestCount = safeList(rsDir, f => f.includes(yesterday)).length;
  const memTodayLines = countLines(path.join(WORKSPACE, `memory/${today}.md`));
  const memYestLines = countLines(path.join(WORKSPACE, `memory/${yesterday}.md`));

  // 用户模式：intent-extractor.log 意图分布
  const intentContent = readIfExists(INTENT_LOG);
  const distToday = parseIntentDistributionFromLog(intentContent);
  const intentTypesToday = Object.keys(distToday).length;
  const intentTotalToday = Object.values(distToday).reduce((a, b) => a + b, 0);
  const intentTypesYest = 0; // 无切片日志，保守置0

  // 知识治理：skills数 + ISC规则数 + 评测集文件数
  const skillsCount = getSkillsCountByShell();
  const rulesCount = getIscRulesCount();
  const evalFiles = getEvalsetFileCount();

  // 进化：24h commit数 + PDCA报告
  const commits24h = getGitCommitCount24h();
  const pdcaToday = getPdcaReportCount(today);
  const pdcaYest = getPdcaReportCount(yesterday);

  const dimensions = [];

  dimensions.push(buildDimension(
    '学习',
    rsTodayCount + memTodayLines,
    rsYestCount + memYestLines,
    ({ current }) => scoreByRatio(current, 30),
    {
      formula_text: 'score = clamp(round((researchSignalsToday + memoryLinesToday)/30*5),1,5)',
      researchSignalsToday: rsTodayCount,
      memoryLinesToday: memTodayLines,
      target: 30
    },
    ({ inputs, delta, score }) => score < 3
      ? `学习信号不足（research=${inputs.researchSignalsToday}, memoryLines=${inputs.memoryLinesToday}），建议补充研究信号并沉淀到memory；较昨日${delta}`
      : `保持学习沉淀节奏，继续稳定产出研究信号；较昨日${delta}`
  ));

  dimensions.push(buildDimension(
    '用户模式',
    intentTypesToday,
    intentTypesYest,
    ({ current }) => scoreByRatio(current, 6),
    {
      formula_text: 'score = clamp(round(intentTypeCount/6*5),1,5)',
      intentTypeCount: intentTypesToday,
      intentTotalCount: intentTotalToday,
      topIntents: Object.entries(distToday).sort((a,b)=>b[1]-a[1]).slice(0,5)
    },
    ({ inputs, score }) => score < 3
      ? `意图类型覆盖偏窄（${inputs.intentTypeCount}类），建议提升intent-extractor覆盖并关注头部意图长尾化。`
      : `意图分布较健康，持续监控头部意图变化并优化路由。`
  ));

  dimensions.push(buildDimension(
    '知识治理',
    skillsCount + rulesCount + evalFiles,
    0,
    (inputs) => scoreByRatio((inputs?.skillsCount ?? 0) + (inputs?.rulesCount ?? 0) + (inputs?.evalFiles ?? 0), 60),
    {
      formula_text: 'score = clamp(round((skillsCount + iscRulesCount + evalsetFileCount)/60*5),1,5)',
      skillsCount,
      rulesCount,
      evalFiles,
      target: 60
    },
    ({ inputs, score }) => score < 3
      ? `治理资产偏少（skills=${inputs.skillsCount}, rules=${inputs.rulesCount}, eval=${inputs.evalFiles}），建议优先补规则和评测集。`
      : `治理资产规模可用，建议继续提升规则质量与评测覆盖。`
  ));

  dimensions.push(buildDimension(
    '进化',
    commits24h + pdcaToday,
    pdcaYest,
    (inputs) => scoreByRatio((inputs?.commits24h ?? 0) + (inputs?.pdcaToday ?? 0), 8),
    {
      formula_text: 'score = clamp(round((commit24h + pdcaToday)/8*5),1,5)',
      commits24h,
      pdcaToday,
      target: 8
    },
    ({ inputs, score }) => score < 3
      ? `进化速度偏慢（commit24h=${inputs.commits24h}, pdca=${inputs.pdcaToday}），建议增加闭环迭代与PDCA复盘。`
      : `进化节奏良好，保持代码迭代与PDCA双轮驱动。`
  ));

  const actionCount = appendActionItems(today, dimensions);
  const briefFile = generateBrief(today, dimensions, actionCount);

  const reportFile = path.join(REPORT_DIR, `cras-daily-${today}.json`);
  fs.writeFileSync(reportFile, JSON.stringify({
    date: today,
    timezone: 'Asia/Shanghai',
    dimensions,
    action_items_added: actionCount,
    brief_file: briefFile,
    generated_at: new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).replace(' ', 'T')
  }, null, 2));

  if (fs.existsSync(path.dirname(EVENT_BUS))) {
    fs.appendFileSync(EVENT_BUS, JSON.stringify({
      type: 'cras.daily.aggregation_complete',
      source: 'cras-daily-aggregator',
      timestamp: new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).replace(' ', 'T'),
      data: { date: today, report: reportFile, brief: briefFile, action_items_added: actionCount }
    }) + '\n');
  }

  console.log(`[CRAS] done: ${reportFile}`);
  console.log(`[CRAS] brief: ${briefFile}`);
  console.log(`[CRAS] action-items added: ${actionCount}`);
}

if (require.main === module) {
  main();
}

module.exports = { main };
