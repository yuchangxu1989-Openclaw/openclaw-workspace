'use strict';

/**
 * Tests for intent-dispatch handler.
 * Run: node test-intent-dispatch.js
 */

const path = require('path');
const fs = require('fs');
const assert = require('assert');

// ─── Setup: Mock dependencies before require ─────────────────────

// Mock bus.emit calls
const emittedEvents = [];
const mockBus = {
  emit(type, payload, source) {
    emittedEvents.push({ type, payload, source });
    return { id: `mock-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` };
  },
};

// Inject mock bus into require cache
const busPath = path.resolve(__dirname, '..', '..', 'event-bus', 'bus.js');
require.cache[busPath] = { id: busPath, filename: busPath, loaded: true, exports: mockBus };

// Mock decision-logger (optional, non-fatal if missing)
const loggedDecisions = [];
const mockLogger = {
  log(entry) { loggedDecisions.push(entry); },
};
const loggerPath = path.resolve(__dirname, '..', '..', 'decision-log', 'decision-logger.js');
require.cache[loggerPath] = { id: loggerPath, filename: loggerPath, loaded: true, exports: mockLogger };

// ─── Load handler ────────────────────────────────────────────────

const handler = require('./intent-dispatch');
const {
  IC,
  handleEmotion,
  handleRuleTrigger,
  handleComplex,
  handleImplicit,
  handleCompound,
  parseIntentClassFromType,
} = handler;

// ─── Temp file cleanup ──────────────────────────────────────────

const EMOTION_LOG = path.resolve(__dirname, '..', '..', 'decision-log', 'emotion-log.jsonl');
const MANUAL_QUEUE = path.resolve(__dirname, '..', 'manual-queue.jsonl');

function cleanupTestFiles() {
  // Only remove test-generated content, not real data
  // We'll read line counts before/after to verify writes
}

// ─── Test Helpers ────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name, fn) {
  emittedEvents.length = 0;
  loggedDecisions.length = 0;
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ❌ ${name}: ${err.message}`);
  }
}

function makeEvent(type, payload, id) {
  return {
    id: id || `test-${Date.now()}`,
    type,
    payload: payload || {},
    source: 'test',
  };
}

const defaultContext = {
  handlerName: 'intent-dispatch',
  matchedPattern: 'user.intent.*',
};

// ─── Tests ───────────────────────────────────────────────────────

console.log('\n🧪 intent-dispatch handler tests\n');

// --- IC Constants ---
console.log('IC Constants:');

test('IC constants are defined', () => {
  assert.strictEqual(IC.EMOTION, 1);
  assert.strictEqual(IC.RULE, 2);
  assert.strictEqual(IC.COMPLEX, 3);
  assert.strictEqual(IC.IMPLICIT, 4);
  assert.strictEqual(IC.COMPOUND, 5);
});

// --- parseIntentClassFromType ---
console.log('\nparseIntentClassFromType:');

test('parses emotion type', () => {
  assert.strictEqual(parseIntentClassFromType('user.intent.emotion'), IC.EMOTION);
});

test('parses rule type', () => {
  assert.strictEqual(parseIntentClassFromType('user.intent.rule'), IC.RULE);
});

test('parses complex type', () => {
  assert.strictEqual(parseIntentClassFromType('user.intent.complex'), IC.COMPLEX);
});

test('parses implicit type', () => {
  assert.strictEqual(parseIntentClassFromType('user.intent.implicit'), IC.IMPLICIT);
});

test('parses compound type', () => {
  assert.strictEqual(parseIntentClassFromType('user.intent.compound'), IC.COMPOUND);
});

test('returns null for unknown type', () => {
  assert.strictEqual(parseIntentClassFromType('user.intent.unknown'), null);
  assert.strictEqual(parseIntentClassFromType('something.else'), null);
});

// --- IC1: Emotion ---
console.log('\nIC1 Emotion Handler:');

test('records emotion to log file', () => {
  const event = makeEvent('user.intent.emotion', {
    emotion: 'frustration',
    intensity: 'high',
    rawText: 'this is so annoying',
  });
  const result = handleEmotion(event, defaultContext);
  assert.strictEqual(result.action, 'recorded');
  assert.strictEqual(result.target, 'emotion-log');
  assert.strictEqual(result.record.emotion, 'frustration');
  assert.strictEqual(result.record.intensity, 'high');

  // Verify file was written
  assert.ok(fs.existsSync(EMOTION_LOG), 'emotion-log.jsonl should exist');
});

test('handles missing emotion fields gracefully', () => {
  const event = makeEvent('user.intent.emotion', {});
  const result = handleEmotion(event, defaultContext);
  assert.strictEqual(result.action, 'recorded');
  assert.strictEqual(result.record.emotion, 'unspecified');
  assert.strictEqual(result.record.intensity, 'medium');
});

// --- IC2: Rule Trigger ---
console.log('\nIC2 Rule Trigger Handler:');

test('triggers ISC rule via bus', () => {
  const event = makeEvent('user.intent.rule', { ruleId: 'R001' });
  const result = handleRuleTrigger(event, defaultContext);
  assert.strictEqual(result.action, 'triggered');
  assert.strictEqual(result.ruleId, 'R001');
  assert.strictEqual(emittedEvents.length, 1);
  assert.strictEqual(emittedEvents[0].type, 'isc.rule.triggered');
  assert.strictEqual(emittedEvents[0].payload.ruleId, 'R001');
});

test('handles matchedRule field', () => {
  const event = makeEvent('user.intent.rule', { matchedRule: 'R042' });
  const result = handleRuleTrigger(event, defaultContext);
  assert.strictEqual(result.ruleId, 'R042');
});

test('returns error when no ruleId', () => {
  const event = makeEvent('user.intent.rule', {});
  const result = handleRuleTrigger(event, defaultContext);
  assert.strictEqual(result.action, 'error');
  assert.ok(result.reason.includes('No ruleId'));
});

// --- IC3: Complex ---
console.log('\nIC3 Complex Handler:');

test('enqueues complex intent to manual queue', () => {
  const event = makeEvent('user.intent.complex', {
    reason: 'ambiguous multi-domain request',
    summary: 'User wants both a refund and a product change',
  });
  const result = handleComplex(event, defaultContext);
  assert.strictEqual(result.action, 'queued');
  assert.strictEqual(result.target, 'manual-queue');
  assert.strictEqual(result.record.status, 'pending_review');
});

// --- IC4: Implicit ---
console.log('\nIC4 Implicit Handler:');

test('forwards implicit intent to CRAS', () => {
  const event = makeEvent('user.intent.implicit', {
    rawText: 'I guess that could work...',
    signals: ['hesitation', 'uncertainty'],
  });
  const result = handleImplicit(event, defaultContext);
  assert.strictEqual(result.action, 'forwarded');
  assert.strictEqual(result.target, 'cras-insight');
  assert.strictEqual(emittedEvents.length, 1);
  assert.strictEqual(emittedEvents[0].type, 'cras.insight.request');
  assert.deepStrictEqual(emittedEvents[0].payload.signals, ['hesitation', 'uncertainty']);
});

// --- IC5: Compound ---
console.log('\nIC5 Compound Handler:');

test('splits compound intent into sub-intents', () => {
  const event = makeEvent('user.intent.compound', {
    subIntents: [
      { type: 'user.intent.emotion', payload: { emotion: 'joy' } },
      { type: 'user.intent.rule', payload: { ruleId: 'R010' } },
    ],
  });
  const result = handleCompound(event, defaultContext);
  assert.strictEqual(result.action, 'split');
  assert.strictEqual(result.subIntents.length, 2);
  assert.strictEqual(emittedEvents.length, 2);
  assert.strictEqual(emittedEvents[0].type, 'user.intent.emotion');
  assert.strictEqual(emittedEvents[1].type, 'user.intent.rule');
});

test('handles empty subIntents', () => {
  const event = makeEvent('user.intent.compound', { subIntents: [] });
  const result = handleCompound(event, defaultContext);
  assert.strictEqual(result.action, 'noop');
});

test('handles missing subIntents field', () => {
  const event = makeEvent('user.intent.compound', {});
  const result = handleCompound(event, defaultContext);
  assert.strictEqual(result.action, 'noop');
});

// --- Main Handler (routing) ---
console.log('\nMain Handler Routing:');

test('routes by intentClass in payload', () => {
  const event = makeEvent('user.intent.test', { intentClass: IC.EMOTION, emotion: 'happy' });
  const result = handler(event, defaultContext);
  assert.strictEqual(result.action, 'recorded');
});

test('routes by ic shorthand in payload', () => {
  const event = makeEvent('user.intent.test', { ic: IC.IMPLICIT, rawText: 'hmm' });
  const result = handler(event, defaultContext);
  assert.strictEqual(result.action, 'forwarded');
});

test('routes by event type suffix', () => {
  const event = makeEvent('user.intent.emotion', {});
  const result = handler(event, defaultContext);
  assert.strictEqual(result.action, 'recorded');
});

test('falls back to manual queue for unknown class', () => {
  const event = makeEvent('user.intent.weird', { intentClass: 99 });
  const result = handler(event, defaultContext);
  assert.strictEqual(result.action, 'queued');
  assert.strictEqual(result.target, 'manual-queue');
});

test('falls back to manual queue for missing class', () => {
  const event = makeEvent('user.intent.unknown', {});
  const result = handler(event, defaultContext);
  assert.strictEqual(result.action, 'queued');
});

// --- DecisionLog Integration ---
console.log('\nDecisionLog Integration:');

test('logs decisions via DecisionLogger', () => {
  loggedDecisions.length = 0;
  const event = makeEvent('user.intent.emotion', { emotion: 'calm' });
  handler(event, defaultContext);
  assert.ok(loggedDecisions.length > 0, 'Should have logged at least one decision');
  assert.strictEqual(loggedDecisions[0].component, 'IntentDispatch');
  assert.strictEqual(loggedDecisions[0].phase, 'execution');
});

// ─── Summary ─────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log('✅ All tests passed!\n');
}
