'use strict';

/**
 * E2E Integration Tests: bus → dispatcher → condition → action
 * Tests the full event pipeline from emission to action logging.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

// ─── Module paths ────────────────────────────────────────────────
const INFRA = path.resolve(__dirname, '../../infrastructure');
const busPath = path.join(INFRA, 'event-bus/bus.js');
const facadePath = path.join(INFRA, 'event-bus/bus-facade.js');
const dispatcherPath = path.join(INFRA, 'event-bus/dispatcher.js');
const conditionPath = path.join(INFRA, 'condition-evaluator/index.js');
const sanitizePath = path.join(INFRA, 'event-bus/sanitize-payload.js');
const gitScannerPath = path.join(INFRA, 'scanners/git-scanner.js');
const baseScannerPath = path.join(INFRA, 'scanners/base-scanner.js');

// ─── Helpers ─────────────────────────────────────────────────────

function freshRequire(modPath) {
  delete require.cache[require.resolve(modPath)];
  return require(modPath);
}

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-pipeline-'));
}

function createRuleFile(dir, rule) {
  fs.mkdirSync(dir, { recursive: true });
  const filename = `${rule.id}.json`;
  fs.writeFileSync(path.join(dir, filename), JSON.stringify(rule, null, 2));
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf-8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
}

// ─── Test Suite ──────────────────────────────────────────────────

describe('E2E Event Pipeline Integration', () => {
  let tmpDir, rulesDir, logFile, bus;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    rulesDir = path.join(tmpDir, 'rules');
    logFile = path.join(tmpDir, 'dispatcher-actions.jsonl');
    fs.mkdirSync(rulesDir, { recursive: true });

    // Fresh bus instance for isolation
    bus = freshRequire(busPath);
    bus.purge();
  });

  afterEach(() => {
    bus.purge();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ─── 1. Basic event → dispatcher match ───────────────────────

  test('1. emit skill.lifecycle.created → dispatcher matches rule', async () => {
    createRuleFile(rulesDir, {
      id: 'test-skill-created',
      trigger: { events: ['skill.lifecycle.created'] },
    });

    const { Dispatcher } = freshRequire(dispatcherPath);
    const d = new Dispatcher({ rulesDir, logFile });
    await d.init();

    assert.ok(d.getRuleCount() >= 1, 'Should load at least 1 rule');
    const matched = d._matchRules('skill.lifecycle.created');
    assert.ok(matched.length >= 1, 'Should match skill.lifecycle.created');
    assert.equal(matched[0].id, 'test-skill-created');
  });

  test('2. dispatch writes action log to JSONL', async () => {
    createRuleFile(rulesDir, {
      id: 'log-test',
      trigger: {
        events: ['test.action.log'],
        actions: [{ type: 'notify', target: 'test' }],
      },
    });

    const { Dispatcher } = freshRequire(dispatcherPath);
    const d = new Dispatcher({ rulesDir, logFile });
    await d.init();

    await d.dispatch('test.action.log', { foo: 'bar' });

    const logs = readJsonl(logFile);
    assert.ok(logs.length >= 1, 'Should have at least 1 log entry');
    assert.equal(logs[0].eventType, 'test.action.log');
    assert.equal(logs[0].ruleId, 'log-test');
    assert.deepEqual(logs[0].payload, { foo: 'bar' });
  });

  // ─── 2. Condition evaluation ──────────────────────────────────

  test('3. rule with matching conditions → executed', async () => {
    createRuleFile(rulesDir, {
      id: 'cond-match',
      trigger: { events: ['cond.test'], actions: [{ type: 'run' }] },
      conditions: { status: 'active' },
    });

    const { Dispatcher } = freshRequire(dispatcherPath);
    const d = new Dispatcher({ rulesDir, logFile });
    await d.init();
    await d.dispatch('cond.test', { status: 'active' });

    const logs = readJsonl(logFile);
    assert.ok(logs.length >= 1, 'Should execute when condition matches');
  });

  test('4. rule with non-matching conditions → skipped', async () => {
    createRuleFile(rulesDir, {
      id: 'cond-skip',
      trigger: { events: ['cond.test2'], actions: [{ type: 'run' }] },
      conditions: { status: 'active' },
    });

    const { Dispatcher } = freshRequire(dispatcherPath);
    const d = new Dispatcher({ rulesDir, logFile });
    await d.init();
    await d.dispatch('cond.test2', { status: 'inactive' });

    const logs = readJsonl(logFile);
    assert.equal(logs.length, 0, 'Should not write action log when condition fails');
    assert.equal(d.getStats().skipped, 1);
  });

  // ─── 3. ConditionEvaluator standalone ─────────────────────────

  test('5. ConditionEvaluator: $and logic', () => {
    const { ConditionEvaluator } = freshRequire(conditionPath);
    const ce = new ConditionEvaluator();

    const r = ce.evaluate({ $and: [{ a: 1 }, { b: 2 }] }, { a: 1, b: 2 });
    assert.equal(r.match, true);

    const r2 = ce.evaluate({ $and: [{ a: 1 }, { b: 3 }] }, { a: 1, b: 2 });
    assert.equal(r2.match, false);
  });

  test('6. ConditionEvaluator: $or logic', () => {
    const { ConditionEvaluator } = freshRequire(conditionPath);
    const ce = new ConditionEvaluator();

    const r = ce.evaluate({ $or: [{ a: 1 }, { a: 2 }] }, { a: 2 });
    assert.equal(r.match, true);

    const r2 = ce.evaluate({ $or: [{ a: 1 }, { a: 2 }] }, { a: 3 });
    assert.equal(r2.match, false);
  });

  test('7. ConditionEvaluator: nested field access', () => {
    const { ConditionEvaluator } = freshRequire(conditionPath);
    const ce = new ConditionEvaluator();

    const r = ce.evaluate({ 'meta.type': 'skill' }, { meta: { type: 'skill' } });
    assert.equal(r.match, true);
  });

  test('8. ConditionEvaluator: operators $gt, $in, $exists', () => {
    const { ConditionEvaluator } = freshRequire(conditionPath);
    const ce = new ConditionEvaluator();

    assert.equal(ce.evaluate({ score: { $gt: 5 } }, { score: 10 }).match, true);
    assert.equal(ce.evaluate({ score: { $gt: 5 } }, { score: 3 }).match, false);
    assert.equal(ce.evaluate({ tag: { $in: ['a', 'b'] } }, { tag: 'a' }).match, true);
    assert.equal(ce.evaluate({ tag: { $in: ['a', 'b'] } }, { tag: 'c' }).match, false);
    assert.equal(ce.evaluate({ name: { $exists: true } }, { name: 'x' }).match, true);
    assert.equal(ce.evaluate({ name: { $exists: true } }, {}).match, false);
  });

  test('9. ConditionEvaluator: empty/null conditions → match', () => {
    const { ConditionEvaluator } = freshRequire(conditionPath);
    const ce = new ConditionEvaluator();

    assert.equal(ce.evaluate({}, { any: 'thing' }).match, true);
    assert.equal(ce.evaluate(null, { any: 'thing' }).match, true);
    assert.equal(ce.evaluate(undefined, { any: 'thing' }).match, true);
  });

  test('10. ConditionEvaluator: null payload → no match', () => {
    const { ConditionEvaluator } = freshRequire(conditionPath);
    const ce = new ConditionEvaluator();

    assert.equal(ce.evaluate({ a: 1 }, null).match, false);
  });

  // ─── 4. BusFacade integration ────────────────────────────────

  test('11. BusFacade emit → event logged + dispatcher fires', async () => {
    createRuleFile(rulesDir, {
      id: 'facade-test',
      trigger: { events: ['facade.event'], actions: [{ type: 'log' }] },
    });

    const { BusFacade } = freshRequire(facadePath);
    const { Dispatcher } = freshRequire(dispatcherPath);
    const dispatcher = new Dispatcher({ rulesDir, logFile });

    const facade = new BusFacade({ bus, dispatcher });
    await facade.init();

    const evt = facade.emit('facade.event', { x: 1 }, 'test');
    assert.ok(evt.id, 'Event should have an ID');
    assert.equal(evt.type, 'facade.event');

    // Wait for async dispatch
    await new Promise(r => setTimeout(r, 50));

    const logs = readJsonl(logFile);
    assert.ok(logs.length >= 1, 'Dispatcher should log action from facade emit');
  });

  test('12. BusFacade: event persisted in bus history', async () => {
    const { BusFacade } = freshRequire(facadePath);
    const { Dispatcher } = freshRequire(dispatcherPath);

    const facade = new BusFacade({ bus, dispatcher: new Dispatcher({ rulesDir, logFile }) });
    await facade.init();

    facade.emit('history.test', { data: 1 }, 'test');

    const history = facade.history({ type: 'history.test' });
    assert.ok(history.length >= 1);
    assert.equal(history[0].type, 'history.test');
  });

  // ─── 5. sanitizePayload ──────────────────────────────────────

  test('13. sanitizePayload removes sensitive fields', () => {
    const { sanitizePayload } = freshRequire(sanitizePath);

    const { cleaned, report } = sanitizePayload({
      name: 'test',
      api_key: 'secret123',
      token: 'tok_abc',
      password: 'hunter2',
      data: { nested_secret: 'nope', value: 42 },
    });

    assert.equal(cleaned.name, 'test');
    assert.equal(cleaned.api_key, undefined, 'api_key should be removed');
    assert.equal(cleaned.token, undefined, 'token should be removed');
    assert.equal(cleaned.password, undefined, 'password should be removed');
    assert.equal(cleaned.data.value, 42);
    assert.equal(cleaned.data.nested_secret, undefined, 'nested_secret should be removed');
    assert.ok(report.removedFields.length >= 3);
  });

  test('14. sanitizePayload handles null/undefined', () => {
    const { sanitizePayload } = freshRequire(sanitizePath);

    const r1 = sanitizePayload(null);
    assert.equal(r1.cleaned, null);

    const r2 = sanitizePayload(undefined);
    assert.equal(r2.cleaned, undefined);
  });

  test('15. sanitizePayload depth limit', () => {
    const { sanitizePayload } = freshRequire(sanitizePath);

    // Create deeply nested object (>5 levels)
    let obj = { value: 'deep' };
    for (let i = 0; i < 7; i++) obj = { nested: obj };

    const { cleaned, report } = sanitizePayload(obj);
    assert.ok(report.truncated || JSON.stringify(cleaned).includes('depth limit'),
      'Should truncate or mark depth-limited');
  });

  // ─── 6. Chain depth protection ───────────────────────────────

  test('16. dispatcher respects maxDepth (chain depth protection)', async () => {
    createRuleFile(rulesDir, {
      id: 'chain-rule',
      trigger: { events: ['chain.event'], actions: [{ type: 'cascade' }] },
    });

    const { Dispatcher } = freshRequire(dispatcherPath);
    const d = new Dispatcher({ rulesDir, logFile, maxDepth: 3 });
    await d.init();

    // Simulate deep chain calls
    await d.dispatch('chain.event', {}, 0);
    await d.dispatch('chain.event', {}, 1);
    await d.dispatch('chain.event', {}, 2);
    await d.dispatch('chain.event', {}, 3); // at maxDepth, should be skipped

    const logs = readJsonl(logFile);
    // Only 3 dispatches should produce logs (depth 0, 1, 2), depth 3 is blocked
    assert.equal(logs.length, 3, 'Should only execute up to maxDepth-1');
  });

  test('17. dispatcher default maxDepth is 5', async () => {
    const { Dispatcher } = freshRequire(dispatcherPath);
    const d = new Dispatcher({ rulesDir, logFile });
    assert.equal(d.maxDepth, 5);
  });

  // ─── 7. Multiple rules match same event ──────────────────────

  test('18. multiple rules matching same event all execute', async () => {
    createRuleFile(rulesDir, {
      id: 'multi-a',
      trigger: { events: ['multi.event'], actions: [{ type: 'a' }] },
    });
    createRuleFile(rulesDir, {
      id: 'multi-b',
      trigger: { events: ['multi.event'], actions: [{ type: 'b' }] },
    });
    createRuleFile(rulesDir, {
      id: 'multi-c',
      trigger: { events: ['multi.event'], actions: [{ type: 'c' }] },
    });

    const { Dispatcher } = freshRequire(dispatcherPath);
    const d = new Dispatcher({ rulesDir, logFile });
    await d.init();

    assert.equal(d.getRuleCount(), 3);
    await d.dispatch('multi.event', {});

    const logs = readJsonl(logFile);
    assert.equal(logs.length, 3, 'All 3 rules should produce action logs');
    const ruleIds = logs.map(l => l.ruleId).sort();
    assert.deepEqual(ruleIds, ['multi-a', 'multi-b', 'multi-c']);
  });

  // ─── 8. Fault isolation ──────────────────────────────────────

  test('19. one rule failure does not block other rules', async () => {
    createRuleFile(rulesDir, {
      id: 'good-rule',
      trigger: { events: ['fault.test'], actions: [{ type: 'ok' }] },
    });
    createRuleFile(rulesDir, {
      id: 'bad-rule',
      trigger: { events: ['fault.test'], actions: [{ type: 'fail' }] },
      // Conditions that will throw if evaluated weirdly — but dispatcher has try/catch
      conditions: { status: 'active' },
    });

    const { Dispatcher } = freshRequire(dispatcherPath);
    const d = new Dispatcher({ rulesDir, logFile });
    await d.init();

    // Monkey-patch _evaluateConditions to throw for bad-rule
    const origEval = d._evaluateConditions.bind(d);
    d._evaluateConditions = function (rule, payload) {
      if (rule.id === 'bad-rule') throw new Error('Simulated condition crash');
      return origEval(rule, payload);
    };

    await d.dispatch('fault.test', { status: 'active' });

    // good-rule should still have produced a log
    const logs = readJsonl(logFile);
    assert.ok(logs.some(l => l.ruleId === 'good-rule'), 'good-rule should execute despite bad-rule failure');
    assert.equal(d.getStats().failed, 1, 'bad-rule failure should be counted');
  });

  // ─── 9. Wildcard matching ────────────────────────────────────

  test('20. wildcard rule * matches any event', async () => {
    createRuleFile(rulesDir, {
      id: 'wildcard-all',
      trigger: { events: ['*'], actions: [{ type: 'catch-all' }] },
    });

    const { Dispatcher } = freshRequire(dispatcherPath);
    const d = new Dispatcher({ rulesDir, logFile });
    await d.init();

    await d.dispatch('any.random.event', { x: 1 });

    const logs = readJsonl(logFile);
    assert.ok(logs.length >= 1);
    assert.equal(logs[0].ruleId, 'wildcard-all');
  });

  test('21. domain wildcard skill.* matches skill.lifecycle.created', async () => {
    createRuleFile(rulesDir, {
      id: 'domain-wild',
      trigger: { events: ['skill.*'], actions: [{ type: 'domain' }] },
    });

    const { Dispatcher } = freshRequire(dispatcherPath);
    const d = new Dispatcher({ rulesDir, logFile });
    await d.init();

    await d.dispatch('skill.lifecycle.created', {});

    const logs = readJsonl(logFile);
    assert.ok(logs.length >= 1);
    assert.equal(logs[0].ruleId, 'domain-wild');
  });

  // ─── 10. GitScanner → bus → dispatcher chain ─────────────────

  test('22. GitScanner emits events to bus', () => {
    const { BaseScanner } = freshRequire(baseScannerPath);

    // Create a mock scanner to test emit integration
    class MockScanner extends BaseScanner {
      async scan() { this._recordScan(); return []; }
    }

    const scanner = new MockScanner('test-scanner', { bus });
    const result = scanner.emit('skill.lifecycle.created', { file: 'skills/test/SKILL.md', status: 'A' });

    assert.equal(result.eventType, 'skill.lifecycle.created');

    const history = bus.history({ type: 'skill.lifecycle.created' });
    assert.ok(history.length >= 1, 'Bus should contain the emitted event');
    assert.equal(history[0].payload.scanner, 'test-scanner');
  });

  test('23. full chain: scanner emit → bus persist → dispatcher match → action log', async () => {
    createRuleFile(rulesDir, {
      id: 'chain-full',
      trigger: { events: ['skill.lifecycle.created'], actions: [{ type: 'process-skill' }] },
    });

    const { Dispatcher } = freshRequire(dispatcherPath);
    const d = new Dispatcher({ rulesDir, logFile });
    await d.init();

    // Simulate scanner emitting to bus
    const { BaseScanner } = freshRequire(baseScannerPath);
    class TestScanner extends BaseScanner {
      async scan() { this._recordScan(); return []; }
    }
    const scanner = new TestScanner('git-scanner', { bus });
    scanner.emit('skill.lifecycle.created', { file: 'skills/new-skill/SKILL.md', status: 'A' });

    // Verify bus has the event
    const events = bus.history({ type: 'skill.lifecycle.created' });
    assert.ok(events.length >= 1);

    // Dispatcher processes
    await d.dispatch('skill.lifecycle.created', events[0].payload);

    const logs = readJsonl(logFile);
    assert.ok(logs.length >= 1);
    assert.equal(logs[0].ruleId, 'chain-full');
    assert.ok(logs[0].payload.scanner === 'git-scanner');
  });

  // ─── 11. Bus consume/ack cycle ───────────────────────────────

  test('24. bus consume → ack cycle works', () => {
    bus.emit('consume.test', { n: 1 }, 'test');
    bus.emit('consume.test', { n: 2 }, 'test');

    const events = bus.consume('test-consumer', { types: ['consume.test'] });
    assert.equal(events.length, 2);

    bus.ack('test-consumer', events[0].id);

    const remaining = bus.consume('test-consumer', { types: ['consume.test'] });
    assert.equal(remaining.length, 1, 'After ack, should have 1 remaining');
    assert.equal(remaining[0].payload.n, 2);
  });

  // ─── 12. Dispatcher stats tracking ───────────────────────────

  test('25. dispatcher stats track dispatched/matched/executed/skipped/failed', async () => {
    createRuleFile(rulesDir, {
      id: 'stats-rule',
      trigger: { events: ['stats.test'], actions: [{ type: 'x' }] },
      conditions: { ok: true },
    });

    const { Dispatcher } = freshRequire(dispatcherPath);
    const d = new Dispatcher({ rulesDir, logFile });
    await d.init();

    await d.dispatch('stats.test', { ok: true });
    await d.dispatch('stats.test', { ok: false });
    await d.dispatch('no.match.event', {});

    const stats = d.getStats();
    assert.equal(stats.dispatched, 3);
    assert.ok(stats.matched >= 2);
    assert.ok(stats.executed >= 1);
    assert.ok(stats.skipped >= 1);
  });

  // ─── 13. Event index ─────────────────────────────────────────

  test('26. getEventIndex returns correct mapping', async () => {
    createRuleFile(rulesDir, {
      id: 'idx-a',
      trigger: { events: ['a.created', 'a.updated'] },
    });
    createRuleFile(rulesDir, {
      id: 'idx-b',
      trigger: { events: ['b.created'] },
    });

    const { Dispatcher } = freshRequire(dispatcherPath);
    const d = new Dispatcher({ rulesDir, logFile });
    await d.init();

    const idx = d.getEventIndex();
    assert.ok(idx['a.created'].includes('idx-a'));
    assert.ok(idx['a.updated'].includes('idx-a'));
    assert.ok(idx['b.created'].includes('idx-b'));
  });

  // ─── 14. Bus matchType utility ───────────────────────────────

  test('27. bus._matchType handles exact, wildcard, domain patterns', () => {
    assert.equal(bus._matchType('a.b', 'a.b'), true);
    assert.equal(bus._matchType('a.b', 'a.c'), false);
    assert.equal(bus._matchType('a.b', '*'), true);
    assert.equal(bus._matchType('a.b.c', 'a.*'), true);
    assert.equal(bus._matchType('b.c', 'a.*'), false);
  });

  // ─── 15. Rules with object-format events ─────────────────────

  test('28. dispatcher handles object-format trigger.events (L1/L2/META)', async () => {
    createRuleFile(rulesDir, {
      id: 'obj-events',
      trigger: {
        events: {
          L1: ['skill.lifecycle.created'],
          L2: ['quality.done'],
        },
        actions: [{ type: 'gate' }],
      },
    });

    const { Dispatcher } = freshRequire(dispatcherPath);
    const d = new Dispatcher({ rulesDir, logFile });
    await d.init();

    const m1 = d._matchRules('skill.lifecycle.created');
    assert.ok(m1.length >= 1, 'Should match L1 event');

    const m2 = d._matchRules('quality.done');
    assert.ok(m2.length >= 1, 'Should match L2 event');

    const m3 = d._matchRules('unrelated.event');
    assert.equal(m3.filter(r => r.id === 'obj-events').length, 0, 'Should not match unrelated');
  });

  // ─── 16. Dispatcher with no rules dir ────────────────────────

  test('29. dispatcher init with missing rules dir does not throw', async () => {
    const { Dispatcher } = freshRequire(dispatcherPath);
    const d = new Dispatcher({ rulesDir: '/tmp/nonexistent-rules-dir-xyz', logFile });
    await d.init(); // should not throw
    assert.equal(d.getRuleCount(), 0);
  });

  // ─── 17. ConditionEvaluator operators ─────────────────────────

  test('30. ConditionEvaluator: $regex operator', () => {
    const { ConditionEvaluator } = freshRequire(conditionPath);
    const ce = new ConditionEvaluator();

    assert.equal(ce.evaluate({ name: { $regex: '^skill' } }, { name: 'skill-test' }).match, true);
    assert.equal(ce.evaluate({ name: { $regex: '^skill' } }, { name: 'not-skill' }).match, false);
  });

  test('31. ConditionEvaluator: $nin operator', () => {
    const { ConditionEvaluator } = freshRequire(conditionPath);
    const ce = new ConditionEvaluator();

    assert.equal(ce.evaluate({ tag: { $nin: ['bad', 'ugly'] } }, { tag: 'good' }).match, true);
    assert.equal(ce.evaluate({ tag: { $nin: ['bad', 'ugly'] } }, { tag: 'bad' }).match, false);
  });

  // ─── 18. BusFacade dispatcher stats ──────────────────────────

  test('32. BusFacade getDispatcherStats returns stats', async () => {
    createRuleFile(rulesDir, {
      id: 'facade-stats',
      trigger: { events: ['fs.test'] },
    });

    const { BusFacade } = freshRequire(facadePath);
    const { Dispatcher } = freshRequire(dispatcherPath);
    const dispatcher = new Dispatcher({ rulesDir, logFile });
    const facade = new BusFacade({ bus, dispatcher });
    await facade.init();

    const stats = facade.getDispatcherStats();
    assert.ok(stats !== null);
    assert.equal(stats.ready, true);
    assert.ok(typeof stats.ruleCount === 'number');
  });

  // ─── 19. Bus purge ───────────────────────────────────────────

  test('33. bus.purge clears all events', () => {
    bus.emit('purge.test', {}, 'test');
    bus.emit('purge.test', {}, 'test');
    assert.ok(bus.history().length >= 2);

    bus.purge();
    assert.equal(bus.history().length, 0);
  });

  // ─── 20. Sanitize + dispatch integration ─────────────────────

  test('34. sanitized payload fed to dispatcher preserves non-sensitive data', async () => {
    createRuleFile(rulesDir, {
      id: 'sanitize-dispatch',
      trigger: { events: ['sanitize.test'], actions: [{ type: 'process' }] },
    });

    const { sanitizePayload } = freshRequire(sanitizePath);
    const { Dispatcher } = freshRequire(dispatcherPath);
    const d = new Dispatcher({ rulesDir, logFile });
    await d.init();

    const raw = { name: 'skill-x', api_key: 'LEAKED', data: 'safe' };
    const { cleaned } = sanitizePayload(raw);

    await d.dispatch('sanitize.test', cleaned);

    const logs = readJsonl(logFile);
    assert.ok(logs.length >= 1);
    assert.equal(logs[0].payload.name, 'skill-x');
    assert.equal(logs[0].payload.api_key, undefined, 'Sensitive field should not appear');
    assert.equal(logs[0].payload.data, 'safe');
  });
});
