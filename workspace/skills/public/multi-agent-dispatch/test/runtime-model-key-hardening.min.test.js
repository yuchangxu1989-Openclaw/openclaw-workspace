const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { DispatchEngine } = require('../dispatch-engine');
const { ReportTrigger } = require('../../multi-agent-reporting/report-trigger');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-key-hardening-'));
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

test('1 task = 1 agent = 1 model key: same key cannot be dispatched in parallel', () => {
  const engine = new DispatchEngine({ baseDir: tmpDir(), maxSlots: 3 });

  const t1 = engine.enqueue({ taskId: 'same-key-1', title: 'A', agentId: 'coder', model: 'boom-coder/gpt-5.3-codex' });
  const t2 = engine.enqueue({ taskId: 'same-key-2', title: 'B', agentId: 'writer', model: 'boom-coder/gpt-5.3-codex' });
  engine.markRunning(t1.taskId, { sessionKey: 'sess-same-1' });

  const t3 = engine.enqueue({ taskId: 'other-key-1', title: 'C', agentId: 'analyst', model: 'claude-opus-4-20250514', priority: 'critical', justification: 'critical architecture debugging' });

  const board = engine.liveBoard();
  const activeIds = board.running.map((t) => t.taskId).sort();
  assert.deepStrictEqual(activeIds, [t1.taskId].sort());
  assert.ok(board.spawning.some((t) => t.taskId === t3.taskId));
  assert.ok(!board.spawning.some((t) => t.taskId === t2.taskId));
  assert.strictEqual(board.summary.busySlots, 2);
  assert.strictEqual(board.summary.occupiedModelKeyCount, 2);
  assert.strictEqual(board.summary.queueDepth, 1);
  assert.strictEqual(engine.activeKeyCount(), 2);
  assert.ok(engine._load().queued[t2.taskId]);
});

test('active only counts real running tasks with occupied model keys in reporting', () => {
  const engine = new DispatchEngine({ baseDir: tmpDir(), maxSlots: 3, onDispatch: () => {} });
  const trigger = new ReportTrigger(engine, { includeRecent: false });

  const t1 = engine.enqueue({ taskId: 'report-1', title: 'Run-1', agentId: 'coder', model: 'boom-coder/gpt-5.3-codex' });
  const t2 = engine.enqueue({ taskId: 'report-2', title: 'Run-2', agentId: 'writer', model: 'claude-opus-4-20250514', priority: 'critical', justification: 'critical architecture debugging' });
  engine.markRunning(t1.taskId, { sessionKey: 'sess-1' });
  engine.markRunning(t2.taskId, { sessionKey: 'sess-2' });

  const report = trigger.buildReport('manual');
  assert.strictEqual(report.stats.active, 2);
  assert.strictEqual(report.runtimeActiveTasks.length, 2);
  assert.ok(report.text.includes('Agent并行总数：2'));

  engine.markDone(t1.taskId, { result: 'ok' });
  const reportAfter = trigger.buildReport('manual');
  assert.strictEqual(reportAfter.stats.active, 1);
  assert.ok(reportAfter.text.includes('Agent并行总数：1'));
});

test('runtime invariant throws on duplicated active model key occupancy', () => {
  const engine = new DispatchEngine({ baseDir: tmpDir(), maxSlots: 3, onDispatch: () => {} });
  const t1 = engine.enqueue({ taskId: 'dup-1', title: 'D1', agentId: 'coder', model: 'boom-coder/gpt-5.3-codex' });
  const t2 = engine.enqueue({ taskId: 'dup-2', title: 'D2', agentId: 'writer', model: 'claude-opus-4-20250514', priority: 'critical', justification: 'critical architecture debugging' });
  engine.markRunning(t1.taskId, { sessionKey: 'sess-1' });
  engine.markRunning(t2.taskId, { sessionKey: 'sess-2' });

  const originalInfer = engine.activeKeyMap.bind(engine);
  engine.activeKeyMap = () => ({ 'boom-coder/gpt-5.3-codex': [t1.taskId, t2.taskId] });

  assert.throws(() => engine.assertKeyOccupancyInvariant('test'), /invariant violated|must equal occupied model key count/);
  engine.activeKeyMap = originalInfer;
});

if (!process.exitCode) {
  console.log('ALL PASSED');
}
