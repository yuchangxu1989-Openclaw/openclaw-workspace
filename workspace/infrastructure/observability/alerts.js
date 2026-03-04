'use strict';

/**
 * L3 Alert Rules Engine
 * 
 * Evaluates runtime metrics against predefined thresholds and triggers alerts:
 *   - dispatch_timeout_rate > 10% → alert
 *   - intent_no_match_rate > 50% → alert
 *   - pipeline_breaker_trips > 3 in 5min → alert
 * 
 * Alerts are:
 *   1. Written to DecisionLog (cross-module audit trail)
 *   2. Sent to configurable callbacks (e.g., Feishu notification)
 *   3. Deduplicated (same alert suppressed for 5 min cooldown)
 * 
 * @module infrastructure/observability/alerts
 */

const fs = require('fs');
const path = require('path');

// ─── Dependencies ────────────────────────────────────────────────

let _decisionLogger = null;
try {
  _decisionLogger = require('../decision-log/decision-logger');
} catch (_) {}

let _metrics = null;
try {
  _metrics = require('./metrics');
} catch (_) {}

// ─── Constants ───────────────────────────────────────────────────

const ALERTS_LOG_FILE = path.join(__dirname, 'alerts.jsonl');
const COOLDOWN_MS = 5 * 60_000; // 5 minutes cooldown between same alerts

// ─── State ───────────────────────────────────────────────────────

/** @type {Map<string, number>} ruleId → last fired timestamp */
const _cooldowns = new Map();

/** @type {Array<Function>} Alert callback handlers */
const _callbacks = [];

/** @type {Array<object>} Recent alerts (in-memory, for dashboard) */
let _recentAlerts = [];
const MAX_RECENT = 100;

// Breaker trip tracking (rolling window)
const _breakerTripTimestamps = [];
const BREAKER_WINDOW_MS = 5 * 60_000;

// ─── Alert Rule Definitions ─────────────────────────────────────

/**
 * @typedef {object} AlertRule
 * @property {string} id - Unique rule identifier
 * @property {string} name - Human-readable name
 * @property {string} severity - 'critical'|'warning'|'info'
 * @property {string} description - What this rule detects
 * @property {function(object): {triggered: boolean, value: any, threshold: any, message: string}} evaluate
 */

const ALERT_RULES = [
  {
    id: 'dispatch_timeout_rate_high',
    name: 'High Dispatch Timeout Rate',
    severity: 'critical',
    description: 'Dispatch timeout rate exceeds 10%',
    evaluate(metrics) {
      const rate = metrics.dispatch_timeout_rate || 0;
      const total = metrics.dispatch_total || 0;
      return {
        triggered: total >= 5 && rate > 10, // Need at least 5 dispatches for meaningful rate
        value: rate,
        threshold: 10,
        message: `Dispatch timeout rate ${rate.toFixed(1)}% > 10% (${metrics.dispatch_timeout}/${total} timeouts)`,
      };
    },
  },
  {
    id: 'intent_no_match_rate_high',
    name: 'High Intent No-Match Rate',
    severity: 'warning',
    description: 'Intent recognition no-match rate exceeds 50%',
    evaluate(metrics) {
      const rate = metrics.intent_no_match_rate || 0;
      const total = metrics.intent_requests_total || 0;
      return {
        triggered: total >= 3 && rate > 50, // Need at least 3 requests
        value: rate,
        threshold: 50,
        message: `Intent no-match rate ${rate.toFixed(1)}% > 50% (${metrics.intent_no_match_total}/${total} no-match)`,
      };
    },
  },
  {
    id: 'pipeline_breaker_trips_excessive',
    name: 'Excessive Pipeline Circuit Breaker Trips',
    severity: 'critical',
    description: 'More than 3 circuit breaker trips in 5 minutes',
    evaluate(metrics) {
      // Use rolling window of breaker trips
      const now = Date.now();
      // Prune old entries
      while (_breakerTripTimestamps.length > 0 && (now - _breakerTripTimestamps[0]) > BREAKER_WINDOW_MS) {
        _breakerTripTimestamps.shift();
      }
      const tripsInWindow = _breakerTripTimestamps.length;
      return {
        triggered: tripsInWindow > 3,
        value: tripsInWindow,
        threshold: 3,
        message: `${tripsInWindow} circuit breaker trips in last 5 min (threshold: 3)`,
      };
    },
  },
  {
    id: 'dispatch_failure_rate_high',
    name: 'High Dispatch Failure Rate',
    severity: 'warning',
    description: 'Dispatch failure rate exceeds 20%',
    evaluate(metrics) {
      const total = metrics.dispatch_total || 0;
      const failed = metrics.dispatch_failed || 0;
      const rate = total > 0 ? (failed / total) * 100 : 0;
      return {
        triggered: total >= 5 && rate > 20,
        value: rate,
        threshold: 20,
        message: `Dispatch failure rate ${rate.toFixed(1)}% > 20% (${failed}/${total} failed)`,
      };
    },
  },
  {
    id: 'pipeline_latency_high',
    name: 'High Pipeline Latency',
    severity: 'warning',
    description: 'Pipeline P95 latency exceeds 30 seconds',
    evaluate(metrics) {
      const p95 = metrics.pipeline_p95_latency_ms || 0;
      const samples = metrics.pipeline_latency_samples || 0;
      return {
        triggered: samples >= 3 && p95 > 30000,
        value: p95,
        threshold: 30000,
        message: `Pipeline P95 latency ${(p95 / 1000).toFixed(1)}s > 30s (${samples} samples)`,
      };
    },
  },
  {
    id: 'events_dropped_high',
    name: 'High Event Drop Rate',
    severity: 'warning',
    description: 'Events dropped exceeds 10% of emitted',
    evaluate(metrics) {
      const emitted = metrics.events_emitted_total || 0;
      const dropped = metrics.events_dropped_total || 0;
      const rate = emitted > 0 ? (dropped / emitted) * 100 : 0;
      return {
        triggered: emitted >= 10 && rate > 10,
        value: rate,
        threshold: 10,
        message: `Event drop rate ${rate.toFixed(1)}% > 10% (${dropped}/${emitted} dropped)`,
      };
    },
  },
];

// ─── Core API ────────────────────────────────────────────────────

/**
 * Record a circuit breaker trip (call this from pipeline instrumentation).
 */
function recordBreakerTrip() {
  _breakerTripTimestamps.push(Date.now());
}

/**
 * Evaluate all alert rules against current metrics.
 * 
 * @param {object} [metricsOverride] - Metrics snapshot to evaluate (defaults to live metrics)
 * @returns {Array<object>} Array of triggered alerts
 */
function evaluate(metricsOverride) {
  const metrics = metricsOverride || (_metrics ? _metrics.getMetrics() : {});
  const now = Date.now();
  const triggered = [];

  for (const rule of ALERT_RULES) {
    try {
      const result = rule.evaluate(metrics);
      if (!result.triggered) continue;

      // Check cooldown
      const lastFired = _cooldowns.get(rule.id) || 0;
      if ((now - lastFired) < COOLDOWN_MS) {
        continue; // Still in cooldown
      }

      const alert = {
        rule_id: rule.id,
        rule_name: rule.name,
        severity: rule.severity,
        message: result.message,
        value: result.value,
        threshold: result.threshold,
        timestamp: new Date(now).toISOString(),
        timestamp_ms: now,
      };

      triggered.push(alert);
      _cooldowns.set(rule.id, now);

      // Store in recent alerts
      _recentAlerts.push(alert);
      if (_recentAlerts.length > MAX_RECENT) {
        _recentAlerts = _recentAlerts.slice(-MAX_RECENT);
      }

      // Persist to alerts.jsonl
      _persistAlert(alert);

      // Write to DecisionLog
      _logToDecisionLog(alert);

      // Fire callbacks
      _fireCallbacks(alert);

    } catch (err) {
      // Individual rule evaluation failure is non-fatal
      process.stderr.write(`[Alerts] Rule ${rule.id} evaluation error: ${err.message}\n`);
    }
  }

  return triggered;
}

/**
 * Register an alert callback.
 * @param {function(object): void} callback - Called with alert object when triggered
 */
function onAlert(callback) {
  if (typeof callback === 'function') {
    _callbacks.push(callback);
  }
}

/**
 * Remove all registered callbacks.
 */
function clearCallbacks() {
  _callbacks.length = 0;
}

/**
 * Get recent alerts (in-memory).
 * @param {object} [options]
 * @param {number} [options.limit=20]
 * @param {string} [options.severity] - Filter by severity
 * @returns {Array<object>}
 */
function getRecentAlerts(options = {}) {
  let alerts = [..._recentAlerts];
  if (options.severity) {
    alerts = alerts.filter(a => a.severity === options.severity);
  }
  const limit = options.limit || 20;
  return alerts.slice(-limit);
}

/**
 * Get all defined alert rules.
 * @returns {Array<{id: string, name: string, severity: string, description: string}>}
 */
function listRules() {
  return ALERT_RULES.map(r => ({
    id: r.id,
    name: r.name,
    severity: r.severity,
    description: r.description,
  }));
}

/**
 * Clear cooldowns (for testing).
 */
function clearCooldowns() {
  _cooldowns.clear();
}

/**
 * Clear recent alerts (for testing).
 */
function clearRecentAlerts() {
  _recentAlerts = [];
}

// ─── Internal ────────────────────────────────────────────────────

function _persistAlert(alert) {
  try {
    const dir = path.dirname(ALERTS_LOG_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(ALERTS_LOG_FILE, JSON.stringify(alert) + '\n', 'utf8');
  } catch (_) {
    // Non-fatal
  }
}

function _logToDecisionLog(alert) {
  if (!_decisionLogger || typeof _decisionLogger.log !== 'function') return;
  try {
    _decisionLogger.log({
      phase: 'execution',
      component: 'L3Alerts',
      what: `ALERT [${alert.severity.toUpperCase()}]: ${alert.rule_name}`,
      why: alert.message,
      confidence: 1.0,
      decision_method: 'rule_match',
      input_summary: JSON.stringify({
        rule_id: alert.rule_id,
        value: alert.value,
        threshold: alert.threshold,
      }),
    });
  } catch (_) {
    // Non-fatal
  }
}

function _fireCallbacks(alert) {
  for (const cb of _callbacks) {
    try {
      cb(alert);
    } catch (err) {
      process.stderr.write(`[Alerts] Callback error: ${err.message}\n`);
    }
  }
}

// ─── CLI ─────────────────────────────────────────────────────────

if (require.main === module) {
  console.log('\n🚨 L3 Alert Rules Evaluation\n');

  const metrics = _metrics ? _metrics.getMetrics() : {};
  console.log('Current metrics snapshot:');
  console.log(`  dispatch_timeout_rate: ${(metrics.dispatch_timeout_rate || 0).toFixed(1)}%`);
  console.log(`  intent_no_match_rate: ${(metrics.intent_no_match_rate || 0).toFixed(1)}%`);
  console.log(`  pipeline_breaker_trips: ${metrics.pipeline_breaker_trips || 0}`);
  console.log('');

  const triggered = evaluate(metrics);

  if (triggered.length === 0) {
    console.log('✅ No alerts triggered.\n');
  } else {
    for (const alert of triggered) {
      const icon = alert.severity === 'critical' ? '🔴' : alert.severity === 'warning' ? '🟡' : 'ℹ️';
      console.log(`${icon} [${alert.severity.toUpperCase()}] ${alert.rule_name}`);
      console.log(`   ${alert.message}`);
    }
    console.log('');
  }

  console.log('Defined rules:');
  for (const rule of listRules()) {
    console.log(`  - ${rule.id} (${rule.severity}): ${rule.description}`);
  }
}

// ─── Exports ─────────────────────────────────────────────────────

module.exports = {
  // Core API
  evaluate,
  recordBreakerTrip,
  onAlert,
  clearCallbacks,
  getRecentAlerts,
  listRules,

  // Testing helpers
  clearCooldowns,
  clearRecentAlerts,

  // Constants
  ALERT_RULES,
  ALERTS_LOG_FILE,
  COOLDOWN_MS,
};
