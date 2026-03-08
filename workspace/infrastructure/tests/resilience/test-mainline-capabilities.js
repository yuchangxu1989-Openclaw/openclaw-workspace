'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  MainlineWAL,
  MainlineTrace,
  MainlineRecovery,
  MainlineCircuitBreaker,
  executeWithRetry,
} = require('../../resilience/mainline-capabilities');

async function run() {
  const tempDir = path.join(__dirname, '.tmp-mainline');
  fs.rmSync(tempDir, { recursive: true, force: true });
  fs.mkdirSync(tempDir, { recursive: true });

  const wal = new MainlineWAL({ dir: path.join(tempDir, 'wal') });
  const trace = new MainlineTrace({ file: path.join(tempDir, 'trace.jsonl') });
  const recovery = new MainlineRecovery({ file: path.join(tempDir, 'recovery.jsonl') });
  const circuit = new MainlineCircuitBreaker({ stateFile: path.join(tempDir, 'circuit.json'), failureThreshold: 2, resetTimeoutMs: 50 });

  wal.append({ type: 'dispatch_start', traceId: 't-1' });
  trace.log('dispatch.start', { traceId: 't-1' });
  recovery.trigger({ traceId: 't-1', source: 'test', reason: 'forced' });

  assert.strictEqual(wal.queryByTrace('t-1').length, 1);
  assert.ok(fs.readFileSync(path.join(tempDir, 'trace.jsonl'), 'utf8').includes('dispatch.start'));
  assert.ok(fs.readFileSync(path.join(tempDir, 'recovery.jsonl'), 'utf8').includes('forced'));

  circuit.recordFailure('handler-x', new Error('boom-1'));
  assert.strictEqual(circuit.canExecute('handler-x'), true);
  circuit.recordFailure('handler-x', new Error('boom-2'));
  assert.strictEqual(circuit.canExecute('handler-x'), false);

  let attempts = 0;
  const retryResult = await executeWithRetry(async () => {
    attempts += 1;
    if (attempts < 2) throw new Error('retry-me');
    return 'ok';
  }, { retries: 1, baseDelayMs: 1 });

  assert.strictEqual(retryResult, 'ok');
  assert.strictEqual(attempts, 2);

  console.log('mainline capabilities test passed');
}

module.exports = { run };

if (require.main === module) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
