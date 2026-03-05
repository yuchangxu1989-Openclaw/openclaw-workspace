'use strict';

/**
 * Cron Fallback Sweep Executor
 * 
 * [Day3-Gap2] 兜底补扫执行器。
 * 
 * 被 3 个重塑后的 Cron 调用，提供统一的兜底补扫逻辑：
 *   1. 检查 EventBus 中是否有未被处理的事件
 *   2. 检查指定时间窗口内是否有预期的输出事件
 *   3. 对遗漏的事件重新 emit 到 EventBus
 * 
 * 不执行业务逻辑本身 — 仅确保事件驱动链路的完整性。
 * 
 * @module infrastructure/cron/fallback-sweep
 */

const fs = require('fs');
const path = require('path');

// Lazy-load dependencies to avoid circular requires
let _busAdapter = null;
let _metrics = null;
let _decisionLogger = null;
let _featureFlags = null;

function getBus() {
  if (!_busAdapter) {
    try { _busAdapter = require('../event-bus/bus-adapter'); } catch (_) {}
  }
  return _busAdapter;
}

function getMetrics() {
  if (!_metrics) {
    try { _metrics = require('../observability/metrics'); } catch (_) {}
  }
  return _metrics;
}

function getDecisionLogger() {
  if (!_decisionLogger) {
    try { _decisionLogger = require('../decision-log/decision-logger'); } catch (_) {}
  }
  return _decisionLogger;
}

function getFeatureFlags() {
  if (!_featureFlags) {
    try { _featureFlags = require('../config/feature-flags'); } catch (_) {}
  }
  return _featureFlags;
}

const LOG_DIR = path.join(__dirname, '..', 'logs');
const SWEEP_LOG = path.join(LOG_DIR, 'fallback-sweep.jsonl');

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

// ═══════════════════════════════════════════════════════════
// 1. Auto-Response Pipeline Sweep
// ═══════════════════════════════════════════════════════════

/**
 * 检查最近 N 分钟内是否有未处理的 evolver/cras 事件，
 * 如果有遗漏，重新 emit 到 EventBus。
 * 
 * @param {object} [options]
 * @param {number} [options.windowMinutes=15]
 * @param {number} [options.maxReemit=10]
 * @returns {{ swept: number, reemitted: number, events: string[] }}
 */
function sweepAutoResponse(options = {}) {
  const bus = getBus();
  if (!bus) return { swept: 0, reemitted: 0, events: [], error: 'bus-adapter not available' };

  const windowMinutes = options.windowMinutes || 15;
  const maxReemit = options.maxReemit || 10;
  const since = Date.now() - windowMinutes * 60 * 1000;

  const eventTypes = [
    'evolver.insight.detected',
    'cras.insight.critical',
    'system.metric.threshold_exceeded',
  ];

  // Check for unprocessed events using a dedicated sweep consumer
  const consumerId = 'auto-response-sweep';
  let missedEvents = [];

  for (const eventType of eventTypes) {
    try {
      const events = bus.consume({
        type_filter: eventType,
        since,
        consumerId,
        limit: maxReemit,
      });
      missedEvents = missedEvents.concat(events);
    } catch (_) {}
  }

  // Cap at maxReemit
  const toReemit = missedEvents.slice(0, maxReemit);
  let reemitted = 0;

  for (const evt of toReemit) {
    try {
      const result = bus.emit(evt.type, evt.payload || {}, 'fallback-sweep', {
        original_id: evt.id,
        sweep_source: 'auto-response-pipeline-sweep',
        sweep_ts: new Date().toISOString(),
      });
      if (result && !result.suppressed) {
        reemitted++;
      }
    } catch (_) {}
  }

  const sweepResult = {
    sweep: 'auto-response',
    swept: missedEvents.length,
    reemitted,
    events: toReemit.map(e => e.type),
    windowMinutes,
    timestamp: new Date().toISOString(),
  };

  logSweep(sweepResult);
  return sweepResult;
}

// ═══════════════════════════════════════════════════════════
// 2. User Insight Sweep
// ═══════════════════════════════════════════════════════════

/**
 * 检查最近 30 分钟内是否有洞察输出事件。
 * 如果没有，emit 一个 cras.insight.request 事件触发洞察分析。
 * 
 * @param {object} [options]
 * @param {number} [options.windowMinutes=30]
 * @returns {{ hasRecentOutput: boolean, emitted: boolean }}
 */
function sweepUserInsight(options = {}) {
  const bus = getBus();
  if (!bus) return { hasRecentOutput: false, emitted: false, error: 'bus-adapter not available' };

  const windowMinutes = options.windowMinutes || 30;
  const since = Date.now() - windowMinutes * 60 * 1000;

  // Check if there's been any insight output recently
  let hasRecentOutput = false;
  try {
    const outputs = bus.consume({
      type_filter: 'cras.insight.generated',
      since,
      consumerId: 'user-insight-sweep-check',
      limit: 1,
    });
    hasRecentOutput = outputs.length > 0;
  } catch (_) {}

  // Also check if there's been a recent request (someone already triggered it)
  let hasRecentRequest = false;
  try {
    const requests = bus.consume({
      type_filter: 'cras.insight.request',
      since,
      consumerId: 'user-insight-sweep-check-req',
      limit: 1,
    });
    hasRecentRequest = requests.length > 0;
  } catch (_) {}

  let emitted = false;

  // Only emit if no recent output AND no recent request
  if (!hasRecentOutput && !hasRecentRequest) {
    try {
      const result = bus.emit('cras.insight.request', {
        source: 'cron-fallback-sweep',
        reason: 'no_insight_output_in_window',
        window_minutes: windowMinutes,
        format: 'feishu_card',
        include_todos: true,
        persist_profile: true,
      }, 'fallback-sweep');

      emitted = result && !result.suppressed;
    } catch (_) {}
  }

  const sweepResult = {
    sweep: 'user-insight',
    hasRecentOutput,
    hasRecentRequest,
    emitted,
    windowMinutes,
    timestamp: new Date().toISOString(),
  };

  logSweep(sweepResult);
  return sweepResult;
}

// ═══════════════════════════════════════════════════════════
// 3. System Health Check (L3 Extended)
// ═══════════════════════════════════════════════════════════

/**
 * 执行 L3 扩展健康检查 — 读取 metrics.js 和各子系统的 L3 指标。
 * 
 * @returns {{ basic: object, l3: object, overall: string }}
 */
function checkSystemHealthL3() {
  const metrics = getMetrics();
  const decisionLogger = getDecisionLogger();
  const featureFlags = getFeatureFlags();
  const bus = getBus();

  const result = {
    timestamp: new Date().toISOString(),
    basic: {},
    l3: {},
    overall: 'healthy',
    warnings: [],
    errors: [],
  };

  // ─── L3 Check 1: EventBus 吞吐/积压 ───
  try {
    if (metrics) {
      const m = metrics.getMetrics();
      result.l3.eventbus = {
        emitted: m.events_emitted_total || 0,
        processed: m.events_processed_total || 0,
        dropped: m.events_dropped_total || 0,
        drop_rate: m.events_emitted_total > 0
          ? Math.round(m.events_dropped_total / m.events_emitted_total * 10000) / 100
          : 0,
        status: 'healthy',
      };

      // Drop rate > 5% → warning
      if (result.l3.eventbus.drop_rate > 5) {
        result.l3.eventbus.status = 'warning';
        result.warnings.push(`EventBus drop rate: ${result.l3.eventbus.drop_rate}%`);
      }
    }

    // Backlog check via bus stats
    if (bus) {
      const busStats = bus.stats();
      result.l3.eventbus_backlog = {
        total_events: busStats.total_events || 0,
        consumers: busStats.consumers || 0,
        status: 'healthy',
      };
    }
  } catch (err) {
    result.l3.eventbus = { status: 'error', error: err.message };
    result.errors.push(`EventBus check failed: ${err.message}`);
  }

  // ─── L3 Check 2: Pipeline 成功率 ───
  try {
    if (metrics) {
      const m = metrics.getMetrics();
      const total = m.dispatch_total || 0;
      const success = m.dispatch_success || 0;
      const failed = m.dispatch_failed || 0;
      const timeout = m.dispatch_timeout || 0;
      const successRate = total > 0 ? Math.round(success / total * 10000) / 100 : 100;

      result.l3.pipeline = {
        total,
        success,
        failed,
        timeout,
        retry: m.dispatch_retry || 0,
        success_rate: successRate,
        avg_latency_ms: m.dispatch_latency_avg_ms || 0,
        p95_latency_ms: m.dispatch_latency_p95_ms || 0,
        status: 'healthy',
      };

      if (successRate < 90 && total > 0) {
        result.l3.pipeline.status = 'warning';
        result.warnings.push(`Pipeline success rate: ${successRate}% (threshold: 90%)`);
      }
      if (successRate < 70 && total > 0) {
        result.l3.pipeline.status = 'critical';
        result.errors.push(`Pipeline success rate critically low: ${successRate}%`);
      }
    }
  } catch (err) {
    result.l3.pipeline = { status: 'error', error: err.message };
    result.errors.push(`Pipeline check failed: ${err.message}`);
  }

  // ─── L3 Check 3: 熔断触发次数 ───
  try {
    if (metrics) {
      const m = metrics.getMetrics();
      const trips = m.pipeline_breaker_trips || 0;

      result.l3.breaker = {
        trips,
        status: 'healthy',
      };

      if (trips > 3) {
        result.l3.breaker.status = 'warning';
        result.warnings.push(`Circuit breaker trips: ${trips} (threshold: 3)`);
      }
      if (trips > 10) {
        result.l3.breaker.status = 'critical';
        result.errors.push(`Circuit breaker trips critically high: ${trips}`);
      }
    }
  } catch (err) {
    result.l3.breaker = { status: 'error', error: err.message };
  }

  // ─── L3 Check 4: DecisionLog 异常 ───
  try {
    if (decisionLogger && typeof decisionLogger.summarize === 'function') {
      const since = new Date(Date.now() - 3600000).toISOString(); // last 1h
      const summary = decisionLogger.summarize({ since });

      result.l3.decision = {
        total: summary.total || 0,
        avg_confidence: summary.avg_confidence,
        degradation_count: summary.degradation_count || 0,
        degradation_rate: summary.total > 0
          ? Math.round(summary.degradation_count / summary.total * 10000) / 100
          : 0,
        by_phase: summary.by_phase || {},
        status: 'healthy',
      };

      // >10% low-confidence decisions → warning
      if (result.l3.decision.degradation_rate > 10) {
        result.l3.decision.status = 'warning';
        result.warnings.push(`Decision degradation rate: ${result.l3.decision.degradation_rate}%`);
      }

      // Avg confidence < 0.6 → warning
      if (result.l3.decision.avg_confidence !== null && result.l3.decision.avg_confidence < 0.6) {
        result.l3.decision.status = 'warning';
        result.warnings.push(`Decision avg confidence: ${result.l3.decision.avg_confidence}`);
      }
    }
  } catch (err) {
    result.l3.decision = { status: 'error', error: err.message };
  }

  // ─── L3 Check 5: FeatureFlag 变更 ───
  try {
    if (featureFlags && typeof featureFlags.getAll === 'function' && typeof featureFlags.getDefaults === 'function') {
      const current = featureFlags.getAll();
      const defaults = featureFlags.getDefaults();
      
      const changesFromDefault = [];
      for (const [key, defaultVal] of Object.entries(defaults)) {
        if (current[key] !== defaultVal) {
          changesFromDefault.push({
            flag: key,
            default: defaultVal,
            current: current[key],
          });
        }
      }

      result.l3.flags = {
        total_flags: Object.keys(defaults).length,
        changes_from_default: changesFromDefault.length,
        changed_flags: changesFromDefault,
        status: 'info',
      };
    }
  } catch (err) {
    result.l3.flags = { status: 'error', error: err.message };
  }

  // ─── Overall status ───
  if (result.errors.length > 0) {
    result.overall = 'critical';
  } else if (result.warnings.length > 0) {
    result.overall = 'warning';
  }

  return result;
}

// ═══════════════════════════════════════════════════════════
// Logging
// ═══════════════════════════════════════════════════════════

function logSweep(entry) {
  try {
    ensureLogDir();
    fs.appendFileSync(SWEEP_LOG, JSON.stringify(entry) + '\n');
  } catch (_) { /* best-effort */ }
}

// ═══════════════════════════════════════════════════════════
// CLI — `node fallback-sweep.js [auto-response|user-insight|health|all]`
// ═══════════════════════════════════════════════════════════

function main() {
  const args = process.argv.slice(2);
  const mode = args[0] || 'all';

  console.log(`[fallback-sweep] Running sweep: ${mode}`);

  const results = {};

  if (mode === 'all' || mode === 'auto-response') {
    results.autoResponse = sweepAutoResponse();
    console.log(`  [auto-response] swept=${results.autoResponse.swept}, reemitted=${results.autoResponse.reemitted}`);
  }

  if (mode === 'all' || mode === 'user-insight') {
    results.userInsight = sweepUserInsight();
    console.log(`  [user-insight] hasOutput=${results.userInsight.hasRecentOutput}, emitted=${results.userInsight.emitted}`);
  }

  if (mode === 'all' || mode === 'health') {
    results.health = checkSystemHealthL3();
    console.log(`  [health] overall=${results.health.overall}, warnings=${results.health.warnings.length}, errors=${results.health.errors.length}`);
  }

  console.log(`[fallback-sweep] Done.`);
  return results;
}

// ═══════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════

module.exports = {
  sweepAutoResponse,
  sweepUserInsight,
  checkSystemHealthL3,
  main,
  LOG_FILE: SWEEP_LOG,
};

if (require.main === module) {
  main();
}
