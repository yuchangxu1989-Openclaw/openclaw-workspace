const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { DispatchEngine } = require('../dispatch-engine');
const {
  clearPending,
  getPendingTasks,
  markDelivered,
  markDeliveryFailed,
} = require('../dispatch-bridge');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-lifecycle-consistency-'));
}

function makeEngine(opts = {}) {
  const baseDir = tmpDir();
  clearPending();
  return new DispatchEngine({
    baseDir,
    maxSlots: opts.maxSlots ?? 2,
    onDispatch: opts.onDispatch || ((task) => {
      const { onDispatchBridge } = require('../dispatch-bridge');
      return onDispatchBridge(task);
    }),
  });
}

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
  } catch (error) {
    console.error(`❌ ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

test('timeout restart keeps lifecycle closed-loop and main table consistent', () => {
  const dispatched = [];
  const engine = makeEngine({
    maxSlots: 1,
    onDispatch: (task) => dispatched.push(task.taskId),
  });

  const original = engine.enqueue({
    taskId: 'timeout-restart-1',
    title: 'Timeout restart case',
    agentId: 'coder',
    payload: { timeoutAction: 'restart' },
  });

  const state = engine._load();
  state.spawning[original.taskId].spawningAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  state.spawning[original.taskId].lastDispatchAt = state.spawning[original.taskId].spawningAt;
  engine._save();

  const reaped = engine.reapStale({ spawnTimeoutMs: 1000 });
  assert.strictEqual(reaped.length, 1);
  assert.strictEqual(reaped[0].timeoutDecision.action, 'restart');
  assert.ok(reaped[0].derivedTaskId);

  const latest = engine._load();
  const finishedOriginal = latest.finished.find((t) => t.taskId === original.taskId);
  assert.ok(finishedOriginal);
  assert.strictEqual(finishedOriginal.status, 'failed');
  assert.strictEqual(finishedOriginal.restartRequested, true);
  assert.strictEqual(finishedOriginal.derivedTaskId, reaped[0].derivedTaskId);
  assert.strictEqual(latest.finished.filter((t) => t.taskId === original.taskId).length, 1);
  assert.ok(latest.spawning[reaped[0].derivedTaskId] || latest.running[reaped[0].derivedTaskId]);
  assert.deepStrictEqual(dispatched, [original.taskId, reaped[0].derivedTaskId]);
});

test('parallel split keeps exact busy/queue counts during backfill', () => {
  const engine = makeEngine({ maxSlots: 2 });

  const t1 = engine.enqueue({ taskId: 'parallel-1', title: 'Parallel 1', agentId: 'coder' });
  const t2 = engine.enqueue({ taskId: 'parallel-2', title: 'Parallel 2', agentId: 'coder' });
  const t3 = engine.enqueue({ taskId: 'parallel-3', title: 'Parallel 3', agentId: 'coder' });

  let board = engine.liveBoard();
  assert.strictEqual(board.summary.busySlots, 2);
  assert.strictEqual(board.summary.queueDepth, 1);
  assert.strictEqual(board.summary.spawningCount + board.summary.runningCount, board.summary.busySlots);

  engine.markRunning(t1.taskId, { sessionKey: 'sess-p1' });
  engine.markDone(t1.taskId, { result: 'ok' });

  board = engine.liveBoard();
  assert.strictEqual(board.summary.busySlots, 2);
  assert.strictEqual(board.summary.queueDepth, 0);
  assert.strictEqual(board.summary.spawningCount + board.summary.runningCount, board.summary.busySlots);
  const activeIds = [...board.spawning, ...board.running].map((t) => t.taskId).sort();
  assert.deepStrictEqual(activeIds.sort(), [t2.taskId, t3.taskId].sort());
});

test('bridge delivery state converges with main table final status', () => {
  const engine = makeEngine({ maxSlots: 1 });
  const task = engine.enqueue({ taskId: 'delivery-consistency-1', title: 'Delivery consistency', agentId: 'coder' });

  engine.markRunning(task.taskId, { sessionKey: 'sess-delivery' });
  markDelivered(task.taskId, {
    source: 'test',
    worker: 'node',
    sessionKey: 'sess-delivery',
    status: 'running',
    message: 'subagent accepted',
  });
  engine.markDone(task.taskId, { result: 'finished' });

  const board = engine.liveBoard();
  assert.strictEqual(board.summary.busySlots, 0);
  const finished = engine._load().finished.find((t) => t.taskId === task.taskId);
  assert.ok(finished);
  assert.strictEqual(finished.status, 'done');

  const pendingRecord = getPendingTasks().find((t) => t.taskId === task.taskId);
  assert.ok(pendingRecord);
  assert.strictEqual(pendingRecord.delivery.state, 'delivered');
  assert.strictEqual(pendingRecord.status, 'running');
});

test('delivery failure + engine failure still preserves single authoritative final record', () => {
  const engine = makeEngine({ maxSlots: 1 });
  const task = engine.enqueue({ taskId: 'delivery-fail-1', title: 'Delivery fail consistency', agentId: 'coder' });

  markDeliveryFailed(task.taskId, { source: 'test', worker: 'node', error: 'spawn timeout', status: 'failed' });
  engine.markFailed(task.taskId, { error: 'dispatch-runner spawn error: spawn timeout' });

  const finished = engine._load().finished.filter((t) => t.taskId === task.taskId);
  assert.strictEqual(finished.length, 1);
  assert.strictEqual(finished[0].status, 'failed');
  assert.match(finished[0].error, /spawn timeout/);

  const pendingRecord = getPendingTasks().find((t) => t.taskId === task.taskId);
  assert.ok(pendingRecord);
  assert.strictEqual(pendingRecord.delivery.state, 'failed');
  assert.strictEqual(pendingRecord.status, 'failed');
});

if (!process.exitCode) {
  console.log('ALL PASSED');
}
