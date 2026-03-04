'use strict';

/**
 * Intent Dispatch Handler v1.0
 *
 * Receives L3-detected user intent events (user.intent.*) and dispatches
 * them based on intent classification:
 *
 *   IC1 (emotion)   → Record to emotion log
 *   IC2 (rule)      → Trigger corresponding ISC rule via event bus
 *   IC3 (complex)   → Enqueue to manual/human review queue
 *   IC4 (implicit)  → Forward to CRAS for insight extraction
 *   IC5 (compound)  → Split into sub-intents and re-emit each
 *
 * CommonJS, pure Node.js, zero external dependencies.
 */

const fs = require('fs');
const path = require('path');

// ─── Paths ───────────────────────────────────────────────────────

const EMOTION_LOG = path.join(__dirname, '..', '..', 'decision-log', 'emotion-log.jsonl');
const MANUAL_QUEUE = path.join(__dirname, '..', 'manual-queue.jsonl');

// ─── Decision Logger ─────────────────────────────────────────────

let _decisionLogger = null;
try {
  _decisionLogger = require('../../decision-log/decision-logger');
} catch (_) {
  // DecisionLogger unavailable — continue without it
}

function logDecision(entry) {
  if (_decisionLogger && typeof _decisionLogger.log === 'function') {
    try {
      _decisionLogger.log({
        phase: 'execution',
        component: 'IntentDispatch',
        what: entry.what || `IC${entry.intentClass} dispatch`,
        why: entry.why || 'L3 intent classification routing',
        confidence: entry.confidence || 0.9,
        decision_method: 'rule_match',
        input_summary: JSON.stringify(entry).slice(0, 500),
      });
    } catch (_) { /* best-effort */ }
  }
}

// ─── Event Bus (lazy) ────────────────────────────────────────────

let _bus = null;
function getBus() {
  if (_bus) return _bus;
  try {
    _bus = require('../../event-bus/bus.js');
  } catch (_) {
    _bus = null;
  }
  return _bus;
}

// ─── Intent Classification Constants ─────────────────────────────

const IC = {
  EMOTION: 1,    // IC1: Emotional expression
  RULE:    2,    // IC2: Rule-triggering intent
  COMPLEX: 3,    // IC3: Complex intent requiring human review
  IMPLICIT:4,    // IC4: Implicit/hidden intent
  COMPOUND:5,    // IC5: Compound intent (multiple sub-intents)
};

// ─── Dispatch Strategies ─────────────────────────────────────────

/**
 * IC1: Record emotion to dedicated log.
 */
function handleEmotion(event, _context) {
  const record = {
    ts: new Date().toISOString(),
    eventId: event.id || 'unknown',
    type: 'emotion',
    emotion: event.payload?.emotion || event.payload?.label || 'unspecified',
    intensity: event.payload?.intensity || 'medium',
    rawText: event.payload?.rawText || '',
    source: event.source || 'L3',
  };

  const dir = path.dirname(EMOTION_LOG);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(EMOTION_LOG, JSON.stringify(record) + '\n');

  logDecision({
    intentClass: IC.EMOTION,
    what: `Recorded emotion: ${record.emotion}`,
    why: 'IC1 emotion detected, logged for sentiment tracking',
  });

  return { action: 'recorded', target: 'emotion-log', record };
}

/**
 * IC2: Trigger the corresponding ISC rule via event bus.
 */
function handleRuleTrigger(event, _context) {
  const ruleId = event.payload?.ruleId || event.payload?.matchedRule || null;
  const bus = getBus();

  if (!ruleId) {
    logDecision({
      intentClass: IC.RULE,
      what: 'IC2 rule trigger failed: no ruleId in payload',
      why: 'Missing ruleId, cannot dispatch',
      confidence: 0.5,
    });
    return { action: 'error', reason: 'No ruleId in intent payload' };
  }

  if (bus && typeof bus.emit === 'function') {
    bus.emit(`isc.rule.triggered`, {
      ruleId,
      triggeredBy: 'intent-dispatch',
      originalEvent: event.id || 'unknown',
      intentPayload: event.payload,
    }, 'intent-dispatch');
  }

  logDecision({
    intentClass: IC.RULE,
    what: `Triggered ISC rule: ${ruleId}`,
    why: 'IC2 rule-triggering intent matched to ISC rule',
  });

  return { action: 'triggered', target: 'isc-rule', ruleId };
}

/**
 * IC3: Enqueue to manual/human review queue.
 */
function handleComplex(event, _context) {
  const record = {
    ts: new Date().toISOString(),
    eventId: event.id || 'unknown',
    type: 'complex_intent',
    reason: event.payload?.reason || 'IC3: requires human judgment',
    summary: event.payload?.summary || event.payload?.rawText || '',
    payload: event.payload,
    source: event.source || 'L3',
    status: 'pending_review',
  };

  fs.appendFileSync(MANUAL_QUEUE, JSON.stringify(record) + '\n');

  logDecision({
    intentClass: IC.COMPLEX,
    what: 'Complex intent queued for human review',
    why: 'IC3 complexity exceeds automated handling threshold',
  });

  return { action: 'queued', target: 'manual-queue', record };
}

/**
 * IC4: Forward to CRAS for insight extraction.
 */
function handleImplicit(event, _context) {
  const bus = getBus();

  const insightPayload = {
    source: 'intent-dispatch',
    intentType: 'implicit',
    originalEvent: event.id || 'unknown',
    rawText: event.payload?.rawText || '',
    signals: event.payload?.signals || [],
    context: event.payload?.context || {},
  };

  if (bus && typeof bus.emit === 'function') {
    bus.emit('cras.insight.request', insightPayload, 'intent-dispatch');
  }

  logDecision({
    intentClass: IC.IMPLICIT,
    what: 'Implicit intent forwarded to CRAS',
    why: 'IC4 hidden intent detected, CRAS will extract deeper insight',
  });

  return { action: 'forwarded', target: 'cras-insight', payload: insightPayload };
}

/**
 * IC5: Split compound intent into sub-intents and re-emit each.
 */
function handleCompound(event, _context) {
  const subIntents = event.payload?.subIntents || [];
  const bus = getBus();
  const results = [];

  if (subIntents.length === 0) {
    logDecision({
      intentClass: IC.COMPOUND,
      what: 'IC5 compound intent has no sub-intents',
      why: 'Empty subIntents array, nothing to split',
      confidence: 0.5,
    });
    return { action: 'noop', reason: 'No sub-intents found in compound intent' };
  }

  for (const sub of subIntents) {
    const subType = sub.type || 'user.intent.unknown';
    const subEvent = {
      type: subType,
      payload: {
        ...sub.payload,
        parentEventId: event.id || 'unknown',
        splitFrom: 'compound',
      },
      source: 'intent-dispatch',
    };

    if (bus && typeof bus.emit === 'function') {
      const emitted = bus.emit(subType, subEvent.payload, 'intent-dispatch');
      results.push({ subType, eventId: emitted?.id || 'emitted' });
    } else {
      results.push({ subType, eventId: 'bus_unavailable' });
    }
  }

  logDecision({
    intentClass: IC.COMPOUND,
    what: `Split compound intent into ${results.length} sub-intents`,
    why: 'IC5 compound intent decomposed for individual processing',
  });

  return { action: 'split', target: 'event-bus', subIntents: results };
}

// ─── Dispatch Table ──────────────────────────────────────────────

const DISPATCH_TABLE = {
  [IC.EMOTION]:  handleEmotion,
  [IC.RULE]:     handleRuleTrigger,
  [IC.COMPLEX]:  handleComplex,
  [IC.IMPLICIT]: handleImplicit,
  [IC.COMPOUND]: handleCompound,
};

// ─── Main Handler ────────────────────────────────────────────────

/**
 * Intent dispatch handler entry point.
 * Called by the Dispatcher when a user.intent.* event matches.
 *
 * @param {object} event - The intent event
 * @param {object} context - Dispatcher context { rule, route, handlerName, matchedPattern }
 * @returns {object} Dispatch result
 */
function intentDispatchHandler(event, context) {
  const intentClass = event.payload?.intentClass
    || event.payload?.ic
    || parseIntentClassFromType(event.type || event.eventType || '');

  if (!intentClass || !DISPATCH_TABLE[intentClass]) {
    logDecision({
      intentClass: intentClass || 'unknown',
      what: `Unknown intent class: ${intentClass}`,
      why: 'No matching dispatch strategy',
      confidence: 0.3,
    });
    // Default to manual queue for safety
    return handleComplex(event, context);
  }

  const handler = DISPATCH_TABLE[intentClass];
  return handler(event, context);
}

/**
 * Parse intent class from event type string.
 * e.g., "user.intent.emotion" → IC1, "user.intent.rule" → IC2
 */
function parseIntentClassFromType(type) {
  const suffix = type.split('.').pop();
  const map = {
    emotion:  IC.EMOTION,
    rule:     IC.RULE,
    complex:  IC.COMPLEX,
    implicit: IC.IMPLICIT,
    compound: IC.COMPOUND,
  };
  return map[suffix] || null;
}

// ─── Exports ─────────────────────────────────────────────────────

module.exports = intentDispatchHandler;

// Also export internals for testing
module.exports.IC = IC;
module.exports.DISPATCH_TABLE = DISPATCH_TABLE;
module.exports.handleEmotion = handleEmotion;
module.exports.handleRuleTrigger = handleRuleTrigger;
module.exports.handleComplex = handleComplex;
module.exports.handleImplicit = handleImplicit;
module.exports.handleCompound = handleCompound;
module.exports.parseIntentClassFromType = parseIntentClassFromType;
