const fs = require('fs');
const os = require('os');
const path = require('path');
const { DispatchEngine } = require('../dispatch-engine');
const { onDispatchBridge, getPendingTasks, clearPending } = require('../dispatch-bridge');
const { republishStrandedSpawning } = require('../dispatch-runner');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-hardening-'));
}

describe('dispatch hardening', () => {
  test('onDispatch receives engine and writes dispatch metadata', () => {
    clearPending();
    const baseDir = tmpDir();
    const engine = new DispatchEngine({
      baseDir,
      maxSlots: 1,
      onDispatch: (task, eng) => onDispatchBridge(task, eng),
    });

    engine.enqueue({ taskId: 'meta-1', title: 'Meta task' });
    const pending = getPendingTasks();
    expect(pending).toHaveLength(1);
    expect(pending[0].taskId).toBe('meta-1');
    expect(pending[0].status).toBe('spawning');
    expect(pending[0].dispatchAttempts).toBe(1);
  });

  test('republishStrandedSpawning re-queues bridge pickup for spawning task', () => {
    clearPending();
    const baseDir = tmpDir();
    const engine = new DispatchEngine({
      baseDir,
      maxSlots: 1,
      onDispatch: null,
    });

    engine.enqueue({ taskId: 'stuck-1', title: 'Stuck task' });
    clearPending();

    const state = engine._load();
    state.spawning['stuck-1'].spawningAt = new Date(Date.now() - 10_000).toISOString();
    state.spawning['stuck-1'].lastDispatchAt = state.spawning['stuck-1'].spawningAt;
    engine._save();

    const republished = republishStrandedSpawning(engine, { republishSpawningMs: 1 });
    const pending = getPendingTasks();

    expect(republished).toBe(1);
    expect(pending.some(t => t.taskId === 'stuck-1')).toBe(true);
  });
});
