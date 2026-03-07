const fs = require('fs');
const os = require('os');
const path = require('path');
const { DispatchEngine } = require('../dispatch-engine');
const {
  onDispatchBridge,
  getPendingTasks,
  clearPending,
  ackTask,
  markSpawned,
  markDelivered,
  markDeliveryFailed,
} = require('../dispatch-bridge');
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
    expect(pending[0].delivery.state).toBe('pending');
  });

  test('delivery chain metadata progresses pending → acked → spawned → delivered', () => {
    clearPending();
    const baseDir = tmpDir();
    const engine = new DispatchEngine({
      baseDir,
      maxSlots: 1,
      onDispatch: (task, eng) => onDispatchBridge(task, eng),
    });

    engine.enqueue({ taskId: 'chain-1', title: 'Chain task' });

    ackTask('chain-1', { source: 'test', worker: 'jest' });
    markSpawned('chain-1', { source: 'test', worker: 'jest', sessionKey: 'sess-1' });
    markDelivered('chain-1', { source: 'test', worker: 'jest', sessionKey: 'sess-1', message: 'handoff ok' });

    const task = getPendingTasks().find(t => t.taskId === 'chain-1');
    expect(task.delivery.state).toBe('delivered');
    expect(task.delivery.sessionKey).toBe('sess-1');
    expect(task.delivery.history.map(h => h.state)).toEqual(['pending', 'acked', 'spawned', 'delivered']);
  });

  test('delivery failure is persisted for correlation', () => {
    clearPending();
    const baseDir = tmpDir();
    const engine = new DispatchEngine({
      baseDir,
      maxSlots: 1,
      onDispatch: (task, eng) => onDispatchBridge(task, eng),
    });

    engine.enqueue({ taskId: 'chain-fail-1', title: 'Broken chain task' });
    ackTask('chain-fail-1', { source: 'test', worker: 'jest' });
    markDeliveryFailed('chain-fail-1', { source: 'test', worker: 'jest', error: 'spawn timeout' });

    const task = getPendingTasks().find(t => t.taskId === 'chain-fail-1');
    expect(task.delivery.state).toBe('failed');
    expect(task.delivery.error).toBe('spawn timeout');
    expect(task.delivery.history[task.delivery.history.length - 1].state).toBe('failed');
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
