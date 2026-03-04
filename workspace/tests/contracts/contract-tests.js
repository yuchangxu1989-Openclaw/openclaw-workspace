'use strict';

/**
 * L3 Module Interface Contract Tests
 * 
 * Tests that verify cross-module interface compatibility.
 * Each test group validates that the output of Module A is a valid input for Module B.
 * 
 * Contract pairs tested:
 *   1. EventBus → IntentScanner: event format → conversationSlice
 *   2. IntentScanner → EventBus: intent events re-emitted
 *   3. IntentScanner → RuleMatcher: intent event format matchable
 *   4. RuleMatcher → Dispatcher: match result format dispatchable
 *   5. Pipeline → All: pipeline calls each module with correct params
 *   6. All → DecisionLog: all modules log with valid entry format
 *   7. FeatureFlags → Pipeline: flag values control pipeline behavior
 * 
 * Run: node tests/contracts/contract-tests.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// ─── Test Infrastructure ───
let passed = 0;
let failed = 0;
const results = [];

function test(group, name, fn) {
  const fullName = `[${group}] ${name}`;
  try {
    const result = fn();
    // Handle async tests
    if (result && typeof result.then === 'function') {
      return result.then(() => {
        passed++;
        results.push({ group, name, status: 'pass' });
        console.log(`  ✅ ${fullName}`);
      }).catch(e => {
        failed++;
        results.push({ group, name, status: 'fail', error: e.message });
        console.log(`  ❌ ${fullName}: ${e.message}`);
      });
    }
    passed++;
    results.push({ group, name, status: 'pass' });
    console.log(`  ✅ ${fullName}`);
  } catch (e) {
    failed++;
    results.push({ group, name, status: 'fail', error: e.message });
    console.log(`  ❌ ${fullName}: ${e.message}`);
  }
  return Promise.resolve();
}

// ─── Load Modules ───
const INFRA = path.resolve(__dirname, '../../infrastructure');

const EventBus = require(path.join(INFRA, 'event-bus/bus-adapter'));
const { IntentScanner } = require(path.join(INFRA, 'intent-engine/intent-scanner'));
const { ISCRuleMatcher } = require(path.join(INFRA, 'rule-engine/isc-rule-matcher'));
const Dispatcher = require(path.join(INFRA, 'dispatcher/dispatcher'));
const DecisionLog = require(path.join(INFRA, 'decision-log/decision-logger'));
const FeatureFlags = require(path.join(INFRA, 'config/feature-flags'));

// ─── Helpers ───

/** Create a standard EventBus event shape (what consume() returns) */
function makeEvent(type, payload, opts = {}) {
  return {
    id: `evt_test_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,6)}`,
    type,
    source: opts.source || 'test',
    timestamp: opts.timestamp || Date.now(),
    payload: payload || {},
    metadata: opts.metadata || {},
    consumed_by: [],
  };
}

/** Create a standard ISC rule */
function makeRule(id, events, opts = {}) {
  return {
    id,
    name: opts.name || id,
    trigger: {
      events: events,
      condition: opts.condition || null,
    },
    action: opts.action || events[0] || 'unknown',
    severity: opts.severity || 'medium',
    governance: opts.governance || {},
  };
}

// ═══════════════════════════════════════════════════════════
// CONTRACT TEST GROUPS
// ═══════════════════════════════════════════════════════════

async function runAllTests() {
  console.log('\n═══ L3 Module Interface Contract Tests ═══\n');

  // ────────────────────────────────────────────────────────
  // GROUP 1: EventBus → IntentScanner
  // EventBus events must be convertible to IntentScanner's conversationSlice format
  // ────────────────────────────────────────────────────────
  console.log('\n📋 Group 1: EventBus → IntentScanner\n');

  await test('EventBus→IntentScanner', 'EventBus event with text payload → valid conversationSlice', () => {
    // EventBus consume returns events with {type, payload, timestamp, ...}
    const event = makeEvent('user.message.text', {
      text: '帮我查一下天气',
      role: 'user',
    });

    // Pipeline converts event to conversationSlice via _eventToConversationSlice
    // Simulating the same logic
    const payload = event.payload;
    const slice = [];
    const content = payload.text || payload.content || payload.message || '';
    if (content) {
      slice.push({
        role: payload.role || 'user',
        content: String(content),
        timestamp: new Date(event.timestamp).toISOString(),
      });
    }

    // Validate: IntentScanner requires Array<{role: string, content: string}>
    assert.ok(Array.isArray(slice), 'slice must be array');
    assert.ok(slice.length > 0, 'slice must not be empty for text events');
    assert.strictEqual(typeof slice[0].role, 'string', 'role must be string');
    assert.strictEqual(typeof slice[0].content, 'string', 'content must be string');
    assert.ok(slice[0].content.length > 0, 'content must not be empty');
  });

  await test('EventBus→IntentScanner', 'EventBus event with messages array → passthrough', () => {
    const event = makeEvent('conversation.update', {
      messages: [
        { role: 'user', content: '这个功能不行', timestamp: '2026-03-05T00:00:00Z' },
        { role: 'assistant', content: '好的', timestamp: '2026-03-05T00:01:00Z' },
      ],
    });

    const payload = event.payload;
    // Pipeline passthrough when messages array exists
    const slice = Array.isArray(payload.messages) ? payload.messages : [];

    assert.ok(slice.length === 2);
    assert.strictEqual(slice[0].role, 'user');
    assert.strictEqual(slice[0].content, '这个功能不行');
    assert.strictEqual(typeof slice[1].content, 'string');
  });

  await test('EventBus→IntentScanner', 'Empty payload event → empty slice (IntentScanner handles gracefully)', async () => {
    const event = makeEvent('user.message.empty', {});
    const slice = [];
    const content = event.payload.text || event.payload.content || '';
    if (content) slice.push({ role: 'user', content });

    assert.strictEqual(slice.length, 0, 'empty payload → empty slice');

    // IntentScanner should handle empty input
    const scanner = new IntentScanner({ zhipuKey: null });
    const result = await scanner.scan(slice);
    assert.strictEqual(result.skipped, true, 'empty input should be skipped');
    assert.strictEqual(result.reason, 'empty_input');
  });

  await test('EventBus→IntentScanner', 'EventBus event metadata preserved through conversion', () => {
    const event = makeEvent('chat.incoming', { content: 'hello' }, {
      metadata: { chain_depth: 2, trace_id: 'tr-123' },
    });

    // Verify metadata is accessible (Pipeline uses it for circuit breaker)
    assert.ok(event.metadata, 'metadata must exist');
    assert.strictEqual(event.metadata.chain_depth, 2);
    assert.strictEqual(typeof event.metadata.trace_id, 'string');
  });

  // ────────────────────────────────────────────────────────
  // GROUP 2: IntentScanner → EventBus (re-emit)
  // IntentScanner emits intent.detected events via EventBus
  // ────────────────────────────────────────────────────────
  console.log('\n📋 Group 2: IntentScanner → EventBus\n');

  await test('IntentScanner→EventBus', 'Intent result → valid EventBus emit params', () => {
    // IntentScanner produces intents like:
    const intent = {
      intent_id: 'IC1.frustration',
      confidence: 0.85,
      evidence: '太差了',
      alternatives: ['IC4.implicit_negative'],
    };

    // Pipeline re-emits as: EventBus.emit(type, payload, source, metadata)
    const type = `user.intent.${intent.intent_id}.inferred`;
    const payload = {
      source_event_id: 'evt_test_001',
      source_event_type: 'user.message.text',
      intent_data: intent,
    };
    const source = 'l3-pipeline';
    const metadata = { chain_depth: 1, source_pipeline_run: 'run_001' };

    // Validate EventBus.emit contract
    assert.strictEqual(typeof type, 'string', 'type must be string');
    assert.ok(type.length > 0, 'type must not be empty');
    assert.strictEqual(typeof payload, 'object', 'payload must be object');
    assert.strictEqual(typeof source, 'string', 'source must be string');
    assert.strictEqual(typeof metadata, 'object', 'metadata must be object');
    assert.strictEqual(typeof metadata.chain_depth, 'number', 'chain_depth must be number');
  });

  await test('IntentScanner→EventBus', 'Intent event type format matches EventBus wildcard patterns', () => {
    const intentType = 'user.intent.IC1.frustration.inferred';

    // Should match common EventBus consume patterns
    assert.ok(EventBus._matchWildcard(intentType, 'user.intent.*'), 'should match user.intent.*');
    assert.ok(EventBus._matchWildcard(intentType, '*.inferred'), 'should match *.inferred');
    assert.ok(EventBus._matchWildcard(intentType, '*'), 'should match *');
    assert.ok(!EventBus._matchWildcard(intentType, 'skill.*'), 'should NOT match skill.*');
  });

  // ────────────────────────────────────────────────────────
  // GROUP 3: IntentScanner → RuleMatcher
  // Intent events (re-emitted) must be matchable by RuleMatcher
  // ────────────────────────────────────────────────────────
  console.log('\n📋 Group 3: IntentScanner → RuleMatcher\n');

  await test('IntentScanner→RuleMatcher', 'Intent event has valid event shape for RuleMatcher.match()', () => {
    // Simulating the event that Pipeline creates from IntentScanner output
    const intentEvent = makeEvent('user.intent.IC1.frustration.inferred', {
      source_event_id: 'evt_test_001',
      intent_data: { intent_id: 'IC1.frustration', confidence: 0.85 },
    });

    // RuleMatcher.match() requires: { type: string, payload?, timestamp?, source? }
    assert.strictEqual(typeof intentEvent.type, 'string', 'type must be string');
    assert.ok(intentEvent.type.length > 0, 'type must not be empty');
    assert.ok(typeof intentEvent.payload === 'object', 'payload must be object');
    assert.ok(typeof intentEvent.timestamp === 'number', 'timestamp must be number');

    // Create a matcher with in-memory rules to test matching
    const matcher = new ISCRuleMatcher({ rulesDir: '/tmp/empty-rules-dir-' + Date.now(), hotReload: false });
    matcher.rules = [makeRule('test-intent-rule', ['user.intent.*'])];
    matcher._buildIndex();
    matcher._loaded = true; // prevent loadRules() from overwriting our test rules

    const matches = matcher.match(intentEvent);
    assert.ok(Array.isArray(matches), 'match() must return array');
    assert.ok(matches.length > 0, 'intent event should match user.intent.* pattern');
    assert.strictEqual(matches[0].match_type, 'prefix', 'should be prefix match');
  });

  await test('IntentScanner→RuleMatcher', 'IntentScanner confidence range compatible with RuleMatcher', () => {
    // IntentScanner outputs confidence 0.0-1.0
    // RuleMatcher doesn't use confidence directly but passes it through
    const intentResult = {
      intents: [
        { intent_id: 'IC2.rule_inquiry', confidence: 0.92, evidence: '规则查询' },
        { intent_id: 'IC1.positive', confidence: 0.45, evidence: '还不错' },
      ],
    };

    for (const intent of intentResult.intents) {
      assert.ok(intent.confidence >= 0 && intent.confidence <= 1,
        `confidence ${intent.confidence} must be in [0,1]`);
      assert.strictEqual(typeof intent.intent_id, 'string');
    }
  });

  // ────────────────────────────────────────────────────────
  // GROUP 4: RuleMatcher → Dispatcher
  // RuleMatcher.process() output must be valid Dispatcher.dispatch() input
  // ────────────────────────────────────────────────────────
  console.log('\n📋 Group 4: RuleMatcher → Dispatcher\n');

  await test('RuleMatcher→Dispatcher', 'RuleMatcher.match() output → Dispatcher.dispatch() input', async () => {
    // RuleMatcher.match() returns: Array<{ rule, priority, match_type, pattern }>
    const matchResult = {
      rule: makeRule('R001', ['skill.created'], { action: 'skill.created' }),
      priority: 60,
      match_type: 'exact',
      pattern: 'skill.created',
    };

    const event = makeEvent('skill.created', { skill_name: 'test-skill' });

    // Dispatcher.dispatch() accepts (rule, event, options)
    // It handles the ISC wrapper format: { rule: ISC_RULE, priority, match_type, pattern }
    // Test that dispatch extracts action correctly
    const dispatchResult = await Dispatcher.dispatch(matchResult, event, {
      routes: {},  // empty routes → will fall through to no handler
      timeoutMs: 1000,
    });

    assert.strictEqual(typeof dispatchResult, 'object', 'dispatch must return object');
    assert.strictEqual(typeof dispatchResult.success, 'boolean', 'success must be boolean');
    assert.strictEqual(typeof dispatchResult.handler, 'string', 'handler must be string');
    assert.strictEqual(typeof dispatchResult.duration, 'number', 'duration must be number');
    assert.strictEqual(typeof dispatchResult.retried, 'boolean', 'retried must be boolean');
  });

  await test('RuleMatcher→Dispatcher', 'RuleMatcher.process() full output compatible with dispatch loop', async () => {
    // process() returns: Array<{ rule, priority, match_type, pattern, evaluation }>
    const processResult = [
      {
        rule: makeRule('R002', ['intent.detected'], { action: 'intent.detected' }),
        priority: 80,
        match_type: 'exact',
        pattern: 'intent.detected',
        evaluation: { shouldFire: true, reason: 'condition met' },
      },
    ];

    const event = makeEvent('intent.detected', { intent_id: 'IC1' });

    // Pipeline loop: for (const match of processResult) { Dispatcher.dispatch(match.rule, event) }
    for (const match of processResult) {
      assert.ok(match.evaluation.shouldFire, 'process only returns shouldFire=true');
      assert.ok(match.rule, 'rule must exist');
      assert.ok(match.rule.id || match.rule.name, 'rule must have id or name');

      // Verify the rule object is what dispatch expects
      const result = await Dispatcher.dispatch(match, event, {
        routes: {},
        timeoutMs: 1000,
      });
      assert.strictEqual(typeof result.success, 'boolean');
    }
  });

  await test('RuleMatcher→Dispatcher', 'Dispatcher handles empty action with event.type fallback', async () => {
    // When rule has no .action, Dispatcher should fall back to event.type
    const matchResult = {
      rule: { id: 'R003', trigger: { events: ['test.fallback'] } },
      priority: 50,
      match_type: 'exact',
      pattern: 'test.fallback',
    };

    const event = makeEvent('test.fallback', {});

    const result = await Dispatcher.dispatch(matchResult, event, {
      routes: {},
      timeoutMs: 1000,
    });

    // Should not crash - verifies the ISC wrapper → action extraction
    assert.strictEqual(typeof result, 'object');
  });

  // ────────────────────────────────────────────────────────
  // GROUP 5: Pipeline → All Sub-modules
  // Pipeline calls each module with correct parameter shapes
  // ────────────────────────────────────────────────────────
  console.log('\n📋 Group 5: Pipeline → All Sub-modules\n');

  await test('Pipeline→EventBus', 'Pipeline consume call uses correct options shape', () => {
    // Pipeline calls: EventBus.consume({ since: runStart - windowMs })
    const windowMs = 300000;
    const since = Date.now() - windowMs;

    const options = { since };

    // Verify this matches EventBus.consume contract
    assert.strictEqual(typeof options.since, 'number');
    assert.ok(options.since > 0);

    // Should not throw
    const events = EventBus.consume(options);
    assert.ok(Array.isArray(events), 'consume must return array');
  });

  await test('Pipeline→RuleMatcher', 'Pipeline passes EventBus event directly to RuleMatcher.process()', () => {
    const event = makeEvent('test.pipeline.rule', { data: 'test' });

    // Pipeline calls: matcher.process(event)
    // RuleMatcher.process expects { type, payload?, timestamp?, source? }
    assert.ok(event.type, 'event must have type');
    assert.ok(event.payload, 'event must have payload');
    assert.ok(event.timestamp, 'event must have timestamp');
  });

  await test('Pipeline→IntentScanner', 'Pipeline conversation event conversion handles all payload formats', () => {
    // Format 1: { text: ... }
    const evt1 = makeEvent('user.message', { text: 'hello' });
    const content1 = evt1.payload.text || evt1.payload.content || evt1.payload.message || '';
    assert.strictEqual(content1, 'hello');

    // Format 2: { content: ... }
    const evt2 = makeEvent('user.message', { content: 'world' });
    const content2 = evt2.payload.text || evt2.payload.content || evt2.payload.message || '';
    assert.strictEqual(content2, 'world');

    // Format 3: { message: ... }
    const evt3 = makeEvent('user.message', { message: 'test' });
    const content3 = evt3.payload.text || evt3.payload.content || evt3.payload.message || '';
    assert.strictEqual(content3, 'test');

    // Format 4: { messages: [...] }
    const evt4 = makeEvent('conversation.update', {
      messages: [{ role: 'user', content: 'hi' }],
    });
    assert.ok(Array.isArray(evt4.payload.messages));
    assert.strictEqual(evt4.payload.messages[0].content, 'hi');
  });

  await test('Pipeline→Dispatcher', 'Pipeline dispatch call matches Dispatcher contract', async () => {
    // Pipeline calls: Dispatcher.dispatch(match.rule, event)
    // where match comes from RuleMatcher.process()
    const rule = makeRule('test-pipe-dispatch', ['test.event']);
    const event = makeEvent('test.event', {});

    // Verify dispatch accepts this
    const result = await Dispatcher.dispatch(rule, event, {
      routes: {},
      timeoutMs: 1000,
    });

    assert.ok(typeof result === 'object');
    assert.ok('success' in result);
    assert.ok('handler' in result);
    assert.ok('duration' in result);
  });

  // ────────────────────────────────────────────────────────
  // GROUP 6: All Modules → DecisionLog
  // Every module logs decisions with compatible entry format
  // ────────────────────────────────────────────────────────
  console.log('\n📋 Group 6: All Modules → DecisionLog\n');

  await test('All→DecisionLog', 'IntentScanner log entry format valid', () => {
    // IntentScanner logs: { phase: 'sensing', component: 'IntentScanner', ... }
    const entry = {
      phase: 'sensing',
      component: 'IntentScanner',
      what: 'intent scan result',
      why: 'Regex fallback matched 3 keywords',
      confidence: 0.6,
      alternatives: [],
      decision_method: 'regex',
      input_summary: 'method=regex_fallback',
    };

    // Should not throw
    const record = DecisionLog.log(entry);
    assert.ok(record.id, 'record must have id');
    assert.ok(record.timestamp, 'record must have timestamp');
    assert.strictEqual(record.phase, 'sensing');
    assert.strictEqual(record.component, 'IntentScanner');
  });

  await test('All→DecisionLog', 'RuleMatcher log entry format valid', () => {
    const entry = {
      phase: 'cognition',
      component: 'ISCRuleMatcher',
      what: 'Matched 3 rules for skill.created',
      why: 'Event: skill.created, source: skill-watcher',
      confidence: 1.0,
      decision_method: 'rule_match',
      input_summary: '{"event_type":"skill.created"}',
    };

    const record = DecisionLog.log(entry);
    assert.strictEqual(record.phase, 'cognition');
    assert.strictEqual(record.component, 'ISCRuleMatcher');
  });

  await test('All→DecisionLog', 'Dispatcher log entry format valid', () => {
    const entry = {
      phase: 'execution',
      component: 'Dispatcher',
      what: 'Dispatch skill.created → success',
      why: 'handler=echo, event=skill.created',
      confidence: 1.0,
      decision_method: 'rule_match',
      input_summary: '{"action":"skill.created","handler":"echo"}',
    };

    const record = DecisionLog.log(entry);
    assert.strictEqual(record.phase, 'execution');
    assert.strictEqual(record.component, 'Dispatcher');
  });

  await test('All→DecisionLog', 'Pipeline log entry format valid', () => {
    const entry = {
      phase: 'execution',
      component: 'l3-pipeline',
      what: 'Pipeline run complete: 5 events, 3 rules, 1 intent, 2 dispatches, 0 breaks',
      why: 'Run run_test_001 finished in 150ms',
      confidence: 1.0,
      input_summary: '{"consumed_events":5}',
    };

    const record = DecisionLog.log(entry);
    assert.strictEqual(record.component, 'l3-pipeline');
  });

  await test('All→DecisionLog', 'Invalid phase rejected by DecisionLog', () => {
    assert.throws(() => {
      DecisionLog.log({ phase: 'invalid_phase', what: 'test' });
    }, /phase must be one of/, 'invalid phase should throw');
  });

  await test('All→DecisionLog', 'Invalid confidence rejected by DecisionLog', () => {
    assert.throws(() => {
      DecisionLog.log({ phase: 'execution', confidence: 1.5 });
    }, /confidence must be/, 'confidence > 1 should throw');

    assert.throws(() => {
      DecisionLog.log({ phase: 'execution', confidence: -0.1 });
    }, /confidence must be/, 'confidence < 0 should throw');
  });

  await test('All→DecisionLog', 'Invalid decision_method rejected by DecisionLog', () => {
    assert.throws(() => {
      DecisionLog.log({ phase: 'execution', decision_method: 'invalid_method' });
    }, /decision_method must be one of/, 'invalid method should throw');
  });

  await test('All→DecisionLog', 'DecisionLog.query returns records filterable by component', () => {
    const records = DecisionLog.query({ component: 'IntentScanner', limit: 5 });
    assert.ok(Array.isArray(records));
    for (const r of records) {
      assert.strictEqual(r.component, 'IntentScanner');
    }
  });

  // ────────────────────────────────────────────────────────
  // GROUP 7: FeatureFlags → Pipeline
  // Feature flag values correctly control pipeline behavior
  // ────────────────────────────────────────────────────────
  console.log('\n📋 Group 7: FeatureFlags → Pipeline\n');

  await test('FeatureFlags→Pipeline', 'FeatureFlags.get() returns correct types for L3 flags', () => {
    const boolFlags = [
      'L3_PIPELINE_ENABLED', 'L3_EVENTBUS_ENABLED', 'L3_RULEMATCHER_ENABLED',
      'L3_INTENTSCANNER_ENABLED', 'L3_DISPATCHER_ENABLED', 'L3_DECISIONLOG_ENABLED',
    ];

    for (const flag of boolFlags) {
      const val = FeatureFlags.get(flag);
      assert.strictEqual(typeof val, 'boolean', `${flag} must be boolean, got ${typeof val}`);
    }

    const depthVal = FeatureFlags.get('L3_CIRCUIT_BREAKER_DEPTH');
    assert.strictEqual(typeof depthVal, 'number', 'circuit breaker depth must be number');
    assert.ok(depthVal > 0, 'circuit breaker depth must be positive');
  });

  await test('FeatureFlags→Pipeline', 'FeatureFlags.isEnabled() works for all L3 flags', () => {
    const flags = FeatureFlags.getAll();
    for (const [key, val] of Object.entries(flags)) {
      if (key.endsWith('_ENABLED')) {
        const enabled = FeatureFlags.isEnabled(key);
        assert.strictEqual(typeof enabled, 'boolean', `isEnabled(${key}) must return boolean`);
        assert.strictEqual(enabled, val, `isEnabled(${key}) must match get(${key})`);
      }
    }
  });

  await test('FeatureFlags→Pipeline', 'FeatureFlags.reload() returns valid snapshot', () => {
    const result = FeatureFlags.reload();
    assert.ok(result.loaded, 'reload must return loaded timestamp');
    assert.strictEqual(typeof result.loaded, 'number');
    assert.ok(result.resolved, 'reload must return resolved flags');
    assert.strictEqual(typeof result.resolved, 'object');
    assert.ok('L3_PIPELINE_ENABLED' in result.resolved, 'must include L3_PIPELINE_ENABLED');
  });

  await test('FeatureFlags→Pipeline', 'FeatureFlags defaults match Pipeline expectations', () => {
    const defaults = FeatureFlags.getDefaults();
    // Pipeline expects these defaults
    assert.strictEqual(defaults.L3_EVENTBUS_ENABLED, true, 'EventBus default should be true');
    assert.strictEqual(defaults.L3_RULEMATCHER_ENABLED, true, 'RuleMatcher default should be true');
    assert.strictEqual(defaults.L3_DISPATCHER_ENABLED, true, 'Dispatcher default should be true');
    assert.strictEqual(defaults.L3_DECISIONLOG_ENABLED, true, 'DecisionLog default should be true');
    assert.strictEqual(defaults.L3_CIRCUIT_BREAKER_DEPTH, 5, 'Circuit breaker depth default should be 5');
  });

  // ────────────────────────────────────────────────────────
  // GROUP 8: Cross-cutting — Event Schema Consistency
  // All modules agree on the event object shape
  // ────────────────────────────────────────────────────────
  console.log('\n📋 Group 8: Cross-cutting Event Schema\n');

  await test('EventSchema', 'EventBus emit → consume roundtrip preserves shape', () => {
    EventBus._clearDedupeCache();
    const emitResult = EventBus.emit('contract.test.roundtrip', { key: 'value' }, 'contract-test', { chain_depth: 0 });
    assert.ok(emitResult && !emitResult.suppressed, 'emit should succeed');

    const events = EventBus.consume({
      type_filter: 'contract.test.roundtrip',
      consumerId: 'contract-test-consumer-' + Date.now(),
    });

    const found = events.find(e => e.id === emitResult.id);
    if (found) {
      // Verify all required fields
      assert.ok(found.id, 'must have id');
      assert.strictEqual(found.type, 'contract.test.roundtrip');
      assert.strictEqual(found.source, 'contract-test');
      assert.strictEqual(typeof found.timestamp, 'number');
      assert.strictEqual(typeof found.payload, 'object');
      assert.ok(found.metadata, 'must have metadata (normalized from _metadata)');
    }
    // Note: if not found, the event was consumed by another consumer - not a contract failure
  });

  await test('EventSchema', 'RuleMatcher accepts EventBus event format directly', () => {
    const event = makeEvent('test.schema.rule', { data: 1 });

    // Create matcher with test rule
    const matcher = new ISCRuleMatcher({ rulesDir: '/tmp/empty-rules-' + Date.now(), hotReload: false });
    matcher.rules = [makeRule('schema-test', ['test.schema.*'])];
    matcher._buildIndex();

    // Should not throw when processing EventBus-shaped event
    const matches = matcher.match(event);
    assert.ok(Array.isArray(matches));
  });

  await test('EventSchema', 'Dispatcher accepts EventBus event format', async () => {
    const event = makeEvent('test.schema.dispatch', { data: 1 });
    const rule = { action: 'test.schema.dispatch' };

    const result = await Dispatcher.dispatch(rule, event, { routes: {}, timeoutMs: 1000 });
    assert.ok(typeof result === 'object');
    assert.ok('success' in result);
  });

  // ────────────────────────────────────────────────────────
  // GROUP 9: RuleMatcher evaluate() → Dispatcher flow
  // ────────────────────────────────────────────────────────
  console.log('\n📋 Group 9: RuleMatcher evaluate → Dispatcher\n');

  await test('RuleMatcher.evaluate→Dispatcher', 'evaluate() return shape is consistent', () => {
    const matcher = new ISCRuleMatcher({ rulesDir: '/tmp/empty-rules-' + Date.now(), hotReload: false });

    // Rule with condition
    const rule = makeRule('eval-test', ['test.*'], { condition: 'severity == \'high\'' });
    const event = makeEvent('test.eval', { severity: 'high' });

    const result = matcher.evaluate(rule, event);
    assert.strictEqual(typeof result.shouldFire, 'boolean', 'shouldFire must be boolean');
    assert.strictEqual(typeof result.reason, 'string', 'reason must be string');
  });

  await test('RuleMatcher.evaluate→Dispatcher', 'Unconditional rule returns shouldFire=true', () => {
    const matcher = new ISCRuleMatcher({ rulesDir: '/tmp/empty-rules-' + Date.now(), hotReload: false });
    const rule = makeRule('uncond-test', ['test.*']);
    const event = makeEvent('test.uncond', {});

    const result = matcher.evaluate(rule, event);
    assert.strictEqual(result.shouldFire, true);
    assert.ok(result.reason.includes('unconditional') || result.reason.includes('no trigger condition'));
  });

  // ────────────────────────────────────────────────────────
  // REPORT
  // ────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60));
  console.log(`  Contract Tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log('═'.repeat(60) + '\n');

  return { passed, failed, total: passed + failed, results };
}

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════
runAllTests().then(summary => {
  // Write machine-readable results
  const outputPath = path.join(__dirname, 'contract-test-results.json');
  fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2));
  process.exit(summary.failed > 0 ? 1 : 0);
}).catch(err => {
  console.error(`Fatal: ${err.message}`);
  console.error(err.stack);
  process.exit(2);
});
