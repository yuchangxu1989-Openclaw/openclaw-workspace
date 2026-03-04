'use strict';

/**
 * Resilient Bus Tests — Queue backpressure, DLQ, alerting
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const resilientBus = require('../../resilience/resilient-bus');

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
  console.log('\n🧪 Resilient Bus Tests\n');

  // ═══════════════════════════════════════════════════
  // 1. Event Priority Classification
  // ═══════════════════════════════════════════════════

  await test('getEventPriority: system.error → HIGH', async () => {
    const p = resilientBus.getEventPriority({ type: 'system.error.crash' });
    assert.strictEqual(p, resilientBus.EVENT_PRIORITY.HIGH);
  });

  await test('getEventPriority: user.message → HIGH', async () => {
    const p = resilientBus.getEventPriority({ type: 'user.message' });
    assert.strictEqual(p, resilientBus.EVENT_PRIORITY.HIGH);
  });

  await test('getEventPriority: system.health → LOW', async () => {
    const p = resilientBus.getEventPriority({ type: 'system.health.check' });
    assert.strictEqual(p, resilientBus.EVENT_PRIORITY.LOW);
  });

  await test('getEventPriority: debug.* → LOW', async () => {
    const p = resilientBus.getEventPriority({ type: 'debug.trace' });
    assert.strictEqual(p, resilientBus.EVENT_PRIORITY.LOW);
  });

  await test('getEventPriority: unknown type → NORMAL', async () => {
    const p = resilientBus.getEventPriority({ type: 'some.custom.event' });
    assert.strictEqual(p, resilientBus.EVENT_PRIORITY.NORMAL);
  });

  await test('getEventPriority: explicit metadata priority', async () => {
    const p = resilientBus.getEventPriority({
      type: 'debug.trace',
      metadata: { priority: 99 },
    });
    assert.strictEqual(p, 99);
  });

  await test('getEventPriority: null event → NORMAL', async () => {
    const p = resilientBus.getEventPriority(null);
    assert.strictEqual(p, resilientBus.EVENT_PRIORITY.NORMAL);
  });

  // ═══════════════════════════════════════════════════
  // 2. Dead Letter Queue
  // ═══════════════════════════════════════════════════

  await test('reportFailure: first failure → not in DLQ', async () => {
    // Clean state
    resilientBus._consumerFailures.clear();
    const result = resilientBus.reportFailure('test-consumer', 'evt-001', new Error('timeout'));
    assert.strictEqual(result.inDLQ, false);
    assert.strictEqual(result.failCount, 1);
  });

  await test('reportFailure: 3 consecutive failures → DLQ', async () => {
    resilientBus._consumerFailures.clear();
    resilientBus.reportFailure('test-consumer', 'evt-002', new Error('fail 1'));
    resilientBus.reportFailure('test-consumer', 'evt-002', new Error('fail 2'));
    const result = resilientBus.reportFailure('test-consumer', 'evt-002', new Error('fail 3'));
    assert.strictEqual(result.inDLQ, true);
    assert.strictEqual(result.failCount, 3);
  });

  await test('reportFailure: different events tracked separately', async () => {
    resilientBus._consumerFailures.clear();
    resilientBus.reportFailure('test-consumer', 'evt-A', new Error('fail'));
    resilientBus.reportFailure('test-consumer', 'evt-B', new Error('fail'));
    const resultA = resilientBus.reportFailure('test-consumer', 'evt-A', new Error('fail'));
    assert.strictEqual(resultA.failCount, 2);
    assert.strictEqual(resultA.inDLQ, false);
  });

  await test('retryDLQ: clears failure tracking', async () => {
    resilientBus._consumerFailures.clear();
    for (let i = 0; i < 3; i++) {
      resilientBus.reportFailure('test-consumer', 'evt-dlq', new Error('fail'));
    }
    resilientBus.retryDLQ('test-consumer', 'evt-dlq');
    // After retry, failure tracking should be cleared
    const failures = resilientBus._consumerFailures.get('test-consumer');
    assert.strictEqual(failures.has('evt-dlq'), false);
  });

  // ═══════════════════════════════════════════════════
  // 3. Health Stats
  // ═══════════════════════════════════════════════════

  await test('healthStats: returns expected shape', async () => {
    const stats = resilientBus.healthStats();
    assert.ok(typeof stats.queueDepth === 'number');
    assert.ok(typeof stats.dlqCount === 'number');
    assert.ok(typeof stats.trackedFailures === 'number');
    assert.ok(['healthy', 'warning', 'backpressure'].includes(stats.status));
  });

  // ═══════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════

  console.log(`\n📊 Resilient Bus: ${passed} passed, ${failed} failed`);
  resilientBus._consumerFailures.clear();
  return { passed, failed };
}

module.exports = { run };

if (require.main === module) {
  run().then(({ failed }) => process.exit(failed > 0 ? 1 : 0));
}
