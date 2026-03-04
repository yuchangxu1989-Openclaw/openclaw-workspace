'use strict';

/**
 * Resilient Dispatcher Tests — Handler crash isolation & circuit breaker
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const {
  recordSuccess,
  recordFailure,
  isHandlerDisabled,
  enableHandler,
  disableHandler,
  getHandlerHealth,
  getDisabledHandlers,
  HANDLER_CRASH_THRESHOLD,
  _handlerHealth,
} = require('../../resilience/resilient-dispatcher');

let passed = 0;
let failed = 0;

function test(name, fn) {
  return fn().then(() => {
    passed++;
    console.log(`  ✅ ${name}`);
  }).catch(e => {
    failed++;
    console.log(`  ❌ ${name}: ${e.message}`);
  });
}

async function run() {
  console.log('\n🧪 Resilient Dispatcher Tests\n');

  // Clean state before each test group
  _handlerHealth.clear();

  // ═══════════════════════════════════════════════════
  // 1. Handler Success Tracking
  // ═══════════════════════════════════════════════════

  await test('recordSuccess: creates health entry', async () => {
    _handlerHealth.clear();
    recordSuccess('test-handler');
    const health = getHandlerHealth();
    assert.ok(health['test-handler']);
    assert.strictEqual(health['test-handler'].totalSuccess, 1);
    assert.strictEqual(health['test-handler'].consecutiveFailures, 0);
  });

  await test('recordSuccess: resets consecutive failures', async () => {
    _handlerHealth.clear();
    recordFailure('test-handler', new Error('boom'));
    recordFailure('test-handler', new Error('boom'));
    recordSuccess('test-handler');
    const health = getHandlerHealth();
    assert.strictEqual(health['test-handler'].consecutiveFailures, 0);
    assert.strictEqual(health['test-handler'].totalFailures, 2);
    assert.strictEqual(health['test-handler'].totalSuccess, 1);
  });

  // ═══════════════════════════════════════════════════
  // 2. Handler Failure & Circuit Breaker
  // ═══════════════════════════════════════════════════

  await test('recordFailure: increments counters', async () => {
    _handlerHealth.clear();
    const { disabled } = recordFailure('failing-handler', new Error('crash'));
    assert.strictEqual(disabled, false);
    const health = getHandlerHealth();
    assert.strictEqual(health['failing-handler'].consecutiveFailures, 1);
    assert.strictEqual(health['failing-handler'].totalFailures, 1);
  });

  await test(`recordFailure: ${HANDLER_CRASH_THRESHOLD} crashes → disabled`, async () => {
    _handlerHealth.clear();
    let result;
    for (let i = 0; i < HANDLER_CRASH_THRESHOLD; i++) {
      result = recordFailure('crashing-handler', new Error(`crash ${i + 1}`));
    }
    assert.strictEqual(result.disabled, true);
    assert.strictEqual(isHandlerDisabled('crashing-handler'), true);
  });

  await test('isHandlerDisabled: healthy handler → false', async () => {
    _handlerHealth.clear();
    recordSuccess('healthy-handler');
    assert.strictEqual(isHandlerDisabled('healthy-handler'), false);
  });

  await test('isHandlerDisabled: non-existent handler → false', async () => {
    _handlerHealth.clear();
    assert.strictEqual(isHandlerDisabled('nonexistent'), false);
  });

  await test('getDisabledHandlers: lists disabled handlers', async () => {
    _handlerHealth.clear();
    for (let i = 0; i < HANDLER_CRASH_THRESHOLD; i++) {
      recordFailure('disabled-one', new Error('crash'));
    }
    recordSuccess('healthy-one');
    const disabled = getDisabledHandlers();
    assert.ok(disabled.includes('disabled-one'));
    assert.ok(!disabled.includes('healthy-one'));
  });

  // ═══════════════════════════════════════════════════
  // 3. Manual Enable/Disable
  // ═══════════════════════════════════════════════════

  await test('enableHandler: re-enables disabled handler', async () => {
    _handlerHealth.clear();
    for (let i = 0; i < HANDLER_CRASH_THRESHOLD; i++) {
      recordFailure('to-enable', new Error('crash'));
    }
    assert.strictEqual(isHandlerDisabled('to-enable'), true);
    enableHandler('to-enable');
    assert.strictEqual(isHandlerDisabled('to-enable'), false);
  });

  await test('disableHandler: manually disables', async () => {
    _handlerHealth.clear();
    recordSuccess('to-disable');
    disableHandler('to-disable');
    assert.strictEqual(isHandlerDisabled('to-disable'), true);
  });

  // ═══════════════════════════════════════════════════
  // 4. Handler Health Dashboard
  // ═══════════════════════════════════════════════════

  await test('getHandlerHealth: shows status correctly', async () => {
    _handlerHealth.clear();
    recordSuccess('healthy');
    recordFailure('degraded', new Error('one fail'));
    for (let i = 0; i < HANDLER_CRASH_THRESHOLD; i++) {
      recordFailure('broken', new Error('crash'));
    }

    const health = getHandlerHealth();
    assert.strictEqual(health['healthy'].status, 'healthy');
    assert.strictEqual(health['degraded'].status, 'degraded');
    assert.strictEqual(health['broken'].status, 'disabled');
  });

  // ═══════════════════════════════════════════════════
  // 5. Crash Isolation (batch dispatch simulation)
  // ═══════════════════════════════════════════════════

  await test('crash isolation: one handler crash does not affect others', async () => {
    _handlerHealth.clear();

    // Simulate: handler A crashes, handler B succeeds
    // Both should have independent health records
    recordFailure('handler-a', new Error('crash'));
    recordSuccess('handler-b');

    const health = getHandlerHealth();
    assert.strictEqual(health['handler-a'].consecutiveFailures, 1);
    assert.strictEqual(health['handler-b'].consecutiveFailures, 0);
    assert.strictEqual(health['handler-a'].status, 'degraded');
    assert.strictEqual(health['handler-b'].status, 'healthy');
  });

  // ═══════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════

  _handlerHealth.clear();
  console.log(`\n📊 Resilient Dispatcher: ${passed} passed, ${failed} failed`);
  return { passed, failed };
}

module.exports = { run };

if (require.main === module) {
  run().then(({ failed }) => process.exit(failed > 0 ? 1 : 0));
}
