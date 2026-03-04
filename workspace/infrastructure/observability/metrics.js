'use strict';

/**
 * L3 Runtime Metrics Collector
 * 
 * Collects, persists, and exposes runtime metrics for the L3 pipeline:
 *   - Event counts (emitted, processed, dropped)
 *   - Intent recognition (requests, hits by category, latency)
 *   - Rule matching (evaluated, matched, no-match)
 *   - Dispatch (total, success, timeout, retry)
 *   - Pipeline (runs, breaker trips, avg latency)
 * 
 * All metrics persist to metrics.jsonl for historical analysis.
 * Provides getMetrics() and resetMetrics() interfaces.
 * 
 * @module infrastructure/observability/metrics
 */

const fs = require('fs');
const path = require('path');

// ─── Constants ───────────────────────────────────────────────────
const METRICS_FILE = path.join(__dirname, 'metrics.jsonl');
const SNAPSHOT_INTERVAL_MS = 60_000; // Persist snapshot every 60s
const LATENCY_WINDOW = 100; // Keep last N latency samples for avg calculation

// ─── Metric Definitions ─────────────────────────────────────────

function createCounters() {
  return {
    // Event Bus
    events_emitted_total: 0,
    events_processed_total: 0,
    events_dropped_total: 0,

    // Intent Scanner
    intent_requests_total: 0,
    intent_hits_by_category: {},   // { IC1: 5, IC2: 3, ... }
    intent_no_match_total: 0,

    // Rule Matcher
    rules_evaluated_total: 0,
    rules_matched_total: 0,
    rules_no_match_total: 0,

    // Dispatcher
    dispatch_total: 0,
    dispatch_success: 0,
    dispatch_timeout: 0,
    dispatch_retry: 0,
    dispatch_failed: 0,

    // Pipeline
    pipeline_runs_total: 0,
    pipeline_breaker_trips: 0,
  };
}

// ─── State ───────────────────────────────────────────────────────

let _counters = createCounters();
let _intentLatencies = [];    // recent intent scan latencies (ms)
let _pipelineLatencies = [];  // recent pipeline run latencies (ms)
let _dispatchLatencies = [];  // recent dispatch latencies (ms)
let _startTime = Date.now();
let _lastPersist = 0;
let _persistTimer = null;

// ─── Core API ────────────────────────────────────────────────────

/**
 * Increment a counter metric.
 * @param {string} name - Metric name (e.g. 'events_emitted_total')
 * @param {number} [delta=1] - Amount to increment
 */
function inc(name, delta = 1) {
  if (typeof _counters[name] === 'number') {
    _counters[name] += delta;
  }
}

/**
 * Increment a category counter within a map metric.
 * @param {string} name - Map metric name (e.g. 'intent_hits_by_category')
 * @param {string} category - Category key (e.g. 'IC1')
 * @param {number} [delta=1]
 */
function incCategory(name, category, delta = 1) {
  if (_counters[name] && typeof _counters[name] === 'object') {
    _counters[name][category] = (_counters[name][category] || 0) + delta;
  }
}

/**
 * Record a latency sample.
 * @param {'intent'|'pipeline'|'dispatch'} type - Latency bucket
 * @param {number} ms - Latency in milliseconds
 */
function recordLatency(type, ms) {
  const bucket = type === 'intent' ? _intentLatencies
    : type === 'pipeline' ? _pipelineLatencies
    : type === 'dispatch' ? _dispatchLatencies
    : null;
  if (bucket) {
    bucket.push(ms);
    if (bucket.length > LATENCY_WINDOW) {
      bucket.splice(0, bucket.length - LATENCY_WINDOW);
    }
  }
}

/**
 * Compute average from a latency bucket.
 * @param {number[]} arr
 * @returns {number} Average in ms, or 0 if empty
 */
function _avg(arr) {
  if (!arr || arr.length === 0) return 0;
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 100) / 100;
}

/**
 * Compute P95 from a latency bucket.
 * @param {number[]} arr
 * @returns {number}
 */
function _p95(arr) {
  if (!arr || arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * 0.95);
  return sorted[Math.min(idx, sorted.length - 1)];
}

/**
 * Get current metrics snapshot.
 * @returns {object} Full metrics object with counters + computed gauges
 */
function getMetrics() {
  const uptimeMs = Date.now() - _startTime;
  
  return {
    // Counters (raw)
    ..._counters,

    // Computed gauges
    intent_latency_avg_ms: _avg(_intentLatencies),
    intent_latency_p95_ms: _p95(_intentLatencies),
    intent_latency_samples: _intentLatencies.length,

    pipeline_avg_latency_ms: _avg(_pipelineLatencies),
    pipeline_p95_latency_ms: _p95(_pipelineLatencies),
    pipeline_latency_samples: _pipelineLatencies.length,

    dispatch_latency_avg_ms: _avg(_dispatchLatencies),
    dispatch_latency_p95_ms: _p95(_dispatchLatencies),
    dispatch_latency_samples: _dispatchLatencies.length,

    // Rates (derived)
    dispatch_timeout_rate: _counters.dispatch_total > 0
      ? Math.round(_counters.dispatch_timeout / _counters.dispatch_total * 10000) / 100
      : 0,
    intent_no_match_rate: _counters.intent_requests_total > 0
      ? Math.round(_counters.intent_no_match_total / _counters.intent_requests_total * 10000) / 100
      : 0,
    rules_match_rate: _counters.rules_evaluated_total > 0
      ? Math.round(_counters.rules_matched_total / _counters.rules_evaluated_total * 10000) / 100
      : 0,

    // Meta
    uptime_ms: uptimeMs,
    uptime_human: _formatDuration(uptimeMs),
    collected_at: new Date().toISOString(),
  };
}

/**
 * Reset all metrics to zero.
 * Persists the pre-reset snapshot before clearing.
 */
function resetMetrics() {
  // Persist current state before reset
  _persistSnapshot('reset');

  _counters = createCounters();
  _intentLatencies = [];
  _pipelineLatencies = [];
  _dispatchLatencies = [];
  _startTime = Date.now();
}

// ─── Persistence ─────────────────────────────────────────────────

/**
 * Persist a metrics snapshot to metrics.jsonl.
 * @param {string} [reason='periodic'] - Reason for snapshot
 */
function _persistSnapshot(reason = 'periodic') {
  const snapshot = {
    ...getMetrics(),
    snapshot_reason: reason,
    timestamp: Date.now(),
  };

  try {
    const dir = path.dirname(METRICS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.appendFileSync(METRICS_FILE, JSON.stringify(snapshot) + '\n', 'utf8');
    _lastPersist = Date.now();
  } catch (err) {
    // Non-fatal: metrics persistence failure shouldn't break the pipeline
    process.stderr.write(`[Metrics] Persist failed: ${err.message}\n`);
  }
}

/**
 * Start periodic persistence timer.
 */
function startPersistence() {
  if (_persistTimer) return;
  _persistTimer = setInterval(() => {
    _persistSnapshot('periodic');
  }, SNAPSHOT_INTERVAL_MS);
  if (_persistTimer.unref) _persistTimer.unref();
}

/**
 * Stop periodic persistence and flush final snapshot.
 */
function stopPersistence() {
  if (_persistTimer) {
    clearInterval(_persistTimer);
    _persistTimer = null;
  }
  _persistSnapshot('shutdown');
}

/**
 * Force an immediate persist.
 */
function flush() {
  _persistSnapshot('manual_flush');
}

// ─── History ─────────────────────────────────────────────────────

/**
 * Read historical metrics snapshots from metrics.jsonl.
 * @param {object} [options]
 * @param {number} [options.since] - Timestamp filter (ms)
 * @param {number} [options.limit=50] - Max entries to return
 * @returns {Array<object>}
 */
function getHistory(options = {}) {
  const { since, limit = 50 } = options;

  if (!fs.existsSync(METRICS_FILE)) return [];

  try {
    const content = fs.readFileSync(METRICS_FILE, 'utf8').trim();
    if (!content) return [];

    let entries = content.split('\n').filter(l => l.trim()).map(line => {
      try { return JSON.parse(line); }
      catch (_) { return null; }
    }).filter(Boolean);

    if (since) {
      entries = entries.filter(e => e.timestamp >= since);
    }

    // Return most recent entries
    return entries.slice(-limit);
  } catch (_) {
    return [];
  }
}

// ─── Convenience Instrumentation Helpers ─────────────────────────

/**
 * Create a timer that records latency on stop.
 * @param {'intent'|'pipeline'|'dispatch'} type
 * @returns {{ stop: () => number }} Timer object; stop() returns elapsed ms
 */
function startTimer(type) {
  const start = Date.now();
  return {
    stop() {
      const elapsed = Date.now() - start;
      recordLatency(type, elapsed);
      return elapsed;
    }
  };
}

/**
 * Wrap an async function with automatic metrics collection.
 * @param {string} counterName - Counter to increment on call
 * @param {string} successCounter - Counter to increment on success
 * @param {string} failCounter - Counter to increment on failure
 * @param {'intent'|'pipeline'|'dispatch'} latencyType - Latency bucket
 * @param {Function} fn - Async function to wrap
 * @returns {Function}
 */
function instrument(counterName, successCounter, failCounter, latencyType, fn) {
  return async function (...args) {
    inc(counterName);
    const timer = startTimer(latencyType);
    try {
      const result = await fn.apply(this, args);
      inc(successCounter);
      timer.stop();
      return result;
    } catch (err) {
      inc(failCounter);
      timer.stop();
      throw err;
    }
  };
}

// ─── Helpers ─────────────────────────────────────────────────────

function _formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m ${s % 60}s`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

// ─── Exports ─────────────────────────────────────────────────────

module.exports = {
  // Core API
  inc,
  incCategory,
  recordLatency,
  getMetrics,
  resetMetrics,

  // Persistence
  startPersistence,
  stopPersistence,
  flush,
  getHistory,

  // Instrumentation helpers
  startTimer,
  instrument,

  // Constants
  METRICS_FILE,
  SNAPSHOT_INTERVAL_MS,
};
