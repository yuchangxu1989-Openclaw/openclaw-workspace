const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { main } = require('../dispatch-cron-runner');
const { DispatchEngine } = require('../dispatch-engine');
const { clearPending } = require('../dispatch-bridge');

function mkBaseDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-cron-runner-'));
}

test('dispatch cron runner logs full-chain summary and writes observability jsonl', async () => {
  const baseDir = path.resolve(__dirname, '..');
  const stateDir = path.join(baseDir, 'state');
  const engineStateFile = path.join(stateDir, 'engine-state.json');
  const runnerStateFile = path.join(stateDir, 'runner-state.json');
  const logFile = path.join(baseDir, '../../..', 'infrastructure/logs/dispatch-cron-runner.jsonl');
  clearPending();
  [engineStateFile, runnerStateFile].forEach((file) => {
    try { fs.unlinkSync(file); } catch {}
  });

  const engine = new DispatchEngine({
    baseDir,
    maxSlots: 1,
    onDispatch: (task, eng) => {
      const { onDispatchBridge } = require('../dispatch-bridge');
      return onDispatchBridge(task, eng);
    },
  });

  const task = engine.enqueue({
    taskId: 'cron-timeout-1',
    title: 'Timeout Root Cause',
    description: 'Investigate timeout and continue',
    agentId: 'coder',
    payload: {
      model: 'claude-opus-4-6',
    },
    autoSplitOnTimeout: true,
  });

  const state = engine._load();
  assert.ok(state.spawning[task.taskId]);
  state.spawning[task.taskId].spawningAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  state.spawning[task.taskId].lastDispatchAt = state.spawning[task.taskId].spawningAt;
  engine._save(state);

  const originalCwd = process.cwd();
  const skillDir = path.resolve(__dirname, '..');
  process.chdir(skillDir);

  try {
    globalThis.sessions_spawn = async (payload) => ({ sessionKey: `sess-${payload.label}` });
    await main();
  } finally {
    delete globalThis.sessions_spawn;
    process.chdir(originalCwd);
  }

  const runnerState = JSON.parse(fs.readFileSync(runnerStateFile, 'utf8'));
  assert.equal(typeof runnerState.lastTickAt, 'string');

  const lastLine = fs.readFileSync(logFile, 'utf8').trim().split('\n').pop();
  const record = JSON.parse(lastLine);

  assert.equal(record.job, 'dispatch-cron-runner');
  assert.equal(record.ok, false);
  assert.equal(record.reaped >= 1, true);
  assert.equal(record.reapedFollowups >= 1, true);
  assert.equal(record.spawned >= 1, true);
  assert.equal(record.errors.length >= 1, true);
  assert.equal(record.board.runningCount >= 1 || record.board.spawningCount >= 1, true);
});
