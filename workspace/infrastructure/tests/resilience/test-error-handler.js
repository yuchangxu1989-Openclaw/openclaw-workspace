'use strict';

/**
 * Resilience Tests — Error Classification & Recovery
 * 
 * Tests all error scenarios:
 *   1. Error classification (transient/permanent/partial)
 *   2. Exponential backoff retry
 *   3. Degradation strategy
 *   4. Partial response recovery
 */

const assert = require('assert');
const path = require('path');

const {
  classify,
  withRetry,
  withDegradation,
  recoverPartialResponse,
  PermanentError,
  PartialError,
  RetryExhaustedError,
  DegradationError,
  ERROR_TYPES,
} = require('../../resilience/error-handler');

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
  console.log('\n🧪 Error Handler Tests\n');

  // ═══════════════════════════════════════════════════
  // 1. Error Classification
  // ═══════════════════════════════════════════════════

  await test('classify: network timeout → transient', async () => {
    const result = classify(new Error('Request timeout after 30000ms'));
    assert.strictEqual(result.type, ERROR_TYPES.TRANSIENT);
  });

  await test('classify: ETIMEDOUT → transient', async () => {
    const err = new Error('connect ETIMEDOUT');
    err.code = 'ETIMEDOUT';
    assert.strictEqual(classify(err).type, ERROR_TYPES.TRANSIENT);
  });

  await test('classify: ECONNRESET → transient', async () => {
    const err = new Error('socket hang up');
    err.code = 'ECONNRESET';
    assert.strictEqual(classify(err).type, ERROR_TYPES.TRANSIENT);
  });

  await test('classify: rate limit 429 → transient', async () => {
    const err = new Error('Rate limit exceeded');
    err.statusCode = 429;
    assert.strictEqual(classify(err).type, ERROR_TYPES.TRANSIENT);
  });

  await test('classify: 503 → transient', async () => {
    const err = new Error('Service unavailable');
    err.status = 503;
    assert.strictEqual(classify(err).type, ERROR_TYPES.TRANSIENT);
  });

  await test('classify: ENOENT → permanent', async () => {
    const err = new Error('ENOENT: no such file');
    err.code = 'ENOENT';
    assert.strictEqual(classify(err).type, ERROR_TYPES.PERMANENT);
  });

  await test('classify: JSON parse error → permanent', async () => {
    const result = classify(new Error('SyntaxError: Unexpected token in JSON'));
    assert.strictEqual(result.type, ERROR_TYPES.PERMANENT);
  });

  await test('classify: 401 unauthorized → permanent', async () => {
    const err = new Error('Unauthorized');
    err.statusCode = 401;
    assert.strictEqual(classify(err).type, ERROR_TYPES.PERMANENT);
  });

  await test('classify: incomplete response → partial', async () => {
    const result = classify(new Error('Unexpected end of JSON input'));
    assert.strictEqual(result.type, ERROR_TYPES.PARTIAL);
  });

  await test('classify: truncated → partial', async () => {
    assert.strictEqual(classify(new Error('Response truncated')).type, ERROR_TYPES.PARTIAL);
  });

  await test('classify: finish_reason length → partial', async () => {
    assert.strictEqual(classify(new Error('finish_reason: length')).type, ERROR_TYPES.PARTIAL);
  });

  await test('classify: unknown error → unknown', async () => {
    assert.strictEqual(classify(new Error('Something weird happened')).type, ERROR_TYPES.UNKNOWN);
  });

  await test('classify: string input', async () => {
    const result = classify('timeout error');
    assert.strictEqual(result.type, ERROR_TYPES.TRANSIENT);
    assert.strictEqual(result.message, 'timeout error');
  });

  // ═══════════════════════════════════════════════════
  // 2. Retry with Exponential Backoff
  // ═══════════════════════════════════════════════════

  await test('withRetry: succeeds on first attempt', async () => {
    let calls = 0;
    const { result, attempts } = await withRetry(() => { calls++; return 'ok'; });
    assert.strictEqual(result, 'ok');
    assert.strictEqual(attempts, 1);
    assert.strictEqual(calls, 1);
  });

  await test('withRetry: succeeds after transient failure', async () => {
    let calls = 0;
    const { result, attempts } = await withRetry(() => {
      calls++;
      if (calls < 3) throw new Error('ECONNRESET');
      return 'recovered';
    }, { baseDelayMs: 10, maxRetries: 3 });
    assert.strictEqual(result, 'recovered');
    assert.strictEqual(attempts, 3);
  });

  await test('withRetry: permanent error → immediate failure', async () => {
    let calls = 0;
    try {
      await withRetry(() => {
        calls++;
        const err = new Error('ENOENT: file not found');
        err.code = 'ENOENT';
        throw err;
      }, { baseDelayMs: 10 });
      assert.fail('Should have thrown');
    } catch (err) {
      assert.ok(err instanceof PermanentError);
      assert.strictEqual(calls, 1, 'should not retry permanent errors');
    }
  });

  await test('withRetry: partial error → immediate throw for caller recovery', async () => {
    try {
      await withRetry(() => {
        throw new Error('Unexpected end of JSON input');
      }, { baseDelayMs: 10 });
      assert.fail('Should have thrown');
    } catch (err) {
      assert.ok(err instanceof PartialError);
    }
  });

  await test('withRetry: exhausts retries → RetryExhaustedError', async () => {
    let calls = 0;
    try {
      await withRetry(() => {
        calls++;
        throw new Error('ECONNRESET');
      }, { maxRetries: 3, baseDelayMs: 10 });
      assert.fail('Should have thrown');
    } catch (err) {
      assert.ok(err instanceof RetryExhaustedError);
      assert.strictEqual(calls, 3);
      assert.ok(err.attempts.length === 3);
    }
  });

  await test('withRetry: onRetry callback is called', async () => {
    const retryLog = [];
    let calls = 0;
    const { result } = await withRetry(() => {
      calls++;
      if (calls < 2) throw new Error('ECONNRESET');
      return 'ok';
    }, {
      baseDelayMs: 10,
      onRetry: (attempt, err, delay) => { retryLog.push({ attempt, delay }); },
    });
    assert.strictEqual(result, 'ok');
    assert.strictEqual(retryLog.length, 1);
    assert.strictEqual(retryLog[0].attempt, 1);
  });

  // ═══════════════════════════════════════════════════
  // 3. Degradation Strategy
  // ═══════════════════════════════════════════════════

  await test('withDegradation: primary succeeds', async () => {
    const { result, degraded } = await withDegradation(
      () => 'primary_result',
      () => 'fallback_result',
      { retryPrimary: false }
    );
    assert.strictEqual(result, 'primary_result');
    assert.strictEqual(degraded, false);
  });

  await test('withDegradation: primary fails → fallback', async () => {
    const { result, degraded, error } = await withDegradation(
      () => { throw new Error('primary failed'); },
      () => 'fallback_result',
      { retryPrimary: false }
    );
    assert.strictEqual(result, 'fallback_result');
    assert.strictEqual(degraded, true);
    assert.ok(error.includes('primary failed'));
  });

  await test('withDegradation: both fail → DegradationError', async () => {
    try {
      await withDegradation(
        () => { throw new Error('primary'); },
        () => { throw new Error('fallback'); },
        { retryPrimary: false }
      );
      assert.fail('Should have thrown');
    } catch (err) {
      assert.ok(err instanceof DegradationError);
      assert.ok(err.message.includes('primary'));
      assert.ok(err.message.includes('fallback'));
    }
  });

  // ═══════════════════════════════════════════════════
  // 4. Partial Response Recovery
  // ═══════════════════════════════════════════════════

  await test('recoverPartialResponse: valid JSON → full parse', async () => {
    const { parsed, method } = recoverPartialResponse('{"intent":"greet","confidence":0.95}');
    assert.deepStrictEqual(parsed, { intent: 'greet', confidence: 0.95 });
    assert.strictEqual(method, 'json_full');
  });

  await test('recoverPartialResponse: truncated JSON → fix and parse', async () => {
    const { parsed, method } = recoverPartialResponse('{"intent":"greet","data":{"key":"val"');
    assert.ok(parsed !== null, 'should fix truncated JSON');
    assert.strictEqual(parsed.intent, 'greet');
    assert.strictEqual(method, 'json_fixed');
  });

  await test('recoverPartialResponse: embedded JSON → extract', async () => {
    const raw = 'Here is the result: {"action":"analyze"} and some trailing text';
    const { parsed, method } = recoverPartialResponse(raw);
    assert.deepStrictEqual(parsed, { action: 'analyze' });
    assert.strictEqual(method, 'json_extracted');
  });

  await test('recoverPartialResponse: no JSON → regex extraction', async () => {
    const raw = 'intent = "file_request" and action = "send"';
    const { parsed, extracted, method } = recoverPartialResponse(raw);
    assert.strictEqual(parsed, null);
    assert.ok(extracted.length > 0, 'should extract via regex');
    assert.strictEqual(method, 'regex');
  });

  await test('recoverPartialResponse: empty input → none', async () => {
    const { parsed, method } = recoverPartialResponse('');
    assert.strictEqual(parsed, null);
    assert.strictEqual(method, 'none');
  });

  await test('recoverPartialResponse: null input → none', async () => {
    const { method } = recoverPartialResponse(null);
    assert.strictEqual(method, 'none');
  });

  // ═══════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════

  console.log(`\n📊 Error Handler: ${passed} passed, ${failed} failed`);
  return { passed, failed };
}

module.exports = { run };

if (require.main === module) {
  run().then(({ failed }) => process.exit(failed > 0 ? 1 : 0));
}
