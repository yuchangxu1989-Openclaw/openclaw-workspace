const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { DispatchEngine } = require('../dispatch-engine');
const { drainAndRun } = require('../dispatch-runner');
const { clearPending, getPendingTasks } = require('../dispatch-bridge');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-timeout-auto-split-'));
}

function test(name, fn) {
  try {
    Promise.resolve(fn()).then(() => console.log(`✅ ${name}`)).catch((e) => {
      console.error(`❌ ${name}`);
      console.error(e.stack || e.message);
      process.exitCode = 1;
    });
  } catch (e) {
    console.error(`❌ ${name}`);
    console.error(e.stack || e.message);
    process.exitCode = 1;
  }
}

function buildEngine(baseDir, dispatched) {
  clearPending();
  return new DispatchEngine({
    baseDir,
    maxSlots: 2,
    onDispatch: (task) => dispatched.push(task.taskId),
  });
}

['restart', 'replace', 'archive', 'human_handoff'].forEach((action) => {
  test(`timeout ${action} auto-derives follow-up and leaves timeout state`, () => {
    const baseDir = tmpDir();
    const dispatched = [];
    const engine = buildEngine(baseDir, dispatched);
    const task = engine.enqueue({
      title: `timeout-${action}`,
      agentId: 'coder',
      payload: { timeoutAction: action },
    });

    const state = engine._load();
    state.spawning[task.taskId].spawningAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    engine._save();

    const reaped = engine.reapStale({ spawnTimeoutMs: 1000 });
    assert.strictEqual(reaped.length, 1);
    assert.strictEqual(reaped[0].timeoutDecision.action, action);
    assert.ok(reaped[0].derivedTaskId, 'must create derived follow-up task');

    const latest = engine._load();
    const finished = latest.finished.find((t) => t.taskId === task.taskId);
    assert.ok(finished);
    assert.strictEqual(finished.status, 'failed');
    assert.strictEqual(finished.derivedTaskId, reaped[0].derivedTaskId);
    assert.ok(!latest.spawning[task.taskId] && !latest.running[task.taskId]);
    assert.ok(latest.spawning[reaped[0].derivedTaskId] || latest.running[reaped[0].derivedTaskId]);

    const derived = latest.spawning[reaped[0].derivedTaskId] || latest.running[reaped[0].derivedTaskId] || latest.queued[reaped[0].derivedTaskId];
    assert.strictEqual(derived.payload.timeoutAutoSplitRequeue, true);
    assert.strictEqual(derived.payload.timeoutOriginDecision, action);
  });
});

test('dispatch-runner default chain reaps and republishes timeout follow-up', async () => {
  const baseDir = tmpDir();
  clearPending();
  const engine = new DispatchEngine({
    baseDir,
    maxSlots: 1,
    onDispatch: (task, eng) => {
      const { onDispatchBridge } = require('../dispatch-bridge');
      return onDispatchBridge(task, eng);
    },
  });

  const task = engine.enqueue({ title: 'runner-timeout', agentId: 'coder', payload: { timeoutAction: 'archive' } });
  const state = engine._load();
  state.spawning[task.taskId].spawningAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  engine._save();

  globalThis.sessions_spawn = async (payload) => ({ sessionKey: `sess-${payload.label}` });
  const result = await drainAndRun({ baseDir, maxDispatchPerTick: 5, republishSpawningMs: 0 });

  assert.strictEqual(result.reaped, 1);
  assert.strictEqual(result.reapedFollowups, 1);
  assert.strictEqual(result.spawned >= 1, true);
  const pending = getPendingTasks();
  assert.ok(pending.some((item) => item.title.includes('[archive-review]')));
  delete globalThis.sessions_spawn;
});

process.on('beforeExit', () => {
  if (!process.exitCode) console.log('ALL PASSED');
});
