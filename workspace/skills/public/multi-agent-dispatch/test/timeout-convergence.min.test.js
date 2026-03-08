const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { DispatchEngine } = require('../dispatch-engine');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-timeout-convergence-'));
}

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
  } catch (e) {
    console.error(`❌ ${name}`);
    console.error(e.stack || e.message);
    process.exitCode = 1;
  }
}

function backdateSpawning(engine, taskId) {
  const state = engine._load();
  state.spawning[taskId].spawningAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  engine._save();
}

test('default timeout convergence escalates replace -> split_requeue -> human_handoff', () => {
  const engine = new DispatchEngine({ baseDir: tmpDir(), maxSlots: 1, onDispatch: () => {} });

  const first = engine.enqueue({ title: 'Converge', agentId: 'coder' });
  backdateSpawning(engine, first.taskId);
  const reaped1 = engine.reapStale({ spawnTimeoutMs: 1000 });
  assert.strictEqual(reaped1.length, 1);
  assert.strictEqual(reaped1[0].timeoutDecision.action, 'replace');
  assert.ok(reaped1[0].derivedTaskId);

  const secondId = reaped1[0].derivedTaskId;
  backdateSpawning(engine, secondId);
  const reaped2 = engine.reapStale({ spawnTimeoutMs: 1000 });
  assert.strictEqual(reaped2.length, 1);
  assert.strictEqual(reaped2[0].timeoutDecision.action, 'split_requeue');
  assert.ok(reaped2[0].derivedTaskId);

  const splitTask = engine._load().finished.find((t) => t.taskId === secondId);
  assert.strictEqual(splitTask.splitRequeueRequested, true);

  const thirdId = reaped2[0].derivedTaskId;
  backdateSpawning(engine, thirdId);
  const reaped3 = engine.reapStale({ spawnTimeoutMs: 1000 });
  assert.strictEqual(reaped3.length, 1);
  assert.strictEqual(reaped3[0].timeoutDecision.action, 'human_handoff');
  assert.ok(reaped3[0].derivedTaskId);

  const handoff = engine._load().spawning[reaped3[0].derivedTaskId] || engine._load().queued[reaped3[0].derivedTaskId];
  assert.ok(handoff);
  assert.strictEqual(handoff.payload.timeoutCount, 3);
  assert.strictEqual(handoff.payload.timeoutPolicyAction, 'human_handoff');
});

test('split_requeue follow-up carries child shards for recursive decomposition', () => {
  const engine = new DispatchEngine({ baseDir: tmpDir(), maxSlots: 2, onDispatch: () => {} });
  const root = engine.enqueue({ title: 'Split default', agentId: 'coder' });
  backdateSpawning(engine, root.taskId);
  const first = engine.reapStale({ spawnTimeoutMs: 1000 })[0];
  const replacementId = first.derivedTaskId;
  backdateSpawning(engine, replacementId);
  const second = engine.reapStale({ spawnTimeoutMs: 1000 })[0];
  const splitFollowup = engine._load().spawning[second.derivedTaskId] || engine._load().queued[second.derivedTaskId];
  assert.ok(Array.isArray(splitFollowup.payload.parallelChildren));
  assert.strictEqual(splitFollowup.payload.parallelChildren.length, 2);
});

if (!process.exitCode) console.log('ALL PASSED');
