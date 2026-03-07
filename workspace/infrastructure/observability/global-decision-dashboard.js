'use strict';

/**
 * Global Autonomous Decision Pipeline Dashboard
 *
 * Day2 Gap2 主实现：打通认知-决策-执行-效果-系统健康五层监控汇总。
 * 聚合来源：
 *   - infrastructure/decision-log/decisions.jsonl        (认知/决策/执行决策日志)
 *   - infrastructure/pipeline/run-log.jsonl             (pipeline 运行记录，含 dispatched_actions)
 *   - infrastructure/logs/dispatcher-actions.jsonl      (分发动作明细)
 *   - infrastructure/observability/metrics.jsonl        (历史指标快照，累计聚合)
 *   - infrastructure/observability/metrics.js           (运行时内存指标，可选)
 *   - infrastructure/cron/fallback-sweep.js             (L3 health)
 *   - infrastructure/logs/auto-response.jsonl           (效果层：自动响应)
 *   - infrastructure/logs/health.jsonl                  (系统健康采样)
 *
 * 修复说明 (Gap2 统计口径收口):
 *   1. execution 层不再只依赖进程内存指标(dispatch_total=0即critical)，
 *      而是优先从 pipeline/run-log.jsonl 和 dispatcher-actions.jsonl 读取历史执行数据。
 *   2. metrics.jsonl 历史快照做累计聚合，不再用时间窗过滤快照文件本身。
 *   3. auto-response / health 日志宽松化窗口：若24h内无数据则扩展到72h兜底。
 *   4. phaseStatus 对 total>0 但 successRate=0 时区分"有运行有错误" vs "无运行"。
 *   5. 执行层引入 dispatch_errors（分发错误率）作为辅助状态判断依据。
 *
 * 输出：
 *   - JSON summary
 *   - Markdown dashboard
 *
 * @module infrastructure/observability/global-decision-dashboard
 */

const fs = require('fs');
const path = require('path');

const WORKSPACE = path.resolve(__dirname, '..', '..');
const REPORTS_DIR = path.join(WORKSPACE, 'reports', 'autonomy');
const JSON_REPORT = path.join(REPORTS_DIR, 'global-decision-dashboard.json');
const MD_REPORT = path.join(REPORTS_DIR, 'global-decision-dashboard.md');
const AUTO_RESPONSE_LOG = path.join(WORKSPACE, 'infrastructure', 'logs', 'auto-response.jsonl');
const SYSTEM_HEALTH_LOG = path.join(WORKSPACE, 'infrastructure', 'logs', 'health.jsonl');
const PIPELINE_RUN_LOG = path.join(WORKSPACE, 'infrastructure', 'pipeline', 'run-log.jsonl');
const DISPATCHER_ACTIONS_LOG = path.join(WORKSPACE, 'infrastructure', 'logs', 'dispatcher-actions.jsonl');
const METRICS_JSONL = path.join(WORKSPACE, 'infrastructure', 'observability', 'metrics.jsonl');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, 'utf8').trim();
  if (!text) return [];
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      try {
        return JSON.parse(line);
      } catch (_) {
        return null;
      }
    })
    .filter(Boolean);
}

function withinHours(recordTime, hours) {
  const ts = new Date(recordTime).getTime();
  if (!Number.isFinite(ts)) return false;
  return ts >= Date.now() - hours * 3600_000;
}

/**
 * 宽松过滤：优先取 primaryHours 窗口内数据，
 * 若为空则扩展到 fallbackHours，避免日志稀疏时全部清零。
 */
function filterWithFallback(records, getTime, primaryHours, fallbackHours = 72) {
  const primary = records.filter(r => withinHours(getTime(r), primaryHours));
  if (primary.length > 0) return { records: primary, actual_hours: primaryHours };
  const fallback = records.filter(r => withinHours(getTime(r), fallbackHours));
  return { records: fallback, actual_hours: fallback.length > 0 ? fallbackHours : primaryHours };
}

function loadDecisionLogger() {
  try {
    return require('../decision-log/decision-logger');
  } catch (_) {
    return null;
  }
}

function loadMetrics() {
  try {
    return require('./metrics');
  } catch (_) {
    return null;
  }
}

function loadFallbackSweep() {
  try {
    return require('../cron/fallback-sweep');
  } catch (_) {
    return null;
  }
}

function rate(numerator, denominator) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 10000) / 100;
}

/**
 * 从 metrics.jsonl 历史快照中做累计聚合。
 * 因 metrics 在进程重启时清零，单个快照不代表全量，
 * 取所有快照中的最大值作为保守下界（适合累计型计数器）。
 */
function aggregateMetricsFromJsonl() {
  const snapshots = readJsonl(METRICS_JSONL);
  if (!snapshots.length) return null;

  // 对 cumulative counter 字段：取各快照最大值之和（跨重启累计）
  // 同一重启周期内快照是递增的，重启后从0重新开始
  // 策略：取连续单调递增序列各自的末值，再求和
  function sumAcrossRestarts(field) {
    let total = 0;
    let prev = -1;
    let segmentMax = 0;
    for (const snap of snapshots) {
      const v = snap[field] || 0;
      if (v < prev) {
        // 重启了，把上一段的峰值计入
        total += segmentMax;
        segmentMax = v;
      } else {
        segmentMax = v;
      }
      prev = v;
    }
    total += segmentMax;
    return total;
  }

  return {
    dispatch_total: sumAcrossRestarts('dispatch_total'),
    dispatch_success: sumAcrossRestarts('dispatch_success'),
    dispatch_failed: sumAcrossRestarts('dispatch_failed'),
    dispatch_timeout: sumAcrossRestarts('dispatch_timeout'),
    dispatch_retry: sumAcrossRestarts('dispatch_retry'),
    events_emitted_total: sumAcrossRestarts('events_emitted_total'),
    events_processed_total: sumAcrossRestarts('events_processed_total'),
    events_dropped_total: sumAcrossRestarts('events_dropped_total'),
    pipeline_runs_total: sumAcrossRestarts('pipeline_runs_total'),
    // latency: take the most recent non-zero value
    dispatch_latency_avg_ms: snapshots.reduceRight((acc, s) => acc || (s.dispatch_latency_avg_ms || 0), 0),
    snapshot_count: snapshots.length,
    source: 'metrics.jsonl',
  };
}

/**
 * 从 pipeline/run-log.jsonl 聚合执行层数据（最可靠的历史来源）。
 */
function aggregateFromRunLog(hours) {
  const all = readJsonl(PIPELINE_RUN_LOG);
  const { records, actual_hours } = filterWithFallback(
    all,
    r => r.timestamp || 0,
    hours,
    hours * 3
  );

  const totalRuns = records.length;
  const skipped = records.filter(r => r.skipped).length;
  const activeRuns = totalRuns - skipped;
  const totalConsumed = records.reduce((s, r) => s + (r.consumed_events || 0), 0);
  const totalMatched = records.reduce((s, r) => s + (r.matched_rules || 0), 0);
  const totalDispatched = records.reduce((s, r) => s + (r.dispatched_actions || 0), 0);
  const totalErrors = records.reduce((s, r) => s + (r.errors || []).length, 0);
  const runsWithErrors = records.filter(r => (r.errors || []).length > 0).length;
  const circuitBreaks = records.reduce((s, r) => s + (r.circuit_breaks || 0), 0);
  const avgDuration = activeRuns > 0
    ? Math.round(records.reduce((s, r) => s + (r.duration_ms || 0), 0) / activeRuns)
    : 0;

  return {
    total_runs: totalRuns,
    active_runs: activeRuns,
    skipped_runs: skipped,
    total_consumed_events: totalConsumed,
    total_matched_rules: totalMatched,
    total_dispatched_actions: totalDispatched,
    total_dispatch_errors: totalErrors,
    runs_with_errors: runsWithErrors,
    circuit_breaks: circuitBreaks,
    avg_duration_ms: avgDuration,
    actual_hours,
    source: 'pipeline/run-log.jsonl',
  };
}

/**
 * 从 dispatcher-actions.jsonl 聚合分发动作明细。
 */
function aggregateFromDispatcherActions(hours) {
  const all = readJsonl(DISPATCHER_ACTIONS_LOG);
  const { records, actual_hours } = filterWithFallback(
    all,
    r => r.timestamp || 0,
    hours,
    hours * 3
  );

  const total = records.length;
  const byType = records.reduce((acc, r) => {
    const t = r.action && typeof r.action === 'object' ? (r.action.type || 'unknown') : (r.action || 'unknown');
    acc[t] = (acc[t] || 0) + 1;
    return acc;
  }, {});

  const byEventType = records.reduce((acc, r) => {
    const t = r.eventType || 'unknown';
    acc[t] = (acc[t] || 0) + 1;
    return acc;
  }, {});

  return {
    total,
    by_action_type: byType,
    unique_event_types: Object.keys(byEventType).length,
    top_event_types: Object.entries(byEventType).sort((a, b) => b[1] - a[1]).slice(0, 5),
    actual_hours,
    source: 'logs/dispatcher-actions.jsonl',
  };
}

/**
 * 计算 execution 层综合指标：
 * 优先级：run-log > dispatcher-actions > metrics.jsonl > in-memory metrics
 *
 * execution.total 使用 decision-log 中 phase=execution 的条目数作为"已执行决策数"
 * （这是最完整的执行链路记录），run-log 作为辅助确认。
 */
function resolveExecutionMetrics(decisionSummary, runLogStats, dispatcherStats, metricsJsonl, runtimeMetrics) {
  // 执行决策数：来自 decision-logger 的 execution phase 计数
  const executionDecisions = decisionSummary.by_phase?.execution?.count || 0;

  // 分发总量（优先级：run-log dispatched_actions > dispatcher-actions total > metrics累计 > 运行时内存）
  let dispatchTotal = 0;
  let dispatchSource = 'none';

  if (dispatcherStats.total > 0) {
    dispatchTotal = dispatcherStats.total;
    dispatchSource = 'dispatcher-actions.jsonl';
  } else if (runLogStats.total_dispatched_actions > 0) {
    dispatchTotal = runLogStats.total_dispatched_actions;
    dispatchSource = 'run-log dispatched_actions';
  } else if (metricsJsonl && metricsJsonl.dispatch_total > 0) {
    dispatchTotal = metricsJsonl.dispatch_total;
    dispatchSource = 'metrics.jsonl (cumulative)';
  } else if (runtimeMetrics && runtimeMetrics.dispatch_total > 0) {
    dispatchTotal = runtimeMetrics.dispatch_total;
    dispatchSource = 'in-memory metrics';
  }

  // 分发成功数：从 metrics.jsonl 累计或运行时指标
  let dispatchSuccess = 0;
  let dispatchFailed = 0;
  let dispatchTimeout = 0;
  let dispatchRetry = 0;
  let avgLatencyMs = 0;

  if (metricsJsonl && metricsJsonl.dispatch_total > 0) {
    dispatchSuccess = metricsJsonl.dispatch_success;
    dispatchFailed = metricsJsonl.dispatch_failed;
    dispatchTimeout = metricsJsonl.dispatch_timeout;
    dispatchRetry = metricsJsonl.dispatch_retry;
    avgLatencyMs = metricsJsonl.dispatch_latency_avg_ms;
  } else if (runtimeMetrics) {
    dispatchSuccess = runtimeMetrics.dispatch_success || 0;
    dispatchFailed = runtimeMetrics.dispatch_failed || 0;
    dispatchTimeout = runtimeMetrics.dispatch_timeout || 0;
    dispatchRetry = runtimeMetrics.dispatch_retry || 0;
    avgLatencyMs = runtimeMetrics.dispatch_latency_avg_ms || 0;
  }

  // run-log 层面的错误率（dispatch错误，不是分发成功率）
  const runErrorRate = runLogStats.active_runs > 0
    ? rate(runLogStats.runs_with_errors, runLogStats.active_runs)
    : 0;

  // 综合成功率：若有 metrics 数据用 metrics，否则用 run-log 错误率估算
  let successRate = null;
  if (dispatchTotal > 0 && (dispatchSuccess + dispatchFailed + dispatchTimeout) > 0) {
    successRate = rate(dispatchSuccess, dispatchSuccess + dispatchFailed + dispatchTimeout);
  } else if (runLogStats.active_runs > 0) {
    // 无精确 success/fail 数据时，用 runs_without_errors / active_runs 估算
    const runsOk = runLogStats.active_runs - runLogStats.runs_with_errors;
    successRate = rate(runsOk, runLogStats.active_runs);
  }

  return {
    // 执行决策数（来自 decisions.jsonl）
    execution_decisions: executionDecisions,
    // 管道运行数
    pipeline_runs: runLogStats.active_runs,
    // 分发动作总数
    dispatch_total: dispatchTotal,
    dispatch_source: dispatchSource,
    dispatch_success: dispatchSuccess,
    dispatch_failed: dispatchFailed,
    dispatch_timeout: dispatchTimeout,
    dispatch_retry: dispatchRetry,
    dispatch_errors_in_runlog: runLogStats.total_dispatch_errors,
    run_error_rate: runErrorRate,
    success_rate: successRate,
    avg_latency_ms: avgLatencyMs,
    // dispatcher actions breakdown (top)
    dispatch_action_types: dispatcherStats.by_action_type,
  };
}

function phaseStatus({ total = 0, successRate = null, avgConfidence = null, degradationRate = null, unhealthy = 0, warnings = 0 }) {
  if (unhealthy > 0) return 'critical';
  if (successRate !== null && successRate < 70) return 'critical';
  if (avgConfidence !== null && avgConfidence < 0.5) return 'critical';
  if (degradationRate !== null && degradationRate > 20) return 'critical';
  if (warnings > 0) return 'warning';
  if (successRate !== null && successRate < 90) return 'warning';
  if (avgConfidence !== null && avgConfidence < 0.7) return 'warning';
  if (degradationRate !== null && degradationRate > 10) return 'warning';
  if (total === 0) return 'unknown';
  return 'healthy';
}

/**
 * execution 层专用状态判定：
 * 区分"有运行数据但成功率低"与"根本没有运行数据"两种不同情况。
 */
function executionPhaseStatus(execMetrics) {
  const hasData = execMetrics.execution_decisions > 0
    || execMetrics.pipeline_runs > 0
    || execMetrics.dispatch_total > 0;

  if (!hasData) return 'unknown';  // 无数据时 unknown，不再是 critical

  const { success_rate, run_error_rate, dispatch_timeout } = execMetrics;

  if (success_rate !== null) {
    if (success_rate < 70) return 'critical';
    if (success_rate < 90) return 'warning';
  }

  // 高错误率
  if (run_error_rate > 50) return 'critical';
  if (run_error_rate > 20) return 'warning';

  // dispatch 超时数量
  if (dispatch_timeout > 5) return 'warning';

  return 'healthy';
}

function buildDashboard(options = {}) {
  const hours = Number(options.hours || 24);
  const since = new Date(Date.now() - hours * 3600_000).toISOString();

  const decisionLogger = loadDecisionLogger();
  const metrics = loadMetrics();
  const fallbackSweep = loadFallbackSweep();

  // ── 决策日志聚合 ──
  const decisionSummary = decisionLogger && typeof decisionLogger.summarize === 'function'
    ? decisionLogger.summarize({ since })
    : { total: 0, by_phase: {}, avg_confidence: null, degradation_count: 0, by_component: {}, by_method: {} };

  // ── 运行时内存指标（可能为0，进程重启后清零）──
  const runtimeMetrics = metrics && typeof metrics.getMetrics === 'function'
    ? metrics.getMetrics()
    : null;

  // ── L3 健康检查 ──
  const l3Health = fallbackSweep && typeof fallbackSweep.checkSystemHealthL3 === 'function'
    ? fallbackSweep.checkSystemHealthL3()
    : null;

  // ── 历史数据源（核心修复点）──
  const runLogStats = aggregateFromRunLog(hours);
  const dispatcherStats = aggregateFromDispatcherActions(hours);
  const metricsJsonl = aggregateMetricsFromJsonl();

  // ── 效果层：auto-response 宽松窗口 ──
  const allAutoResponses = readJsonl(AUTO_RESPONSE_LOG);
  const { records: autoResponses, actual_hours: autoHours } = filterWithFallback(
    allAutoResponses,
    r => r.ts || r.timestamp || 0,
    hours,
    hours * 3
  );

  // ── 系统健康：health log 宽松窗口 ──
  const allHealthLogs = readJsonl(SYSTEM_HEALTH_LOG);
  const { records: healthLogs, actual_hours: healthHours } = filterWithFallback(
    allHealthLogs,
    r => r.ts || r.timestamp || 0,
    hours,
    hours * 3
  );

  // ── Execution 层综合指标 ──
  const execMetrics = resolveExecutionMetrics(
    decisionSummary, runLogStats, dispatcherStats, metricsJsonl, runtimeMetrics
  );

  const cognitionCount = (decisionSummary.by_phase?.sensing?.count || 0)
    + (decisionSummary.by_phase?.cognition?.count || 0);
  const decisionCount = decisionSummary.by_phase?.cognition?.count || 0;

  const effectEscalations = autoResponses.filter(r => r.action === 'escalate').length;
  const effectAutoFixCandidates = autoResponses.filter(r => r.action === 'auto_fix_candidate').length;
  const effectObserved = autoResponses.length;

  const latestHealth = healthLogs.length ? healthLogs[healthLogs.length - 1] : null;
  const unhealthyHealthLogs = healthLogs.filter(r => String(r.status).toLowerCase() !== 'healthy').length;

  const degradationRate = rate(decisionSummary.degradation_count || 0, decisionSummary.total || 0);

  const layers = {
    cognition: {
      total: cognitionCount,
      avg_confidence: decisionSummary.by_phase?.sensing?.avg_confidence
        ?? decisionSummary.by_phase?.cognition?.avg_confidence
        ?? null,
      degradation_rate: degradationRate,
      top_components: Object.entries(decisionSummary.by_component || {}).sort((a, b) => b[1] - a[1]).slice(0, 5),
    },
    decision: {
      total: decisionCount,
      avg_confidence: decisionSummary.by_phase?.cognition?.avg_confidence ?? decisionSummary.avg_confidence ?? null,
      degradation_rate: degradationRate,
      methods: decisionSummary.by_method || {},
    },
    execution: {
      // 执行决策数（decisions.jsonl phase=execution）
      execution_decisions: execMetrics.execution_decisions,
      // 管道运行数（run-log.jsonl）
      pipeline_runs: execMetrics.pipeline_runs,
      // 分发动作（dispatcher-actions / metrics）
      dispatch_total: execMetrics.dispatch_total,
      dispatch_source: execMetrics.dispatch_source,
      dispatch_success: execMetrics.dispatch_success,
      dispatch_failed: execMetrics.dispatch_failed,
      dispatch_errors_in_runlog: execMetrics.dispatch_errors_in_runlog,
      run_error_rate: execMetrics.run_error_rate,
      success_rate: execMetrics.success_rate,
      avg_latency_ms: execMetrics.avg_latency_ms,
    },
    effect: {
      observed: effectObserved,
      window_hours: autoHours,
      escalations: effectEscalations,
      auto_fix_candidates: effectAutoFixCandidates,
      log_and_monitor: autoResponses.filter(r => r.action === 'log_and_monitor').length,
      categories: autoResponses.reduce((acc, item) => {
        const key = item.category || 'unknown';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {}),
    },
    system_health: {
      status: l3Health?.overall || (latestHealth?.status || 'unknown'),
      warnings: l3Health?.warnings || [],
      errors: l3Health?.errors || [],
      latest: latestHealth,
      window_hours: healthHours,
      unhealthy_samples: unhealthyHealthLogs,
      l3: l3Health?.l3 || null,
    },
  };

  // ── 状态计算 ──
  layers.cognition.status = phaseStatus({
    total: layers.cognition.total,
    avgConfidence: layers.cognition.avg_confidence,
    degradationRate: layers.cognition.degradation_rate,
  });
  layers.decision.status = phaseStatus({
    total: layers.decision.total,
    avgConfidence: layers.decision.avg_confidence,
    degradationRate: layers.decision.degradation_rate,
  });

  // execution 层使用专用状态函数（避免 total=0 且 successRate=0 误判 critical）
  layers.execution.status = executionPhaseStatus(execMetrics);

  layers.effect.status = phaseStatus({
    total: layers.effect.observed,
    warnings: layers.effect.escalations > 0 ? 1 : 0,
  });
  layers.system_health.status = String(layers.system_health.status || 'unknown').toLowerCase() === 'critical'
    ? 'critical'
    : (layers.system_health.errors.length > 0
      ? 'critical'
      : (layers.system_health.warnings.length > 0 || layers.system_health.unhealthy_samples > 0
        ? 'warning'
        : (layers.system_health.status || 'unknown')));

  const statusOrder = { critical: 4, unhealthy: 4, warning: 3, degraded: 3, healthy: 2, up: 2, info: 1, unknown: 0 };
  const overallStatus = Object.values(layers)
    .map(layer => layer.status || 'unknown')
    .sort((a, b) => (statusOrder[b] || 0) - (statusOrder[a] || 0))[0] || 'unknown';

  return {
    generated_at: new Date().toISOString(),
    window_hours: hours,
    since,
    overall_status: overallStatus,
    summary: {
      total_decisions: decisionSummary.total || 0,
      total_execution_decisions: execMetrics.execution_decisions,
      total_pipeline_runs: execMetrics.pipeline_runs,
      total_dispatch_actions: execMetrics.dispatch_total,
      total_dispatch_source: execMetrics.dispatch_source,
      total_effect_observations: effectObserved,
      total_health_samples: healthLogs.length,
    },
    data_sources: {
      decisions_jsonl: decisionSummary.total > 0,
      run_log_jsonl: runLogStats.total_runs > 0,
      dispatcher_actions_jsonl: dispatcherStats.total > 0,
      metrics_jsonl: !!(metricsJsonl && metricsJsonl.snapshot_count > 0),
      runtime_metrics: !!(runtimeMetrics && runtimeMetrics.dispatch_total > 0),
      auto_response_jsonl: allAutoResponses.length > 0,
      health_jsonl: allHealthLogs.length > 0,
    },
    layers,
  };
}

function statusEmoji(status) {
  if (['critical', 'unhealthy'].includes(status)) return '🔴';
  if (['warning', 'degraded'].includes(status)) return '🟡';
  if (['healthy', 'up'].includes(status)) return '🟢';
  return '⚪';
}

function toMarkdown(dashboard) {
  const lines = [];
  lines.push('# 全局自主决策流水线监控总仪表盘');
  lines.push(`- 生成时间: ${dashboard.generated_at}`);
  lines.push(`- 观察窗口: 最近 ${dashboard.window_hours} 小时`);
  lines.push(`- 总状态: ${statusEmoji(dashboard.overall_status)} ${String(dashboard.overall_status).toUpperCase()}`);
  lines.push('');
  lines.push('## 总览');
  lines.push(`- 决策记录总计: ${dashboard.summary.total_decisions}`);
  lines.push(`- 执行层决策数: ${dashboard.summary.total_execution_decisions}`);
  lines.push(`- 管道运行次数: ${dashboard.summary.total_pipeline_runs}`);
  lines.push(`- 分发动作总计: ${dashboard.summary.total_dispatch_actions} (来源: ${dashboard.summary.total_dispatch_source})`);
  lines.push(`- 效果观测次数: ${dashboard.summary.total_effect_observations}`);
  lines.push(`- 健康采样次数: ${dashboard.summary.total_health_samples}`);
  lines.push('');

  lines.push('## 数据源状态');
  for (const [k, v] of Object.entries(dashboard.data_sources)) {
    lines.push(`- ${k}: ${v ? '✅' : '⚠️ 无数据'}`);
  }
  lines.push('');

  for (const [name, layer] of Object.entries(dashboard.layers)) {
    lines.push(`## ${statusEmoji(layer.status)} ${name}`);
    lines.push(`- 状态: ${layer.status}`);
    for (const [key, value] of Object.entries(layer)) {
      if (key === 'status') continue;
      if (Array.isArray(value)) {
        lines.push(`- ${key}: ${value.length ? JSON.stringify(value) : '[]'}`);
      } else if (value !== null && typeof value === 'object') {
        lines.push(`- ${key}: ${JSON.stringify(value)}`);
      } else {
        lines.push(`- ${key}: ${value}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

function writeReports(dashboard) {
  ensureDir(REPORTS_DIR);
  fs.writeFileSync(JSON_REPORT, JSON.stringify(dashboard, null, 2));
  fs.writeFileSync(MD_REPORT, toMarkdown(dashboard));
  return { json: JSON_REPORT, markdown: MD_REPORT };
}

function main() {
  const args = process.argv.slice(2);
  const jsonOnly = args.includes('--json');
  const write = args.includes('--write');
  const hoursArg = args.find(arg => arg.startsWith('--hours='));
  const hours = hoursArg ? Number(hoursArg.split('=')[1]) : 24;

  const dashboard = buildDashboard({ hours });
  if (write) writeReports(dashboard);

  if (jsonOnly) {
    console.log(JSON.stringify(dashboard, null, 2));
  } else {
    console.log(toMarkdown(dashboard));
  }

  return dashboard;
}

module.exports = {
  buildDashboard,
  toMarkdown,
  writeReports,
  main,
  JSON_REPORT,
  MD_REPORT,
};

if (require.main === module) {
  main();
}
