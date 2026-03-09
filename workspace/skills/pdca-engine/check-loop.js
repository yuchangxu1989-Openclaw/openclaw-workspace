#!/usr/bin/env node
/**
 * PDCA Check Loop — 度量采集 & 基准对比
 * 
 * 从现有数据源采集5个核心指标，与目标基准对比，
 * 输出JSON报告到 stdout + /root/.openclaw/workspace/reports/pdca-check-latest.json
 */

const fs = require('fs');
const path = require('path');

const WORKSPACE = '/root/.openclaw/workspace';
const REPORTS_DIR = path.join(WORKSPACE, 'reports');
const REPORT_PATH = path.join(REPORTS_DIR, 'pdca-check-latest.json');
const CONCURRENCY_LIMIT = 19;

// --- Targets ---
const TARGETS = {
  concurrencyUtil:   { target: 0.60, direction: 'gte', warnThreshold: 0.40 },
  timeoutRate:       { target: 0.10, direction: 'lte', warnThreshold: 0.20 },
  taskSplitDegree:   { target: 3,    direction: 'gte', warnThreshold: 2 },
  ruleExpansionRate: { target: 0.50, direction: 'gte', warnThreshold: 0.25 },
  badcaseAutoRate:   { target: null, direction: 'gte', warnThreshold: null }, // informational
};

// --- Helpers ---
function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch { return null; }
}

function findJsonFiles(dir, pattern) {
  try {
    return fs.readdirSync(dir)
      .filter(f => f.match(pattern))
      .map(f => path.join(dir, f));
  } catch { return []; }
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

function gap(actual, target, direction) {
  if (target === null) return null;
  return direction === 'gte' ? +(actual - target).toFixed(4) : +(target - actual).toFixed(4);
}

// --- Metric 1: 并发利用率 ---
function measureConcurrency() {
  // Look for task-board.json in common locations
  const candidates = [
    path.join(WORKSPACE, 'task-board.json'),
    path.join(WORKSPACE, 'reports/task-queue'),
    path.join(WORKSPACE, 'skills/pdca-engine/task-board.json'),
  ];
  
  let board = null;
  for (const c of candidates) {
    board = readJsonSafe(c);
    if (board) break;
  }

  // Also try lep daily reports for running task counts
  const lepFiles = findJsonFiles(REPORTS_DIR, /^lep-daily-report.*\.json$/);
  
  let peakRunning = 0;
  const oneHourAgo = Date.now() - 3600_000;

  if (board) {
    // If board has tasks array with status and timestamps
    const tasks = Array.isArray(board) ? board : (board.tasks || []);
    const runningAtTime = {};
    
    for (const t of tasks) {
      if (t.status === 'running' || t.state === 'running') {
        const start = t.startedAt || t.created || t.timestamp;
        if (start && new Date(start).getTime() >= oneHourAgo) {
          peakRunning++;
        }
      }
    }
  }

  // Fallback: check LEP reports for concurrency data
  if (peakRunning === 0 && lepFiles.length > 0) {
    const latest = readJsonSafe(lepFiles[lepFiles.length - 1]);
    if (latest) {
      peakRunning = latest.peakConcurrency || latest.peak_running || latest.activeTasks || 0;
    }
  }

  const util = peakRunning / CONCURRENCY_LIMIT;
  return { actual: +util.toFixed(4), peakRunning, limit: CONCURRENCY_LIMIT };
}

// --- Metric 2: 任务超时率 ---
function measureTimeoutRate() {
  const twentyFourHoursAgo = Date.now() - 86400_000;
  let timeouts = 0;
  let total = 0;

  // Check correction harvest files for timeout mentions
  const harvestFiles = findJsonFiles(REPORTS_DIR, /^correction-harvest.*\.md$/);
  
  // Check rework analysis files
  const reworkFiles = findJsonFiles(REPORTS_DIR, /^rework-analysis.*\.md$/);
  
  // Check timeout-specific reports
  const timeoutFiles = findJsonFiles(REPORTS_DIR, /timeout/i);

  // Try LEP daily reports
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
  
  for (const dateStr of [today, yesterday]) {
    const lep = readJsonSafe(path.join(REPORTS_DIR, `lep-daily-report-${dateStr}.json`));
    if (lep) {
      timeouts += lep.timeouts || lep.timeout_count || 0;
      total += lep.totalTasks || lep.total || 0;
    }
  }

  // Scan correction harvest markdown for timeout counts
  for (const f of [...harvestFiles, ...reworkFiles]) {
    try {
      const content = fs.readFileSync(f, 'utf8');
      const dateMatch = f.match(/(\d{4}-\d{2}-\d{2})/);
      if (dateMatch) {
        const fileDate = new Date(dateMatch[1]);
        if (fileDate.getTime() < twentyFourHoursAgo) continue;
      }
      const timeoutMatches = content.match(/timeout/gi);
      if (timeoutMatches && total === 0) {
        timeouts += timeoutMatches.length;
        // Rough estimate of total from content
        const taskMatches = content.match(/task|任务/gi);
        total += taskMatches ? taskMatches.length : timeoutMatches.length * 5;
      }
    } catch {}
  }

  if (total === 0) total = 1; // avoid division by zero
  const rate = timeouts / total;
  return { actual: +rate.toFixed(4), timeouts, total };
}

// --- Metric 3: 任务拆分度 ---
function measureTaskSplitDegree() {
  let totalSubtasks = 0;
  let dispatchWaves = 0;

  // Check dispatch-related reports
  const dispatchFiles = findJsonFiles(REPORTS_DIR, /dispatch/i);
  
  // Check LEP reports for split info
  const today = new Date().toISOString().slice(0, 10);
  const lep = readJsonSafe(path.join(REPORTS_DIR, `lep-daily-report-${today}.json`));
  if (lep) {
    totalSubtasks = lep.subtasksDispatched || lep.subtasks || 0;
    dispatchWaves = lep.dispatchWaves || lep.waves || 0;
  }

  // Scan dispatch reports for subtask counts
  if (dispatchWaves === 0) {
    for (const f of dispatchFiles.slice(-5)) {
      try {
        const content = fs.readFileSync(f, 'utf8');
        // Look for patterns like "dispatched N subtasks" or similar
        const matches = content.match(/(\d+)\s*(subtask|子任务|sub-agent|subagent)/gi);
        if (matches) {
          dispatchWaves++;
          for (const m of matches) {
            const num = parseInt(m);
            if (!isNaN(num)) totalSubtasks += num;
          }
        }
      } catch {}
    }
  }

  const degree = dispatchWaves > 0 ? totalSubtasks / dispatchWaves : 0;
  return { actual: +degree.toFixed(2), totalSubtasks, dispatchWaves };
}

// --- Metric 4: ISC规则展开率 ---
function measureRuleExpansion() {
  const totalRules = 182;
  let expandedRules = 0;

  // Check ISC scan results
  const iscScan = path.join(REPORTS_DIR, 'isc-full-scan.txt');
  const iscReport = path.join(REPORTS_DIR, 'isc-programmatic-gap-report.md');
  const iscAudit = path.join(REPORTS_DIR, 'isc-enforcement-audit.md');

  for (const f of [iscScan, iscReport, iscAudit]) {
    try {
      const content = fs.readFileSync(f, 'utf8');
      // Look for expanded/enforced rule counts
      const expandedMatch = content.match(/(\d+)\s*(rules?\s*(expanded|enforced|implemented|active)|(展开|实施|激活))/i);
      if (expandedMatch) {
        const n = parseInt(expandedMatch[1]);
        if (n > expandedRules && n <= totalRules) expandedRules = n;
      }
      // Also check for coverage percentage
      const pctMatch = content.match(/([\d.]+)%\s*(coverage|覆盖|展开)/i);
      if (pctMatch) {
        const pct = parseFloat(pctMatch[1]);
        const implied = Math.round(pct / 100 * totalRules);
        if (implied > expandedRules) expandedRules = implied;
      }
    } catch {}
  }

  // Check ISC hard gate test results
  const hardGate = readJsonSafe(path.join(REPORTS_DIR, 'isc-hard-gate-fullsystem-test.json'));
  if (hardGate) {
    const passed = hardGate.passed || hardGate.enforced || 0;
    if (passed > expandedRules) expandedRules = passed;
  }

  const rate = expandedRules / totalRules;
  return { actual: +rate.toFixed(4), expandedRules, totalRules };
}

// --- Metric 5: Badcase自动采集率 ---
function measureBadcaseAutoRate() {
  let autoCaptured = 0;
  let userCorrections = 0;

  // Check correction harvest files
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);

  for (const dateStr of [today, yesterday]) {
    const harvestFile = path.join(REPORTS_DIR, `correction-harvest-${dateStr}.md`);
    try {
      const content = fs.readFileSync(harvestFile, 'utf8');
      // Count auto-captured vs user corrections
      const autoMatches = content.match(/自动|auto|automated/gi);
      const corrMatches = content.match(/纠偏|correction|用户.*修正|user.*fix/gi);
      autoCaptured += autoMatches ? autoMatches.length : 0;
      userCorrections += corrMatches ? corrMatches.length : 0;
    } catch {}
  }

  // Check badcase index
  const badcaseIndex = path.join(REPORTS_DIR, 'eval-badcase-index-update-2026-03-08.md');
  try {
    const content = fs.readFileSync(badcaseIndex, 'utf8');
    const countMatch = content.match(/(\d+)\s*(badcase|坏案例)/i);
    if (countMatch) autoCaptured = Math.max(autoCaptured, parseInt(countMatch[1]));
  } catch {}

  if (userCorrections === 0) userCorrections = 1;
  const rate = autoCaptured / userCorrections;
  return { actual: +rate.toFixed(4), autoCaptured, userCorrections };
}

// --- Main ---
function run() {
  const timestamp = new Date().toISOString();
  
  const concurrency = measureConcurrency();
  const timeout = measureTimeoutRate();
  const split = measureTaskSplitDegree();
  const ruleExpansion = measureRuleExpansion();
  const badcase = measureBadcaseAutoRate();

  const report = {
    timestamp,
    version: '1.0.0',
    metrics: {
      concurrencyUtil: {
        label: '并发利用率',
        actual: concurrency.actual,
        target: TARGETS.concurrencyUtil.target,
        gap: gap(concurrency.actual, TARGETS.concurrencyUtil.target, 'gte'),
        status: status(concurrency.actual, TARGETS.concurrencyUtil),
        detail: { peakRunning: concurrency.peakRunning, limit: concurrency.limit },
      },
      timeoutRate: {
        label: '任务超时率',
        actual: timeout.actual,
        target: TARGETS.timeoutRate.target,
        gap: gap(timeout.actual, TARGETS.timeoutRate.target, 'lte'),
        status: status(timeout.actual, TARGETS.timeoutRate),
        detail: { timeouts: timeout.timeouts, total: timeout.total },
      },
      taskSplitDegree: {
        label: '任务拆分度',
        actual: split.actual,
        target: TARGETS.taskSplitDegree.target,
        gap: gap(split.actual, TARGETS.taskSplitDegree.target, 'gte'),
        status: status(split.actual, TARGETS.taskSplitDegree),
        detail: { totalSubtasks: split.totalSubtasks, dispatchWaves: split.dispatchWaves },
      },
      ruleExpansionRate: {
        label: 'ISC规则展开率',
        actual: ruleExpansion.actual,
        target: TARGETS.ruleExpansionRate.target,
        gap: gap(ruleExpansion.actual, TARGETS.ruleExpansionRate.target, 'gte'),
        status: status(ruleExpansion.actual, TARGETS.ruleExpansionRate),
        detail: { expandedRules: ruleExpansion.expandedRules, totalRules: ruleExpansion.totalRules },
      },
      badcaseAutoRate: {
        label: 'Badcase自动采集率',
        actual: badcase.actual,
        target: null,
        gap: null,
        status: 'info',
        detail: { autoCaptured: badcase.autoCaptured, userCorrections: badcase.userCorrections },
      },
    },
    summary: {},
  };

  // Compute summary
  const metricValues = Object.values(report.metrics);
  const statuses = metricValues.map(m => m.status);
  report.summary = {
    total: metricValues.length,
    ok: statuses.filter(s => s === 'ok').length,
    warn: statuses.filter(s => s === 'warn').length,
    critical: statuses.filter(s => s === 'critical').length,
    info: statuses.filter(s => s === 'info').length,
    overallHealth: statuses.includes('critical') ? 'critical' : statuses.includes('warn') ? 'warn' : 'ok',
  };

  // Output
  const json = JSON.stringify(report, null, 2);
  console.log(json);

  // Write to file
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.writeFileSync(REPORT_PATH, json, 'utf8');
  console.error(`\n✅ Report written to ${REPORT_PATH}`);
}

run();
