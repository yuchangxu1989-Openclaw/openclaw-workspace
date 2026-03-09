#!/usr/bin/env node
/**
 * PDCA Check Loop Engine v2.0
 * 
 * 完整的PDCA Check→差距分析→告警推送→趋势记录 循环引擎
 * 每次运行：度量采集 → 基准对比 → 差距分析 → 告警推送 → 历史追加
 * 
 * Usage: node check-loop.js [--dry-run] [--no-alert]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const WORKSPACE = '/root/.openclaw/workspace';
const REPORTS_DIR = path.join(WORKSPACE, 'reports');
const REPORT_PATH = path.join(REPORTS_DIR, 'pdca-check-latest.json');
const HISTORY_PATH = path.join(REPORTS_DIR, 'pdca-check-history.jsonl');
const STANDARDS_PATH = path.join(__dirname, 'check-standards.json');
const LOG_DIR = path.join(WORKSPACE, 'infrastructure/logs');
const LOG_PATH = path.join(LOG_DIR, 'pdca-check.log');
const CONCURRENCY_LIMIT = 19;

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const NO_ALERT = args.includes('--no-alert');

// --- Load dynamic standards ---
function loadStandards() {
  try {
    return JSON.parse(fs.readFileSync(STANDARDS_PATH, 'utf8')).metrics;
  } catch (e) {
    log(`⚠️  Failed to load standards from ${STANDARDS_PATH}, using defaults: ${e.message}`);
    return {
      concurrencyUtil:   { target: 0.60, direction: 'gte', warnThreshold: 0.40 },
      timeoutRate:       { target: 0.10, direction: 'lte', warnThreshold: 0.20 },
      taskSplitDegree:   { target: 3,    direction: 'gte', warnThreshold: 2 },
      ruleExpansionRate: { target: 0.50, direction: 'gte', warnThreshold: 0.25 },
      badcaseAutoRate:   { target: null, direction: 'gte', warnThreshold: null },
    };
  }
}

// --- Logging ---
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.error(line);
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_PATH, line + '\n');
  } catch {}
}

// --- Helpers ---
function readJsonSafe(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

function findJsonFiles(dir, pattern) {
  try { return fs.readdirSync(dir).filter(f => f.match(pattern)).map(f => path.join(dir, f)); } catch { return []; }
}

function status(actual, cfg) {
  if (cfg.target === null) return 'info';
  const ok = cfg.direction === 'gte' ? actual >= cfg.target : actual <= cfg.target;
  if (ok) return 'ok';
  const warn = cfg.direction === 'gte'
    ? (cfg.warnThreshold !== null && actual >= cfg.warnThreshold)
    : (cfg.warnThreshold !== null && actual <= cfg.warnThreshold);
  return warn ? 'warn' : 'critical';
}

function gapValue(actual, target, direction) {
  if (target === null) return null;
  return direction === 'gte' ? +(actual - target).toFixed(4) : +(target - actual).toFixed(4);
}

// --- Metric collectors (same as v1) ---
function measureConcurrency() {
  // Primary source: subagent-task-board.json — count tasks spawned in the last hour
  const taskBoardPath = path.join(WORKSPACE, 'logs/subagent-task-board.json');
  const board = readJsonSafe(taskBoardPath);
  const oneHourAgo = Date.now() - 3600_000;
  let recentTaskCount = 0;

  if (board) {
    const tasks = Array.isArray(board) ? board : (board.tasks || []);
    for (const t of tasks) {
      const spawn = t.spawnTime || t.startedAt || t.created || t.timestamp;
      if (spawn && new Date(spawn).getTime() >= oneHourAgo) recentTaskCount++;
    }
  }

  // Fallback: legacy board files and LEP reports
  if (recentTaskCount === 0) {
    const candidates = [
      path.join(WORKSPACE, 'task-board.json'),
      path.join(WORKSPACE, 'skills/pdca-engine/task-board.json'),
    ];
    for (const c of candidates) {
      const b = readJsonSafe(c);
      if (!b) continue;
      const tasks = Array.isArray(b) ? b : (b.tasks || []);
      for (const t of tasks) {
        if ((t.status === 'running' || t.state === 'running')) recentTaskCount++;
      }
      if (recentTaskCount > 0) break;
    }
  }
  if (recentTaskCount === 0) {
    const lepFiles = findJsonFiles(REPORTS_DIR, /^lep-daily-report.*\.json$/);
    if (lepFiles.length > 0) {
      const latest = readJsonSafe(lepFiles[lepFiles.length - 1]);
      if (latest) recentTaskCount = latest.peakConcurrency || latest.peak_running || latest.activeTasks || 0;
    }
  }
  return { actual: +(recentTaskCount / CONCURRENCY_LIMIT).toFixed(4), recentTaskCount, limit: CONCURRENCY_LIMIT };
}

function measureTimeoutRate() {
  let timeouts = 0, total = 0;
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
  for (const dateStr of [today, yesterday]) {
    const lep = readJsonSafe(path.join(REPORTS_DIR, `lep-daily-report-${dateStr}.json`));
    if (lep) { timeouts += lep.timeouts || lep.timeout_count || 0; total += lep.totalTasks || lep.total || 0; }
  }
  const harvestFiles = findJsonFiles(REPORTS_DIR, /^correction-harvest.*\.md$/);
  const reworkFiles = findJsonFiles(REPORTS_DIR, /^rework-analysis.*\.md$/);
  const twentyFourHoursAgo = Date.now() - 86400_000;
  for (const f of [...harvestFiles, ...reworkFiles]) {
    try {
      const content = fs.readFileSync(f, 'utf8');
      const dateMatch = f.match(/(\d{4}-\d{2}-\d{2})/);
      if (dateMatch && new Date(dateMatch[1]).getTime() < twentyFourHoursAgo) continue;
      const timeoutMatches = content.match(/timeout/gi);
      if (timeoutMatches && total === 0) {
        timeouts += timeoutMatches.length;
        const taskMatches = content.match(/task|任务/gi);
        total += taskMatches ? taskMatches.length : timeoutMatches.length * 5;
      }
    } catch {}
  }
  if (total === 0) total = 1;
  return { actual: +(timeouts / total).toFixed(4), timeouts, total };
}

function measureTaskSplitDegree() {
  // Primary: read subagent-task-board.json, group tasks spawned in last hour by parent/wave
  const taskBoardPath = path.join(WORKSPACE, 'logs/subagent-task-board.json');
  const board = readJsonSafe(taskBoardPath);
  const oneHourAgo = Date.now() - 3600_000;

  if (board) {
    const tasks = Array.isArray(board) ? board : (board.tasks || []);
    const recentTasks = tasks.filter(t => {
      const spawn = t.spawnTime || t.startedAt || t.created || t.timestamp;
      return spawn && new Date(spawn).getTime() >= oneHourAgo;
    });

    if (recentTasks.length > 0) {
      // Group by parentId or by 5-minute time windows as proxy for dispatch waves
      const waves = new Map();
      for (const t of recentTasks) {
        const spawn = new Date(t.spawnTime || t.startedAt || t.created || t.timestamp).getTime();
        const waveKey = t.parentId || String(Math.floor(spawn / 300_000)); // 5-min buckets
        if (!waves.has(waveKey)) waves.set(waveKey, 0);
        waves.set(waveKey, waves.get(waveKey) + 1);
      }
      const dispatchWaves = waves.size;
      const totalSubtasks = recentTasks.length;
      return { actual: +(totalSubtasks / dispatchWaves).toFixed(2), totalSubtasks, dispatchWaves };
    }
  }

  // Fallback: LEP reports and dispatch files
  let totalSubtasks = 0, dispatchWaves = 0;
  const today = new Date().toISOString().slice(0, 10);
  const lep = readJsonSafe(path.join(REPORTS_DIR, `lep-daily-report-${today}.json`));
  if (lep) { totalSubtasks = lep.subtasksDispatched || lep.subtasks || 0; dispatchWaves = lep.dispatchWaves || lep.waves || 0; }
  if (dispatchWaves === 0) {
    const dispatchFiles = findJsonFiles(REPORTS_DIR, /dispatch/i);
    for (const f of dispatchFiles.slice(-5)) {
      try {
        const content = fs.readFileSync(f, 'utf8');
        const matches = content.match(/(\d+)\s*(subtask|子任务|sub-agent|subagent)/gi);
        if (matches) { dispatchWaves++; for (const m of matches) { const num = parseInt(m); if (!isNaN(num)) totalSubtasks += num; } }
      } catch {}
    }
  }
  return { actual: +(dispatchWaves > 0 ? totalSubtasks / dispatchWaves : 0).toFixed(2), totalSubtasks, dispatchWaves };
}

function measureRuleExpansion() {
  // Primary: scan actual rule JSON files for fullchain_status
  const rulesDir = path.join(WORKSPACE, 'skills/isc-core/rules');
  let totalRules = 0;
  let expandedRules = 0;
  try {
    const files = fs.readdirSync(rulesDir).filter(f => f.endsWith('.json'));
    for (const f of files) {
      try {
        const rule = JSON.parse(fs.readFileSync(path.join(rulesDir, f), 'utf8'));
        totalRules++;
        if (rule.fullchain_status === 'expanded') expandedRules++;
      } catch {}
    }
  } catch {}

  // Fallback if no rules found
  if (totalRules === 0) {
    totalRules = 182;
    for (const f of ['isc-full-scan.txt', 'isc-programmatic-gap-report.md', 'isc-enforcement-audit.md'].map(n => path.join(REPORTS_DIR, n))) {
      try {
        const content = fs.readFileSync(f, 'utf8');
        const expandedMatch = content.match(/(\d+)\s*(rules?\s*(expanded|enforced|implemented|active)|(展开|实施|激活))/i);
        if (expandedMatch) { const n = parseInt(expandedMatch[1]); if (n > expandedRules && n <= totalRules) expandedRules = n; }
        const pctMatch = content.match(/([\d.]+)%\s*(coverage|覆盖|展开)/i);
        if (pctMatch) { const implied = Math.round(parseFloat(pctMatch[1]) / 100 * totalRules); if (implied > expandedRules) expandedRules = implied; }
      } catch {}
    }
    const hardGate = readJsonSafe(path.join(REPORTS_DIR, 'isc-hard-gate-fullsystem-test.json'));
    if (hardGate) { const passed = hardGate.passed || hardGate.enforced || 0; if (passed > expandedRules) expandedRules = passed; }
  }

  return { actual: +(expandedRules / totalRules).toFixed(4), expandedRules, totalRules };
}

function measureBadcaseAutoRate() {
  let autoCaptured = 0, userCorrections = 0;
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
  for (const dateStr of [today, yesterday]) {
    try {
      const content = fs.readFileSync(path.join(REPORTS_DIR, `correction-harvest-${dateStr}.md`), 'utf8');
      const autoMatches = content.match(/自动|auto|automated/gi);
      const corrMatches = content.match(/纠偏|correction|用户.*修正|user.*fix/gi);
      autoCaptured += autoMatches ? autoMatches.length : 0;
      userCorrections += corrMatches ? corrMatches.length : 0;
    } catch {}
  }
  try {
    const files = fs.readdirSync(REPORTS_DIR).filter(f => f.match(/eval-badcase-index/));
    for (const f of files.slice(-1)) {
      const content = fs.readFileSync(path.join(REPORTS_DIR, f), 'utf8');
      const countMatch = content.match(/(\d+)\s*(badcase|坏案例)/i);
      if (countMatch) autoCaptured = Math.max(autoCaptured, parseInt(countMatch[1]));
    }
  } catch {}
  if (userCorrections === 0) userCorrections = 1;
  return { actual: +(autoCaptured / userCorrections).toFixed(4), autoCaptured, userCorrections };
}

// --- Gap Analysis ---
function analyzeGap(metricKey, label, actual, target, direction, st) {
  if (target === null) return null;
  const gap = gapValue(actual, target, direction);
  if (st === 'ok') return null;
  
  const suggestions = {
    concurrencyUtil: [
      '增加任务拆分粒度，让更多子任务并行',
      '检查是否有阻塞性依赖导致串行执行',
      '优化dispatch策略，提前预取下一批任务',
    ],
    timeoutRate: [
      '分析超时任务的共性，是否为特定类型任务',
      '考虑增加超时阈值或优化慢任务的执行路径',
      '检查是否有外部依赖(API/网络)导致超时',
    ],
    taskSplitDegree: [
      '复杂任务应至少拆分为3个独立子任务',
      '引入自动拆分策略，基于任务复杂度评估',
      '参考ISC规则中的任务分解最佳实践',
    ],
    ruleExpansionRate: [
      '优先展开高权重治理规则',
      '建立规则展开的自动化pipeline',
      '每次Check后自动识别下一批应展开的规则',
    ],
  };

  return {
    metric: metricKey,
    label,
    severity: st,
    actual,
    target,
    gap,
    gapDescription: direction === 'gte'
      ? `${label}当前${actual}，距目标${target}还差${Math.abs(gap).toFixed(4)}，需提升${(Math.abs(gap) / target * 100).toFixed(1)}%`
      : `${label}当前${actual}，超出目标${target}达${Math.abs(gap).toFixed(4)}，需降低${(Math.abs(gap) / actual * 100).toFixed(1)}%`,
    suggestions: suggestions[metricKey] || ['需要进一步分析根因'],
  };
}

// --- Alert via openclaw cron (one-shot) ---
function sendAlert(gapAnalyses) {
  if (NO_ALERT || DRY_RUN || gapAnalyses.length === 0) return;
  
  const criticals = gapAnalyses.filter(g => g.severity === 'critical');
  const warns = gapAnalyses.filter(g => g.severity === 'warn');
  
  if (criticals.length === 0 && warns.length === 0) return;

  let alertMsg = '';
  if (criticals.length > 0) {
    alertMsg += `🔴 PDCA Check发现${criticals.length}个critical指标，需要立即行动：\n`;
    for (const g of criticals) {
      alertMsg += `\n• ${g.label}：${g.gapDescription}\n  建议：${g.suggestions[0]}`;
    }
  }
  if (warns.length > 0) {
    alertMsg += `\n🟡 另有${warns.length}个warn指标需关注：\n`;
    for (const g of warns) {
      alertMsg += `\n• ${g.label}：${g.gapDescription}`;
    }
  }
  alertMsg += '\n\n📊 详细报告：reports/pdca-check-latest.json';

  // Use openclaw cron add --at +0s to send a one-shot message to main session
  try {
    const escaped = alertMsg.replace(/'/g, "'\\''");
    execSync(`openclaw cron add --name "pdca-alert-$(date +%s)" --at +0s --delete-after-run --session main --message '${escaped}' --light-context --no-deliver`, {
      timeout: 15000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    log('✅ Alert sent via openclaw cron one-shot');
  } catch (e) {
    log(`⚠️  Alert send failed: ${e.message}`);
    // Fallback: just log it
    log(`ALERT: ${alertMsg}`);
  }
}

// --- Append to history ---
function appendHistory(report) {
  try {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
    const entry = JSON.stringify({
      timestamp: report.timestamp,
      summary: report.summary,
      metrics: Object.fromEntries(
        Object.entries(report.metrics).map(([k, v]) => [k, { actual: v.actual, status: v.status, gap: v.gap }])
      ),
    });
    fs.appendFileSync(HISTORY_PATH, entry + '\n');
    log(`📈 History appended to ${HISTORY_PATH}`);
  } catch (e) {
    log(`⚠️  History append failed: ${e.message}`);
  }
}

// --- Main ---
function run() {
  log('🔄 PDCA Check Loop starting...');
  const timestamp = new Date().toISOString();
  const standards = loadStandards();
  
  // Collect metrics
  const collectors = {
    concurrencyUtil: measureConcurrency,
    timeoutRate: measureTimeoutRate,
    taskSplitDegree: measureTaskSplitDegree,
    ruleExpansionRate: measureRuleExpansion,
    badcaseAutoRate: measureBadcaseAutoRate,
  };

  const metrics = {};
  const gapAnalyses = [];

  for (const [key, collector] of Object.entries(collectors)) {
    const std = standards[key] || { target: null, direction: 'gte', warnThreshold: null };
    const measurement = collector();
    const st = status(measurement.actual, std);
    const gap = gapValue(measurement.actual, std.target, std.direction);
    
    metrics[key] = {
      label: std.label || key,
      actual: measurement.actual,
      target: std.target,
      gap,
      status: st,
      detail: measurement,
    };

    const gapAnalysis = analyzeGap(key, std.label || key, measurement.actual, std.target, std.direction, st);
    if (gapAnalysis) gapAnalyses.push(gapAnalysis);
  }

  // Build report
  const statuses = Object.values(metrics).map(m => m.status);
  const report = {
    timestamp,
    version: '2.0.0',
    metrics,
    gapAnalysis: gapAnalyses,
    summary: {
      total: statuses.length,
      ok: statuses.filter(s => s === 'ok').length,
      warn: statuses.filter(s => s === 'warn').length,
      critical: statuses.filter(s => s === 'critical').length,
      info: statuses.filter(s => s === 'info').length,
      overallHealth: statuses.includes('critical') ? 'critical' : statuses.includes('warn') ? 'warn' : 'ok',
    },
  };

  // Output
  const json = JSON.stringify(report, null, 2);
  console.log(json);

  // Write latest report
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.writeFileSync(REPORT_PATH, json, 'utf8');
  log(`✅ Report written to ${REPORT_PATH}`);

  // Append history
  appendHistory(report);

  // Send alert if needed
  if (report.summary.critical > 0 || report.summary.warn > 0) {
    sendAlert(gapAnalyses);
  }

  log(`🏁 PDCA Check complete: ${report.summary.overallHealth} (${report.summary.critical}C/${report.summary.warn}W/${report.summary.ok}OK/${report.summary.info}I)`);
}

run();
