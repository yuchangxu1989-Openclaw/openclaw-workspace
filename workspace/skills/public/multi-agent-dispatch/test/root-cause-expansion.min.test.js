const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { DispatchEngine } = require('../dispatch-engine');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-root-cause-'));
}

function makeEngine(opts = {}) {
  return new DispatchEngine({
    baseDir: tmpDir(),
    maxSlots: opts.maxSlots ?? 2,
    onDispatch: opts.onDispatch || (() => {}),
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

test('markDone auto-splits completed task into phase children and remaining followups', () => {
  const engine = makeEngine({ maxSlots: 2 });
  const parent = engine.enqueue({
    taskId: 'root-fix-1',
    title: 'Long task root',
    agentId: 'coder',
    model: 'gpt-4o',
  });

  engine.markRunning(parent.taskId, { sessionKey: 'sess-root' });
  const done = engine.markDone(parent.taskId, {
    result: 'phase-0 artifact ready',
    artifactProduced: true,
    parallelChildren: [
      { taskId: 'phase-a', title: 'Phase A', model: 'gpt-4o', agentId: 'coder' },
      { taskId: 'phase-b', title: 'Phase B', model: 'gpt-4o-mini', agentId: 'writer' },
    ],
    remainingTasks: [
      { taskId: 'remain-c', title: 'Remaining C', model: 'gpt-4.1', agentId: 'analyst' },
    ],
  });

  const state = engine._load();
  assert.strictEqual(done.status, 'done');
  assert.strictEqual(done.artifactProduced, true);
  assert.strictEqual(done.followupTaskCount, 3);
  assert.deepStrictEqual(done.followupTaskIds.sort(), ['phase-a', 'phase-b', 'remain-c'].sort());
  assert.ok(state.finished.find((t) => t.taskId === parent.taskId));
  assert.ok(state.spawning['phase-a'] || state.running['phase-a']);
  assert.ok(state.spawning['phase-b'] || state.running['phase-b']);
  assert.ok(state.queued['remain-c'] || state.spawning['remain-c'] || state.running['remain-c']);
});

if (!process.exitCode) {
  console.log('ALL PASSED');
}
