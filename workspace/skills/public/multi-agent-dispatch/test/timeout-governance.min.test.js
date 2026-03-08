const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { DispatchEngine } = require('../dispatch-engine');
const { drainAndRun } = require('../dispatch-runner');
const { clearPending } = require('../dispatch-bridge');
const { ReportTrigger } = require('../../multi-agent-reporting/report-trigger');

function makeEngine() {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-timeout-governance-'));
  clearPending();
  return new DispatchEngine({ baseDir, maxSlots: 1 });
}

function test(name, fn) {
  Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`✅ ${name}`);
    })
    .catch((e) => {
      console.error(`❌ ${name}`);
      console.error(e.stack || e.message);
      process.exitCode = 1;
    });
}

test('timeout task enters immediate decision and leaves active state', () => {
  const engine = makeEngine();
  const task = engine.enqueue({ title: 'timeout-case', agentId: 'coder', payload: { timeoutAction: 'human_handoff' } });
  const s = engine._load();
  s.spawning[task.taskId].spawningAt = new Date(Date.now() - 300000).toISOString();
  engine._save();

  const reaped = engine.reapStale({ spawnTimeoutMs: 1000 });
  assert.strictEqual(reaped.length, 1);
  const finished = engine._load().finished.find((t) => t.taskId === task.taskId);
  assert.ok(finished);
  assert.strictEqual(finished.nextAction, 'human_handoff');
  assert.strictEqual(finished.humanHandoffRequired, true);
  assert.strictEqual(Boolean(engine._load().spawning[task.taskId]), false);
  assert.strictEqual(Boolean(engine._load().running[task.taskId]), false);
});

test('restart/replace timeout immediately derives and dispatches follow-up task', () => {
  const pending = [];
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-timeout-followup-'));
  clearPending();
  const engine = new DispatchEngine({ baseDir, maxSlots: 2, onDispatch: (task) => pending.push(task.taskId) });

  const task = engine.enqueue({ title: 'replace-timeout', agentId: 'coder', payload: { timeoutAction: 'replace' } });
  const s = engine._load();
  s.spawning[task.taskId].spawningAt = new Date(Date.now() - 300000).toISOString();
  engine._save();

  const reaped = engine.reapStale({ spawnTimeoutMs: 1000 });
  assert.strictEqual(reaped.length, 1);
  assert.ok(reaped[0].derivedTaskId);
  const followupId = reaped[0].derivedTaskId;
  const state = engine._load();
  assert.ok(state.spawning[followupId] || state.running[followupId]);
  assert.ok(pending.includes(followupId));
  const followup = state.spawning[followupId] || state.running[followupId] || state.queued[followupId];
  assert.strictEqual(followup.model, 'boom-coder/gpt-5.3-codex');
  assert.strictEqual(followup.runtimeModelKey, 'boom-coder/gpt-5.3-codex');
  const finished = state.finished.find((t) => t.taskId === task.taskId);
  assert.strictEqual(finished.derivedTaskId, followupId);
  assert.strictEqual(finished.derivedTaskAction, 'replace');
});

test('timeout follow-up spawn uses provider-scoped default route and does not fail route validation', async () => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-timeout-followup-runner-'));
  clearPending();
  const engine = new DispatchEngine({ baseDir, maxSlots: 2 });

  const task = engine.enqueue({
    title: 'replace-timeout-runner',
    agentId: 'writer',
    payload: {
      timeoutAction: 'replace',
      task: 'write recovery summary',
    },
  });

  const state = engine._load();
  state.spawning[task.taskId].spawningAt = new Date(Date.now() - 300000).toISOString();
  engine._save();

  const originalSpawn = globalThis.sessions_spawn;
  const spawnCalls = [];
  globalThis.sessions_spawn = async (payload) => {
    spawnCalls.push({ ...payload });
    return { sessionKey: `sess-${spawnCalls.length}` };
  };

  try {
    const result = await drainAndRun({ baseDir, maxDispatchPerTick: 5 });
    const routeMismatchErrors = result.errors.filter((item) => /route mismatch|cannot route through provider/i.test(item.error));
    assert.strictEqual(routeMismatchErrors.length, 0);
    assert.strictEqual(result.reaped, 1);
    assert.strictEqual(result.reapedFollowups, 1);
    assert.strictEqual(result.spawned >= 0, true);
    const writerSpawn = spawnCalls.find((call) => call.agentId === 'writer');
    assert.ok(writerSpawn);
    assert.strictEqual(writerSpawn.model, 'gpt-5.3-codex');

    const latest = engine.reload();
    const running = Object.values(latest.running).filter((item) => item.agentId === 'writer' && item.runtimeModelKey === 'boom-writer/gpt-5.3-codex');
    assert.strictEqual(running.length >= 1, true);
    assert.strictEqual(running[0].agentId, 'writer');
    assert.strictEqual(running[0].runtimeModelKey, 'boom-writer/gpt-5.3-codex');
    assert.strictEqual(running[0].modelKey, 'boom-writer/gpt-5.3-codex');

    const finished = latest.finished.find((t) => t.taskId === task.taskId);
    assert.ok(finished);
    assert.strictEqual(finished.derivedTaskAction, 'replace');
    assert.ok(finished.derivedTaskId);
  } finally {
    globalThis.sessions_spawn = originalSpawn;
  }
});

test('finished list keeps unique current record per taskId', () => {
  const engine = makeEngine();
  const task = engine.enqueue({ taskId: 'uniq-1', title: 'uniq-case', agentId: 'coder' });
  engine.markFailed(task.taskId, { error: 'first' });
  engine._load().queued[task.taskId] = { ...engine._load().finished[0], status: 'queued', queuedAt: new Date().toISOString(), finishedAt: null };
  engine._save();
  engine.markFailed(task.taskId, { error: 'second' });
  const records = engine._load().finished.filter((t) => t.taskId === task.taskId);
  assert.strictEqual(records.length, 1);
  assert.strictEqual(records[0].error, 'second');
});

test('reporting aligns timeout state and decision', () => {
  const engine = makeEngine();
  const trigger = new ReportTrigger(engine, {});
  const task = engine.enqueue({ title: 'report-timeout', agentId: 'coder', payload: { timeoutAction: 'archive' } });
  const s = engine._load();
  s.spawning[task.taskId].spawningAt = new Date(Date.now() - 300000).toISOString();
  engine._save();
  engine.reapStale({ spawnTimeoutMs: 1000 });
  const report = trigger.buildReport('manual');
  assert.ok(report.text.includes('timeout') || report.text.includes('Timeout'));
  const mapped = trigger.engine._load().finished.find((t) => t.taskId === task.taskId);
  assert.strictEqual(mapped.timeoutDecision.action, 'archive');
  trigger.detach();
});

if (!process.exitCode) console.log('ALL PASSED');
