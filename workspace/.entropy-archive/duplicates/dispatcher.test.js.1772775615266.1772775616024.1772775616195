'use strict';

/**
 * Dispatcher v2.0 — Test Suite
 * 
 * Run: node dispatcher.test.js
 * 
 * Tests:
 *   1. classifyPattern — four pattern types
 *   2. matchPattern — matching logic
 *   3. findRoute — four-level priority routing + cache
 *   4. withTimeout — sync/async/timeout
 *   5. dispatch — full dispatch flow (success, retry, manual queue, feature flag)
 *   6. loadHandlers — convention-based loading
 *   7. Integration — end-to-end
 */

const fs = require('fs');
const path = require('path');

// Test infrastructure
let _passed = 0;
let _failed = 0;
let _total = 0;

function assert(condition, msg) {
  _total++;
  if (condition) {
    _passed++;
  } else {
    _failed++;
    console.error(`  ✗ FAIL: ${msg}`);
  }
}

function assertEqual(actual, expected, msg) {
  _total++;
  if (actual === expected) {
    _passed++;
  } else {
    _failed++;
    console.error(`  ✗ FAIL: ${msg} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function section(name) {
  console.log(`\n── ${name} ──`);
}

// ─── Setup ───────────────────────────────────────────────────────

const TEST_DIR = path.join(__dirname, '.test-tmp-' + Date.now());
fs.mkdirSync(TEST_DIR, { recursive: true });
const TEST_HANDLERS_DIR = path.join(TEST_DIR, 'handlers');
fs.mkdirSync(TEST_HANDLERS_DIR, { recursive: true });

const dispatcher = require('./dispatcher.js');

// ─── Main Test Runner ────────────────────────────────────────────

async function runTests() {

  // ─── Test: classifyPattern ───────────────────────────────────

  section('classifyPattern');
  {
    const cp = dispatcher.classifyPattern;

    assertEqual(cp('system.error').level, 1, 'exact pattern level');
    assertEqual(cp('system.error').type, 'exact', 'exact pattern type');

    assertEqual(cp('isc.rule.*').level, 2, 'prefix pattern level');
    assertEqual(cp('isc.rule.*').type, 'prefix', 'prefix pattern type');
    assertEqual(cp('isc.rule.*').prefix, 'isc.rule', 'prefix pattern value');

    assertEqual(cp('*.completed').level, 3, 'suffix pattern level');
    assertEqual(cp('*.completed').type, 'suffix', 'suffix pattern type');
    assertEqual(cp('*.completed').suffix, 'completed', 'suffix pattern value');

    assertEqual(cp('*').level, 4, 'wildcard pattern level');
    assertEqual(cp('*').type, 'wildcard', 'wildcard pattern type');
  }

  // ─── Test: matchPattern ──────────────────────────────────────

  section('matchPattern');
  {
    const mp = dispatcher.matchPattern;

    // Exact
    assert(mp('system.error', 'system.error'), 'exact match');
    assert(!mp('system.error.critical', 'system.error'), 'exact no partial');

    // Prefix
    assert(mp('isc.rule.created', 'isc.rule.*'), 'prefix match child');
    assert(mp('isc.rule', 'isc.rule.*'), 'prefix match exact root');
    assert(mp('isc.rule.sub.deep', 'isc.rule.*'), 'prefix match deep');
    assert(!mp('isc.ruleX', 'isc.rule.*'), 'prefix no false match');

    // Suffix
    assert(mp('aeo.assessment.completed', '*.completed'), 'suffix match');
    assert(mp('completed', '*.completed'), 'suffix match exact');
    assert(!mp('completedX', '*.completed'), 'suffix no false match');

    // Wildcard
    assert(mp('anything', '*'), 'wildcard matches anything');
    assert(mp('', '*'), 'wildcard matches empty');
  }

  // ─── Test: findRoute — Four-Level Priority ───────────────────

  section('findRoute — four-level priority');
  {
    dispatcher.clearRouteCache();

    const routes = {
      'system.error': { handler: 'exact-handler', priority: 'high' },
      'system.*': { handler: 'prefix-handler', priority: 'normal' },
      '*.error': { handler: 'suffix-handler', priority: 'normal' },
      '*': { handler: 'catch-all', priority: 'low' },
    };

    // Level 1: exact wins over all
    const r1 = dispatcher.findRoute('system.error', routes);
    assertEqual(r1.config.handler, 'exact-handler', 'exact wins over prefix/suffix/wildcard');

    // Level 2: prefix wins over suffix and wildcard
    const r2 = dispatcher.findRoute('system.health', routes);
    assertEqual(r2.config.handler, 'prefix-handler', 'prefix wins over suffix/wildcard');

    // Level 3: suffix wins over wildcard
    const r3 = dispatcher.findRoute('app.error', routes);
    assertEqual(r3.config.handler, 'suffix-handler', 'suffix wins over wildcard');

    // Level 4: wildcard catches unmatched
    const r4 = dispatcher.findRoute('totally.random.event', routes);
    assertEqual(r4.config.handler, 'catch-all', 'wildcard catches rest');

    // Cache test
    const r1cached = dispatcher.findRoute('system.error', routes);
    assertEqual(r1cached.config.handler, 'exact-handler', 'cached result consistent');

    // Prefix specificity: longer prefix wins
    dispatcher.clearRouteCache();
    const routes2 = {
      'isc.*': { handler: 'broad' },
      'isc.rule.*': { handler: 'specific' },
    };
    const r5 = dispatcher.findRoute('isc.rule.created', routes2);
    assertEqual(r5.config.handler, 'specific', 'longer prefix wins');

    // No route
    dispatcher.clearRouteCache();
    const r6 = dispatcher.findRoute('xyz.unknown', { 'abc.*': { handler: 'nope' } });
    assertEqual(r6, null, 'no match returns null');
  }

  // ─── Test: withTimeout ─────────────────────────────────────────

  section('withTimeout');
  {
    const wt = dispatcher.withTimeout;

    // Sync handler
    const r1 = await wt((a, b) => a + b, [2, 3], 1000);
    assertEqual(r1, 5, 'sync handler works');

    // Async handler
    const r2 = await wt(async (x) => x * 2, [10], 1000);
    assertEqual(r2, 20, 'async handler works');

    // Timeout
    let timedOut = false;
    try {
      await wt(() => new Promise(resolve => setTimeout(resolve, 200)), [], 50);
    } catch (err) {
      timedOut = err.message.includes('timed out');
    }
    assert(timedOut, 'timeout triggers error');

    // Sync throw
    let syncThrew = false;
    try {
      await wt(() => { throw new Error('boom'); }, [], 1000);
    } catch (err) {
      syncThrew = err.message === 'boom';
    }
    assert(syncThrew, 'sync throw propagates');

    // Async reject
    let asyncRejected = false;
    try {
      await wt(async () => { throw new Error('async-boom'); }, [], 1000);
    } catch (err) {
      asyncRejected = err.message === 'async-boom';
    }
    assert(asyncRejected, 'async reject propagates');
  }

  // ─── Test: dispatch — Full Flow ────────────────────────────────

  section('dispatch — success, retry, manual queue, feature flag');
  {
    // Create test handler files
    const successHandler = path.join(TEST_HANDLERS_DIR, 'test-success.js');
    fs.writeFileSync(successHandler, `
      module.exports = function(event, ctx) {
        return { ok: true, id: event.id };
      };
    `);

    const failOnceHandler = path.join(TEST_HANDLERS_DIR, 'test-fail-once.js');
    fs.writeFileSync(failOnceHandler, `
      let callCount = 0;
      module.exports = function(event, ctx) {
        callCount++;
        if (callCount <= 1) throw new Error('transient error');
        return { recovered: true, attempt: callCount };
      };
    `);

    const alwaysFailHandler = path.join(TEST_HANDLERS_DIR, 'test-always-fail.js');
    fs.writeFileSync(alwaysFailHandler, `
      module.exports = function(event, ctx) {
        throw new Error('permanent failure');
      };
    `);

    // Build handler map
    const handlerMap = new Map();
    handlerMap.set('test-success', {
      handler: require(successHandler),
      config: { handler: 'test-success' },
      source: 'test',
    });
    handlerMap.set('test-fail-once', {
      handler: require(failOnceHandler),
      config: { handler: 'test-fail-once' },
      source: 'test',
    });
    handlerMap.set('test-always-fail', {
      handler: require(alwaysFailHandler),
      config: { handler: 'test-always-fail' },
      source: 'test',
    });

    const routes = {
      'test.success': { handler: 'test-success' },
      'test.fail-once': { handler: 'test-fail-once' },
      'test.always-fail': { handler: 'test-always-fail' },
    };

    // 1. Success path
    const r1 = await dispatcher.dispatch(
      { action: 'test.success' },
      { id: 'evt-001', type: 'test.success' },
      { routes, handlerMap, timeoutMs: 5000 }
    );
    assert(r1.success, 'dispatch success');
    assertEqual(r1.handler, 'test-success', 'correct handler used');
    assert(!r1.retried, 'no retry on success');
    assert(r1.duration >= 0, 'duration tracked');

    // 2. Retry + recover
    const r2 = await dispatcher.dispatch(
      { action: 'test.fail-once' },
      { id: 'evt-002', type: 'test.fail-once' },
      { routes, handlerMap, timeoutMs: 5000 }
    );
    assert(r2.success, 'dispatch recovers on retry');
    assert(r2.retried, 'retried flag set');

    // 3. Permanent failure → manual queue
    try { fs.unlinkSync(dispatcher.MANUAL_QUEUE_FILE); } catch (_) {}

    const r3 = await dispatcher.dispatch(
      { action: 'test.always-fail' },
      { id: 'evt-003', type: 'test.always-fail' },
      { routes, handlerMap, timeoutMs: 5000 }
    );
    assert(!r3.success, 'permanent failure returns false');
    assert(r3.retried, 'retried before giving up');
    assertEqual(r3.error, 'permanent failure', 'error message preserved');

    // Check manual queue
    if (fs.existsSync(dispatcher.MANUAL_QUEUE_FILE)) {
      const queueContent = fs.readFileSync(dispatcher.MANUAL_QUEUE_FILE, 'utf8').trim();
      assert(queueContent.includes('evt-003'), 'manual queue contains failed event');
      assert(queueContent.includes('permanent failure'), 'manual queue has error detail');
    } else {
      assert(false, 'manual queue file should exist');
    }

    // 4. Feature flag disabled
    const origFlag = process.env.DISPATCHER_ENABLED;
    process.env.DISPATCHER_ENABLED = 'false';

    const r4 = await dispatcher.dispatch(
      { action: 'test.success' },
      { id: 'evt-004', type: 'test.success' },
      { routes, handlerMap }
    );
    assert(r4.success, 'disabled dispatch still returns success');
    assert(r4.skipped, 'skipped flag set when disabled');
    assertEqual(r4.handler, 'none', 'no handler when disabled');

    // Restore flag
    if (origFlag === undefined) {
      delete process.env.DISPATCHER_ENABLED;
    } else {
      process.env.DISPATCHER_ENABLED = origFlag;
    }

    // 5. No route at all → manual queue
    const r5 = await dispatcher.dispatch(
      { action: 'unknown.event' },
      { id: 'evt-005', type: 'unknown.event' },
      { routes: {}, handlerMap: new Map() }
    );
    assert(!r5.success, 'no route dispatches to manual queue');

    // 6. Route exists but no handler file → file-based dispatch
    const r6 = await dispatcher.dispatch(
      { action: 'test.success' },
      { id: 'evt-006', type: 'test.success' },
      { routes, handlerMap: new Map() }  // empty handler map, no handler files for test-success
    );
    assert(r6.success, 'file-based dispatch succeeds');
    assertEqual(r6.result, 'file_dispatched', 'result is file_dispatched');
  }

  // ─── Test: loadHandlers ──────────────────────────────────────

  section('loadHandlers — convention-based');
  {
    const handlers = dispatcher.loadHandlers();
    assert(handlers.size > 0, 'handlers loaded');

    const echoEntry = handlers.get('echo');
    if (echoEntry) {
      assertEqual(echoEntry.source, 'convention', 'echo loaded via convention');
      assert(typeof echoEntry.handler === 'function', 'echo handler is a function');
    }
  }

  // ─── Test: Route Cache ─────────────────────────────────────────

  section('Route Cache');
  {
    dispatcher.clearRouteCache();
    assertEqual(dispatcher._routeCache.size, 0, 'cache cleared');

    const routes = { 'a.b': { handler: 'x' }, 'a.*': { handler: 'y' } };

    dispatcher.findRoute('a.b', routes);
    assertEqual(dispatcher._routeCache.size, 1, 'cache populated after first lookup');

    dispatcher.findRoute('a.c', routes);
    assertEqual(dispatcher._routeCache.size, 2, 'cache grows');

    dispatcher.findRoute('a.b', routes);
    assertEqual(dispatcher._routeCache.size, 2, 'cache not duplicated');

    dispatcher.clearRouteCache();
    assertEqual(dispatcher._routeCache.size, 0, 'cache cleared again');
  }

  // ─── Test: Integration with echo handler ───────────────────────

  section('Integration — echo handler end-to-end');
  {
    const handlerMap = dispatcher.loadHandlers();
    const routes = { 'echo': { handler: 'echo' } };

    const result = await dispatcher.dispatch(
      { action: 'echo' },
      { id: 'evt-echo-1', type: 'echo', data: { msg: 'hello' } },
      { routes, handlerMap, timeoutMs: 5000 }
    );

    assert(result.success, 'echo dispatch succeeded');
    assertEqual(result.handler, 'echo', 'used echo handler');
    assert(result.result && result.result.echoed, 'echo handler returned correct result');
  }

  // ─── Cleanup & Report ──────────────────────────────────────────

  try { fs.rmSync(TEST_DIR, { recursive: true, force: true }); } catch (_) {}

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`Results: ${_passed}/${_total} passed, ${_failed} failed`);
  console.log(`${'═'.repeat(50)}`);

  if (_failed > 0) {
    process.exit(1);
  } else {
    console.log('✅ All tests passed!');
  }
}

runTests().catch(err => {
  console.error(`Test runner error: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});
