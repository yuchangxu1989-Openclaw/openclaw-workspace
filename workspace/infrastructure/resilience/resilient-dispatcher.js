'use strict';

/**
 * Resilient Dispatcher — enhances dispatcher.js with:
 *   1. Handler crash isolation (try-catch per handler, crash ≠ block others)
 *   2. Handler crash → manual-queue + DecisionLog
 *   3. Per-handler circuit breaker (3 consecutive crashes → auto-disable)
 *   4. Handler health dashboard
 * 
 * Drop-in replacement that wraps the base Dispatcher.
 * 
 * @module resilience/resilient-dispatcher
 */

const fs = require('fs');
const path = require('path');
const { MainlineWAL, MainlineTrace, MainlineRecovery } = require('./mainline-capabilities');

// Base dispatcher
let _baseDispatcher;
try {
  _baseDispatcher = require('../dispatcher/dispatcher');
} catch (_) {
  _baseDispatcher = null;
}

// Decision Logger
let _decisionLogger = null;
try {
  _decisionLogger = require('../decision-log/decision-logger');
} catch (_) {}

// ── Constants ───────────────────────────────────────────────────
const HANDLER_CRASH_THRESHOLD = 3;  // consecutive crashes → disable
const HANDLER_COOLDOWN_MS = 5 * 60 * 1000; // 5min cooldown before re-enable
const HANDLER_STATE_FILE = path.join(__dirname, 'handler-state.json');
const resilienceWAL = new MainlineWAL();
const resilienceTrace = new MainlineTrace();
const resilienceRecovery = new MainlineRecovery();

// ── Handler Health Tracking ─────────────────────────────────────
// Map<handlerName, { consecutiveFailures, totalFailures, totalSuccess, lastFailure, lastSuccess, disabled, disabledAt }>
let _handlerHealth = new Map();

/**
 * Load handler health state from file.
 */
function loadHandlerState() {
  try {
    if (fs.existsSync(HANDLER_STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(HANDLER_STATE_FILE, 'utf8'));
      _handlerHealth = new Map(Object.entries(data));
    }
  } catch (_) {
    _handlerHealth = new Map();
  }
}

/**
 * Save handler health state to file.
 */
function saveHandlerState() {
  try {
    const data = Object.fromEntries(_handlerHealth);
    fs.mkdirSync(path.dirname(HANDLER_STATE_FILE), { recursive: true });
    fs.writeFileSync(HANDLER_STATE_FILE, JSON.stringify(data, null, 2));
  } catch (_) {}
}

/**
 * Get or create health record for a handler.
 */
function _getHealth(handlerName) {
  if (!_handlerHealth.has(handlerName)) {
    _handlerHealth.set(handlerName, {
      consecutiveFailures: 0,
      totalFailures: 0,
      totalSuccess: 0,
      lastFailure: null,
      lastSuccess: null,
      disabled: false,
      disabledAt: null,
      lastError: null,
    });
  }
  return _handlerHealth.get(handlerName);
}

/**
 * Record a handler success.
 */
function recordSuccess(handlerName) {
  const health = _getHealth(handlerName);
  health.consecutiveFailures = 0;
  health.totalSuccess++;
  health.lastSuccess = Date.now();
  saveHandlerState();
}

/**
 * Record a handler crash/failure.
 * Returns { disabled: boolean } - whether the handler was disabled.
 */
function recordFailure(handlerName, error) {
  const health = _getHealth(handlerName);
  health.consecutiveFailures++;
  health.totalFailures++;
  health.lastFailure = Date.now();
  health.lastError = error instanceof Error ? error.message : String(error);

  if (health.consecutiveFailures >= HANDLER_CRASH_THRESHOLD && !health.disabled) {
    health.disabled = true;
    health.disabledAt = Date.now();
    resilienceTrace.log('resilience.circuit_open', { handlerName, consecutiveFailures: health.consecutiveFailures, lastError: health.lastError });
    resilienceWAL.append({ type: 'handler_disabled', traceId: handlerName, handlerName, consecutiveFailures: health.consecutiveFailures, lastError: health.lastError });
    resilienceRecovery.trigger({ traceId: handlerName, source: 'resilience', handler: handlerName, reason: 'handler_disabled_after_consecutive_failures' });

    _logAlert('handler_disabled', {
      handlerName,
      consecutiveFailures: health.consecutiveFailures,
      lastError: health.lastError,
      reason: `Handler disabled after ${HANDLER_CRASH_THRESHOLD} consecutive crashes`,
    });
  }

  saveHandlerState();
  return { disabled: health.disabled };
}

/**
 * Check if a handler is disabled. Auto-re-enables after cooldown.
 */
function isHandlerDisabled(handlerName) {
  const health = _getHealth(handlerName);
  if (!health.disabled) return false;

  // Check cooldown: auto-re-enable after cooldown period
  if (health.disabledAt && (Date.now() - health.disabledAt) > HANDLER_COOLDOWN_MS) {
    health.disabled = false;
    health.disabledAt = null;
    health.consecutiveFailures = 0; // Reset for fresh start
    saveHandlerState();

    _logAlert('handler_reenabled', {
      handlerName,
      reason: 'Cooldown period expired, re-enabling handler',
    });

    return false;
  }

  return true;
}

/**
 * Manually re-enable a disabled handler.
 */
function enableHandler(handlerName) {
  const health = _getHealth(handlerName);
  health.disabled = false;
  health.disabledAt = null;
  health.consecutiveFailures = 0;
  saveHandlerState();
}

/**
 * Manually disable a handler.
 */
function disableHandler(handlerName) {
  const health = _getHealth(handlerName);
  health.disabled = true;
  health.disabledAt = Date.now();
  saveHandlerState();
}

// ── Resilient Dispatch ──────────────────────────────────────────

/**
 * Dispatch with handler crash isolation and circuit breaker.
 * 
 * @param {object} rule - Matched rule
 * @param {object} event - Event to process
 * @param {object} [options] - Dispatch options (passed to base dispatcher)
 * @returns {Promise<object>} Dispatch result with resilience metadata
 */
async function dispatch(rule, event, options = {}) {
  if (!_baseDispatcher) {
    return { success: false, error: 'Base dispatcher not available', handler: 'none', duration: 0, retried: false };
  }

  // Determine handler name early for circuit breaker check
  const handlerName = _resolveHandlerName(rule, event, options);

  // Circuit breaker: check if handler is disabled
  if (handlerName && isHandlerDisabled(handlerName)) {
    const health = _getHealth(handlerName);
    const result = {
      success: false,
      error: `Handler "${handlerName}" is disabled (circuit breaker open, ${health.consecutiveFailures} consecutive failures)`,
      handler: handlerName,
      duration: 0,
      retried: false,
      circuitBreakerOpen: true,
      cooldownRemaining: health.disabledAt
        ? Math.max(0, HANDLER_COOLDOWN_MS - (Date.now() - health.disabledAt))
        : 0,
    };

    resilienceTrace.log('resilience.dispatch_blocked', { handlerName, eventType: event.type || 'unknown' });
    resilienceWAL.append({ type: 'dispatch_blocked', traceId: event.traceId || event.id || handlerName, handlerName, eventType: event.type || 'unknown' });

    // Write to manual queue
    _writeManualQueue(rule, event, result.error);

    _logDecision('circuit_breaker_open', {
      handlerName,
      eventType: event.type || 'unknown',
      consecutiveFailures: health.consecutiveFailures,
    });

    return result;
  }

  // Execute with crash isolation
  const startTime = Date.now();
  try {
    const result = await _baseDispatcher.dispatch(rule, event, options);

    if (result.success) {
      if (result.handler && result.handler !== 'none') {
        recordSuccess(result.handler);
      }
    } else {
      if (result.handler && result.handler !== 'none') {
        const { disabled } = recordFailure(result.handler, result.error || 'dispatch failed');
        result.handlerDisabled = disabled;
      }
    }

    result.duration = Date.now() - startTime;
    return result;
  } catch (crashError) {
    // Handler crashed — isolate and continue
    const duration = Date.now() - startTime;
    const effectiveHandler = handlerName || 'unknown';

    const { disabled } = recordFailure(effectiveHandler, crashError);

    // Write to manual queue
    _writeManualQueue(rule, event, crashError);

    _logDecision('handler_crash', {
      handlerName: effectiveHandler,
      eventType: event.type || 'unknown',
      error: crashError.message,
      handlerDisabled: disabled,
    });

    _logAlert('handler_crash', {
      handlerName: effectiveHandler,
      eventType: event.type || 'unknown',
      error: crashError.message,
      stack: crashError.stack ? crashError.stack.split('\n').slice(0, 3).join('\n') : '',
    });

    return {
      success: false,
      error: crashError.message,
      handler: effectiveHandler,
      duration,
      retried: false,
      crashed: true,
      handlerDisabled: disabled,
    };
  }
}

/**
 * Dispatch multiple events with isolation between each.
 * One handler crash does NOT prevent other events from being processed.
 * 
 * @param {Array<{rule: object, event: object}>} items
 * @param {object} [options]
 * @returns {Promise<Array<object>>} Results for each item
 */
async function dispatchBatch(items, options = {}) {
  const results = [];
  for (const item of items) {
    try {
      const result = await dispatch(item.rule, item.event, options);
      results.push(result);
    } catch (err) {
      // Even dispatch() threw — ultimate isolation
      results.push({
        success: false,
        error: err.message,
        handler: 'unknown',
        duration: 0,
        retried: false,
        crashed: true,
      });
    }
  }
  return results;
}

/**
 * Get health status of all tracked handlers.
 * @returns {object}
 */
function getHandlerHealth() {
  const health = {};
  for (const [name, state] of _handlerHealth) {
    health[name] = {
      ...state,
      status: state.disabled ? 'disabled' : state.consecutiveFailures > 0 ? 'degraded' : 'healthy',
    };
  }
  return health;
}

/**
 * Get list of disabled handlers.
 * @returns {string[]}
 */
function getDisabledHandlers() {
  const disabled = [];
  for (const [name, state] of _handlerHealth) {
    if (state.disabled) disabled.push(name);
  }
  return disabled;
}

// ── Internal helpers ────────────────────────────────────────────

function _resolveHandlerName(rule, event, options) {
  // Try to determine handler name without actually executing
  try {
    const routes = options.routes || (_baseDispatcher.reloadRoutes ? _baseDispatcher.reloadRoutes() : {});
    const action = rule.action || event.type || 'unknown';
    const route = _baseDispatcher.findRoute ? _baseDispatcher.findRoute(action, routes) : null;
    return route ? route.config.handler : (rule.handler || null);
  } catch (_) {
    return rule.handler || null;
  }
}

function _writeManualQueue(rule, event, error) {
  if (_baseDispatcher && typeof _baseDispatcher.enqueueManual === 'function') {
    try {
      _baseDispatcher.enqueueManual(rule, event, error);
    } catch (_) {}
  }
}

function _logDecision(action, data) {
  if (_decisionLogger && typeof _decisionLogger.log === 'function') {
    try {
      _decisionLogger.log({
        phase: 'resilience',
        component: 'ResilientDispatcher',
        what: `${action}: ${data.handlerName || 'unknown'}`,
        why: JSON.stringify(data).slice(0, 500),
        confidence: 1.0,
        decision_method: 'circuit_breaker',
      });
    } catch (_) {}
  }
}

function _logAlert(type, data) {
  try {
    const alertFile = path.join(__dirname, 'alerts.jsonl');
    fs.appendFileSync(alertFile, JSON.stringify({ ts: new Date().toISOString(), type, ...data }) + '\n');
  } catch (_) {}
}

// ── Initialize ──────────────────────────────────────────────────
loadHandlerState();

// ── Exports ─────────────────────────────────────────────────────

module.exports = {
  dispatch,
  dispatchBatch,

  // Handler health management
  recordSuccess,
  recordFailure,
  isHandlerDisabled,
  enableHandler,
  disableHandler,
  getHandlerHealth,
  getDisabledHandlers,
  loadHandlerState,
  saveHandlerState,

  // Constants
  HANDLER_CRASH_THRESHOLD,
  HANDLER_COOLDOWN_MS,
  HANDLER_STATE_FILE,

  // For testing
  _handlerHealth,
};
