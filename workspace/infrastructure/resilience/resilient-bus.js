'use strict';

/**
 * Resilient EventBus Adapter — wraps bus.js with:
 *   1. Queue depth monitoring & backpressure (drop low-priority when >100)
 *   2. Dead-letter queue (3 consecutive failures → DLQ, don't block)
 *   3. Backlog alerting (depth >50 → DecisionLog warning)
 *   4. Consumer health tracking
 * 
 * Drop-in replacement for bus-adapter.js when resilience is needed.
 * 
 * @module resilience/resilient-bus
 */

const fs = require('fs');
const path = require('path');

// Underlying bus
let _bus;
try {
  _bus = require('../event-bus/bus');
} catch (_) {
  _bus = null;
}

// Decision Logger
let _decisionLogger = null;
try {
  _decisionLogger = require('../decision-log/decision-logger');
} catch (_) {}

// ── Constants ───────────────────────────────────────────────────
const DLQ_FILE = path.join(__dirname, 'dead-letter.jsonl');
const BACKPRESSURE_THRESHOLD = 100;
const ALERT_THRESHOLD = 50;
const MAX_CONSECUTIVE_FAILURES = 3;

// ── Priority levels for events ──────────────────────────────────
const EVENT_PRIORITY = Object.freeze({
  CRITICAL: 100,
  HIGH: 80,
  NORMAL: 50,
  LOW: 20,
  BACKGROUND: 10,
});

const LOW_PRIORITY_PREFIXES = [
  'system.health',
  'system.monitor',
  'system.stats',
  'background.',
  'telemetry.',
  'debug.',
];

const HIGH_PRIORITY_PREFIXES = [
  'system.error',
  'system.critical',
  'user.message',
  'user.intent',
  'isc.rule',
];

// ── Consumer failure tracking ───────────────────────────────────
// Map<consumerId, Map<eventId, { failCount, lastError, lastAttempt }>>
const _consumerFailures = new Map();

/**
 * Get the priority of an event type.
 * @param {object} event
 * @returns {number}
 */
function getEventPriority(event) {
  if (!event || !event.type) return EVENT_PRIORITY.NORMAL;
  const t = event.type.toLowerCase();

  // Explicit priority in metadata
  if (event.metadata && typeof event.metadata.priority === 'number') {
    return event.metadata.priority;
  }
  if (event.payload && typeof event.payload.priority === 'number') {
    return event.payload.priority;
  }

  for (const prefix of HIGH_PRIORITY_PREFIXES) {
    if (t.startsWith(prefix)) return EVENT_PRIORITY.HIGH;
  }
  for (const prefix of LOW_PRIORITY_PREFIXES) {
    if (t.startsWith(prefix)) return EVENT_PRIORITY.LOW;
  }
  return EVENT_PRIORITY.NORMAL;
}

/**
 * Emit an event with backpressure control.
 * When queue depth exceeds threshold, drops low-priority events.
 * 
 * @param {string} type - Event type
 * @param {object} payload - Event payload
 * @param {string} source - Event source
 * @returns {object} Event object or { dropped: true, reason: string }
 */
function emit(type, payload, source) {
  if (!_bus) {
    throw new Error('[ResilientBus] Underlying bus not available');
  }

  const event = { type, payload: payload || {}, source: source || 'unknown' };
  const priority = getEventPriority(event);

  // Check queue depth for backpressure
  try {
    const stats = _bus.stats();
    const depth = stats.totalEvents || 0;

    // Alert at threshold
    if (depth > ALERT_THRESHOLD && depth <= BACKPRESSURE_THRESHOLD) {
      _logWarning('queue_depth_warning', {
        depth,
        threshold: ALERT_THRESHOLD,
        eventType: type,
      });
    }

    // Backpressure: drop low-priority events when queue is deep
    if (depth > BACKPRESSURE_THRESHOLD && priority <= EVENT_PRIORITY.LOW) {
      _logWarning('backpressure_drop', {
        depth,
        threshold: BACKPRESSURE_THRESHOLD,
        eventType: type,
        priority,
        reason: 'Queue depth exceeded, dropping low-priority event',
      });
      return { dropped: true, reason: 'backpressure', depth, priority };
    }
  } catch (_) {
    // Stats failed — continue emitting (don't block on monitoring failure)
  }

  return _bus.emit(type, payload, source);
}

/**
 * Consume events with dead-letter queue support.
 * Events that fail processing 3 times are moved to DLQ.
 * 
 * @param {string} consumerId
 * @param {object} options
 * @param {Function} [options.processEvent] - If provided, processes each event inline
 * @returns {object[]} Array of consumable events (excluding DLQ'd ones)
 */
function consume(consumerId, options = {}) {
  if (!_bus) return [];

  const events = _bus.consume(consumerId, options);

  // Filter out events that are in DLQ for this consumer
  if (!_consumerFailures.has(consumerId)) {
    _consumerFailures.set(consumerId, new Map());
  }
  const failures = _consumerFailures.get(consumerId);

  const result = events.filter(evt => {
    const failInfo = failures.get(evt.id);
    if (failInfo && failInfo.failCount >= MAX_CONSECUTIVE_FAILURES) {
      // Already in DLQ — skip
      return false;
    }
    return true;
  });

  return result;
}

/**
 * Report a processing failure for an event.
 * After MAX_CONSECUTIVE_FAILURES, moves to dead-letter queue.
 * 
 * @param {string} consumerId
 * @param {string} eventId
 * @param {Error|string} error
 * @param {object} [event] - Full event object (for DLQ record)
 * @returns {{ inDLQ: boolean, failCount: number }}
 */
function reportFailure(consumerId, eventId, error, event) {
  if (!_consumerFailures.has(consumerId)) {
    _consumerFailures.set(consumerId, new Map());
  }
  const failures = _consumerFailures.get(consumerId);

  const existing = failures.get(eventId) || { failCount: 0, errors: [] };
  existing.failCount++;
  existing.lastError = error instanceof Error ? error.message : String(error);
  existing.lastAttempt = Date.now();
  existing.errors.push({
    attempt: existing.failCount,
    error: existing.lastError,
    ts: Date.now(),
  });
  failures.set(eventId, existing);

  if (existing.failCount >= MAX_CONSECUTIVE_FAILURES) {
    // Move to dead-letter queue
    _writeDLQ(consumerId, eventId, existing, event);
    _logWarning('dead_letter', {
      consumerId,
      eventId,
      failCount: existing.failCount,
      lastError: existing.lastError,
      eventType: event ? event.type : 'unknown',
    });

    // Ack the event so it doesn't block other consumers
    try {
      _bus.ack(consumerId, eventId);
    } catch (_) {}

    return { inDLQ: true, failCount: existing.failCount };
  }

  return { inDLQ: false, failCount: existing.failCount };
}

/**
 * Ack an event (pass through to underlying bus).
 */
function ack(consumerId, eventId) {
  if (!_bus) return;
  _bus.ack(consumerId, eventId);

  // Clear failure tracking on successful ack
  if (_consumerFailures.has(consumerId)) {
    _consumerFailures.get(consumerId).delete(eventId);
  }
}

/**
 * Get dead-letter queue entries.
 * @param {number} [limit=50]
 * @returns {object[]}
 */
function getDLQ(limit = 50) {
  try {
    if (!fs.existsSync(DLQ_FILE)) return [];
    const content = fs.readFileSync(DLQ_FILE, 'utf8').trim();
    if (!content) return [];
    const lines = content.split('\n').filter(Boolean);
    return lines.slice(-limit).map(line => {
      try { return JSON.parse(line); } catch (_) { return null; }
    }).filter(Boolean);
  } catch (_) {
    return [];
  }
}

/**
 * Retry a dead-letter event (remove from DLQ tracking).
 * @param {string} consumerId
 * @param {string} eventId
 */
function retryDLQ(consumerId, eventId) {
  if (_consumerFailures.has(consumerId)) {
    _consumerFailures.get(consumerId).delete(eventId);
  }
}

/**
 * Get queue health stats.
 * @returns {object}
 */
function healthStats() {
  const busStats = _bus ? _bus.stats() : { totalEvents: 0, consumers: 0 };
  let dlqCount = 0;
  try {
    if (fs.existsSync(DLQ_FILE)) {
      const content = fs.readFileSync(DLQ_FILE, 'utf8').trim();
      dlqCount = content ? content.split('\n').length : 0;
    }
  } catch (_) {}

  let totalFailures = 0;
  for (const [, failures] of _consumerFailures) {
    totalFailures += failures.size;
  }

  return {
    queueDepth: busStats.totalEvents,
    consumers: busStats.consumers,
    dlqCount,
    trackedFailures: totalFailures,
    backpressureThreshold: BACKPRESSURE_THRESHOLD,
    alertThreshold: ALERT_THRESHOLD,
    status: busStats.totalEvents > BACKPRESSURE_THRESHOLD ? 'backpressure'
      : busStats.totalEvents > ALERT_THRESHOLD ? 'warning'
      : 'healthy',
  };
}

// ── Internal helpers ────────────────────────────────────────────

function _writeDLQ(consumerId, eventId, failInfo, event) {
  const record = {
    ts: new Date().toISOString(),
    consumerId,
    eventId,
    eventType: event ? event.type : 'unknown',
    failCount: failInfo.failCount,
    errors: failInfo.errors,
    event: event || null,
  };
  try {
    fs.mkdirSync(path.dirname(DLQ_FILE), { recursive: true });
    fs.appendFileSync(DLQ_FILE, JSON.stringify(record) + '\n');
  } catch (_) {}
}

function _logWarning(type, data) {
  if (_decisionLogger && typeof _decisionLogger.log === 'function') {
    try {
      _decisionLogger.log({
        phase: 'resilience',
        component: 'ResilientBus',
        what: `${type}: ${data.eventType || data.eventId || 'unknown'}`,
        why: JSON.stringify(data).slice(0, 500),
        confidence: 1.0,
        decision_method: 'queue_monitoring',
      });
    } catch (_) {}
  }

  // Also write to alert log
  try {
    const alertFile = path.join(__dirname, 'alerts.jsonl');
    fs.appendFileSync(alertFile, JSON.stringify({ ts: new Date().toISOString(), type, ...data }) + '\n');
  } catch (_) {}
}

// ── Exports ─────────────────────────────────────────────────────

module.exports = {
  emit,
  consume,
  ack,
  reportFailure,
  getDLQ,
  retryDLQ,
  healthStats,
  getEventPriority,

  // Pass-through to underlying bus
  history: (...args) => _bus ? _bus.history(...args) : [],
  stats: () => _bus ? _bus.stats() : {},
  purge: () => _bus ? _bus.purge() : null,

  // Constants
  EVENT_PRIORITY,
  BACKPRESSURE_THRESHOLD,
  ALERT_THRESHOLD,
  MAX_CONSECUTIVE_FAILURES,
  DLQ_FILE,

  // For testing
  _consumerFailures,
  _bus,
};
