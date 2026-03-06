'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { DispatchEngine, formatDuration } = require('../dispatch-engine');
const { DEFAULT_MODEL, OPUS_MODEL } = require('../model-governance');

function tmpEngine(opts = {}) {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-engine-'));
  return new DispatchEngine({ baseDir, maxSlots: opts.maxSlots ?? 3, ...opts });
}

// ─── State Machine Tests ─────────────────────────────────────────────────────

describe('DispatchEngine – state machine', () => {
  test('new engine starts empty with correct slot count', () => {
    const e = tmpEngine({ maxSlots: 19 });
    expect(e.freeSlots()).toBe(19);
    expect(e.busyCount()).toBe(0);
    expect(e.queueDepth()).toBe(0);
  });

  test('task lifecycle: queued → spawning → running → done', () => {
    const e = tmpEngine({ maxSlots: 1 });
    const task = e.enqueue({ title: 'Test task' });

    // enqueue auto-dispatches → should be in spawning
    const s1 = e._load();
    expect(Object.keys(s1.spawning)).toContain(task.taskId);
    expect(Object.keys(s1.queued)).not.toContain(task.taskId);

    // mark running
    const running = e.markRunning(task.taskId, { sessionKey: 'sess:1' });
    expect(running.status).toBe('running');
    expect(running.sessionKey).toBe('sess:1');
    expect(e.busyCount()).toBe(1);

    // mark done
    const done = e.markDone(task.taskId, { result: 'ok' });
    expect(done.status).toBe('done');
    expect(done.finishedAt).toBeTruthy();
    expect(done.duration).toBeTruthy();
    expect(e.busyCount()).toBe(0);
    expect(e.freeSlots()).toBe(1);
  });

  test('task lifecycle: queued → spawning → failed', () => {
    const e = tmpEngine({ maxSlots: 1 });
    const task = e.enqueue({ title: 'Fail task' });
    e.markRunning(task.taskId);
    const failed = e.markFailed(task.taskId, { error: 'build error' });
    expect(failed.status).toBe('failed');
    expect(failed.error).toBe('build error');
  });

  test('cancel works from any active state', () => {
    const e = tmpEngine({ maxSlots: 2 });

    // cancel from queued (when slots are full)
    const t1 = e.enqueue({ title: 'T1' });
    const t2 = e.enqueue({ title: 'T2' });
    const t3 = e.enqueue({ title: 'T3' }); // this should be queued

    const cancelled = e.cancel(t3.taskId);
    expect(cancelled.status).toBe('cancelled');

    // cancel from spawning
    const s = e._load();
    const spawningId = Object.keys(s.spawning)[0];
    const c2 = e.cancel(spawningId);
    expect(c2.status).toBe('cancelled');
  });
});

// ─── Axiom 2: enqueue = dispatch ──────────────────────────────────────────────

describe('Axiom 2: enqueue === dispatch', () => {
  test('enqueue immediately moves task to spawning when slot available', () => {
    const e = tmpEngine({ maxSlots: 5 });
    const task = e.enqueue({ title: 'Immediate' });

    const s = e._load();
    expect(s.spawning[task.taskId]).toBeTruthy();
    expect(s.spawning[task.taskId].status).toBe('spawning');
    expect(Object.keys(s.queued)).toHaveLength(0);
  });

  test('enqueue puts task in queue when all slots full', () => {
    const e = tmpEngine({ maxSlots: 2 });
    e.enqueue({ title: 'T1' });
    e.enqueue({ title: 'T2' });
    const t3 = e.enqueue({ title: 'T3' });

    expect(e.busyCount()).toBe(2);
    expect(e.queueDepth()).toBe(1);
    const s = e._load();
    expect(s.queued[t3.taskId]).toBeTruthy();
  });
});

// ─── Axiom 4: auto-backfill ──────────────────────────────────────────────────

describe('Axiom 4: slot freed → instant backfill', () => {
  test('markDone auto-dispatches next queued task', () => {
    const e = tmpEngine({ maxSlots: 2 });
    const t1 = e.enqueue({ title: 'T1' });
    const t2 = e.enqueue({ title: 'T2' });
    const t3 = e.enqueue({ title: 'T3' }); // queued

    expect(e.queueDepth()).toBe(1);

    // finish t1 → t3 should auto-dispatch
    e.markRunning(t1.taskId);
    e.markDone(t1.taskId);

    expect(e.queueDepth()).toBe(0);
    expect(e.busyCount()).toBe(2); // t2 + t3
    const s = e._load();
    expect(s.spawning[t3.taskId] || s.running[t3.taskId]).toBeTruthy();
  });

  test('markFailed also triggers backfill', () => {
    const e = tmpEngine({ maxSlots: 1 });
    const t1 = e.enqueue({ title: 'T1' });
    const t2 = e.enqueue({ title: 'T2' }); // queued

    e.markRunning(t1.taskId);
    e.markFailed(t1.taskId, { error: 'oops' });

    expect(e.busyCount()).toBe(1);
    const s = e._load();
    expect(s.spawning[t2.taskId]).toBeTruthy();
  });

  test('cancel triggers backfill', () => {
    const e = tmpEngine({ maxSlots: 1 });
    e.enqueue({ title: 'T1' });
    const t2 = e.enqueue({ title: 'T2' }); // queued

    const s1 = e._load();
    const spawningId = Object.keys(s1.spawning)[0];
    e.cancel(spawningId);

    expect(e.busyCount()).toBe(1);
    const s2 = e._load();
    expect(s2.spawning[t2.taskId]).toBeTruthy();
  });
});

// ─── Axiom 5: high utilisation ────────────────────────────────────────────────

describe('Axiom 5: 19-lane utilisation', () => {
  test('fills all 19 slots when 19+ tasks enqueued', () => {
    const e = tmpEngine({ maxSlots: 19 });
    const tasks = [];
    for (let i = 0; i < 25; i++) {
      tasks.push(e.enqueue({ title: `Task ${i}` }));
    }

    expect(e.busyCount()).toBe(19);
    expect(e.queueDepth()).toBe(6);
    expect(e.freeSlots()).toBe(0);

    const board = e.liveBoard();
    expect(board.summary.busySlots).toBe(19);
    expect(board.summary.utilisation).toBe('100.0%');
  });

  test('batch enqueue fills all slots efficiently', () => {
    const e = tmpEngine({ maxSlots: 19 });
    const inputs = Array.from({ length: 30 }, (_, i) => ({ title: `Batch ${i}` }));
    const tasks = e.enqueueBatch(inputs);

    expect(tasks).toHaveLength(30);
    expect(e.busyCount()).toBe(19);
    expect(e.queueDepth()).toBe(11);
  });
});

// ─── Axiom 6: accurate counts ────────────────────────────────────────────────

describe('Axiom 6: accurate counts', () => {
  test('liveBoard counts match actual state', () => {
    const e = tmpEngine({ maxSlots: 3 });
    e.enqueue({ title: 'T1' });
    e.enqueue({ title: 'T2' });
    const t3 = e.enqueue({ title: 'T3' });
    const t4 = e.enqueue({ title: 'T4' }); // queued

    const board = e.liveBoard();
    expect(board.summary.busySlots).toBe(3);
    expect(board.summary.spawningCount).toBe(3);
    expect(board.summary.runningCount).toBe(0);
    expect(board.summary.queueDepth).toBe(1);
    expect(board.summary.freeSlots).toBe(0);

    // mark one as running
    const s = e._load();
    const firstId = Object.keys(s.spawning)[0];
    e.markRunning(firstId);

    const board2 = e.liveBoard();
    expect(board2.summary.spawningCount).toBe(2);
    expect(board2.summary.runningCount).toBe(1);
    expect(board2.summary.busySlots).toBe(3);
  });

  test('finished tasks disappear from active counts', () => {
    const e = tmpEngine({ maxSlots: 2 });
    const t1 = e.enqueue({ title: 'T1' });
    const t2 = e.enqueue({ title: 'T2' });

    e.markRunning(t1.taskId);
    e.markDone(t1.taskId);

    const board = e.liveBoard();
    // t1 done → freed slot, no queue → only t2 active
    expect(board.summary.busySlots).toBe(1);
    expect(board.running).toHaveLength(0);
    expect(board.spawning).toHaveLength(1);
    expect(board.recentFinished).toHaveLength(1);
    expect(board.recentFinished[0].taskId).toBe(t1.taskId);
  });
});

// ─── Priority ordering ───────────────────────────────────────────────────────

describe('Priority ordering', () => {
  test('critical tasks dispatch before normal', () => {
    const e = tmpEngine({ maxSlots: 1 });
    // fill the slot
    e.enqueue({ title: 'Filler' });

    // add mixed priority to queue
    e.enqueue({ title: 'Normal', priority: 'normal' });
    e.enqueue({ title: 'Critical', priority: 'critical' });
    e.enqueue({ title: 'High', priority: 'high' });

    expect(e.queueDepth()).toBe(3);

    // free the slot → critical should be next
    const s = e._load();
    const fillerId = Object.keys(s.spawning)[0];
    e.markRunning(fillerId);
    e.markDone(fillerId);

    const s2 = e._load();
    const nextId = Object.keys(s2.spawning)[0];
    expect(s2.spawning[nextId].title).toBe('Critical');
  });
});

// ─── Stale detection ─────────────────────────────────────────────────────────

describe('Stale task detection', () => {
  test('detectStale finds stuck spawning tasks', () => {
    const e = tmpEngine({ maxSlots: 2 });
    const task = e.enqueue({ title: 'Stuck' });

    // backdate spawningAt
    const s = e._load();
    s.spawning[task.taskId].spawningAt = new Date(Date.now() - 200_000).toISOString();
    e._save();

    const stale = e.detectStale({ spawnTimeoutMs: 100_000 });
    expect(stale).toHaveLength(1);
    expect(stale[0].taskId).toBe(task.taskId);
    expect(stale[0].reason).toBe('spawn_timeout');
  });

  test('reapStale auto-fails stuck tasks and backfills', () => {
    const e = tmpEngine({ maxSlots: 1 });
    const t1 = e.enqueue({ title: 'Stuck' });
    const t2 = e.enqueue({ title: 'Waiting' }); // queued

    // backdate
    const s = e._load();
    s.spawning[t1.taskId].spawningAt = new Date(Date.now() - 200_000).toISOString();
    e._save();

    const reaped = e.reapStale({ spawnTimeoutMs: 100_000 });
    expect(reaped).toHaveLength(1);

    // t2 should now be dispatched
    expect(e.busyCount()).toBe(1);
    const s2 = e._load();
    expect(s2.spawning[t2.taskId]).toBeTruthy();
  });
});

// ─── Persistence ──────────────────────────────────────────────────────────────

describe('Persistence', () => {
  test('state survives reload', () => {
    const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-persist-'));
    const e1 = new DispatchEngine({ baseDir, maxSlots: 3 });
    e1.enqueue({ taskId: 'persist-1', title: 'Persistent' });
    e1.enqueue({ taskId: 'persist-2', title: 'Also persistent' });

    // new instance, same dir
    const e2 = new DispatchEngine({ baseDir, maxSlots: 3 });
    expect(e2.busyCount()).toBe(2);
    const s = e2._load();
    expect(s.spawning['persist-1']).toBeTruthy();
    expect(s.spawning['persist-2']).toBeTruthy();
  });

  test('live board file is written on every state change', () => {
    const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-board-'));
    const e = new DispatchEngine({ baseDir, maxSlots: 2 });
    e.enqueue({ title: 'Board test' });

    const boardPath = path.join(baseDir, 'state', 'live-board.json');
    expect(fs.existsSync(boardPath)).toBe(true);

    const board = JSON.parse(fs.readFileSync(boardPath, 'utf8'));
    expect(board.summary.busySlots).toBe(1);
  });
});

// ─── onDispatch callback ──────────────────────────────────────────────────────

describe('onDispatch callback', () => {
  test('onDispatch is called for each dispatched task', () => {
    const dispatched = [];
    const e = tmpEngine({
      maxSlots: 3,
      onDispatch: (task) => dispatched.push(task.taskId),
    });

    e.enqueue({ taskId: 'cb-1', title: 'A' });
    e.enqueue({ taskId: 'cb-2', title: 'B' });

    expect(dispatched).toEqual(['cb-1', 'cb-2']);
  });

  test('onDispatch failure auto-fails task and backfills', () => {
    let callCount = 0;
    const e = tmpEngine({
      maxSlots: 1,
      onDispatch: (task) => {
        callCount++;
        if (callCount === 1) throw new Error('spawn failed');
        // second call succeeds
      },
    });

    e.enqueue({ taskId: 'fail-spawn', title: 'Will fail' });
    e.enqueue({ taskId: 'backfill', title: 'Should backfill' });

    // first task failed, second should have been dispatched
    const s = e._load();
    expect(s.finished.find(t => t.taskId === 'fail-spawn')).toBeTruthy();
    expect(s.spawning['backfill'] || s.running['backfill']).toBeTruthy();
  });
});

describe('Model governance', () => {
  test('defaults missing model to gpt-5.4', () => {
    const e = tmpEngine({ maxSlots: 1 });
    const task = e.enqueue({ title: '普通实现任务' });
    const state = e._load();
    expect(state.spawning[task.taskId].model).toBe(DEFAULT_MODEL);
    expect(state.spawning[task.taskId].governance.reason).toBe('defaulted_to_gpt_5_4');
  });

  test('downgrades opus for non-critical ordinary tasks', () => {
    const e = tmpEngine({ maxSlots: 1 });
    const task = e.enqueue({
      title: '写周报',
      model: OPUS_MODEL,
      priority: 'normal',
      justification: '想用最强模型写周报',
    });
    const state = e._load();
    expect(state.spawning[task.taskId].model).toBe(DEFAULT_MODEL);
    expect(state.spawning[task.taskId].governance.reason).toBe('opus_downgraded_by_policy');
    expect(state.spawning[task.taskId].governance.opus.allowed).toBe(false);
  });

  test('allows opus only for critical architecture with justification', () => {
    const e = tmpEngine({ maxSlots: 1 });
    const task = e.enqueue({
      title: '核心系统架构设计评审',
      model: OPUS_MODEL,
      priority: 'critical',
      justification: '这是核心链路重构，需要高质量架构判断与权衡。',
    });
    const state = e._load();
    expect(state.spawning[task.taskId].model).toBe(OPUS_MODEL);
    expect(state.spawning[task.taskId].governance.reason).toBe('opus_allowed_by_policy');
    expect(state.spawning[task.taskId].governance.opus.allowed).toBe(true);
  });
});

describe('Bridge governance persistence', () => {
  test('pending dispatch preserves downgraded model and governance metadata', () => {
    const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-bridge-'));
    const { onDispatchBridge, getPendingTasks, clearPending } = require('../dispatch-bridge');
    clearPending();
    const e = new DispatchEngine({ baseDir, maxSlots: 1, onDispatch: (task) => onDispatchBridge(task) });

    e.enqueue({
      taskId: 'opus-doc-1',
      title: '整理会议纪要',
      model: OPUS_MODEL,
      priority: 'high',
      justification: '想试试 opus',
    });

    const pending = getPendingTasks();
    const record = pending.find((t) => t.taskId === 'opus-doc-1');
    expect(record).toBeTruthy();
    expect(record.model).toBe(DEFAULT_MODEL);
    expect(record.governance.reason).toBe('opus_downgraded_by_policy');
  });
});

// ─── Bulk operations ──────────────────────────────────────────────────────────

describe('Bulk operations', () => {
  test('clearQueue removes queued tasks but not active', () => {
    const e = tmpEngine({ maxSlots: 1 });
    e.enqueue({ title: 'Active' });
    e.enqueue({ title: 'Q1' });
    e.enqueue({ title: 'Q2' });

    expect(e.queueDepth()).toBe(2);
    const cleared = e.clearQueue();
    expect(cleared).toBe(2);
    expect(e.queueDepth()).toBe(0);
    expect(e.busyCount()).toBe(1);
  });

  test('reset clears everything', () => {
    const e = tmpEngine({ maxSlots: 3 });
    e.enqueue({ title: 'T1' });
    e.enqueue({ title: 'T2' });
    e.reset();

    expect(e.busyCount()).toBe(0);
    expect(e.queueDepth()).toBe(0);
    expect(e.freeSlots()).toBe(3);
  });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

describe('formatDuration', () => {
  test('formats milliseconds correctly', () => {
    expect(formatDuration(500)).toBe('500ms');
    expect(formatDuration(5000)).toBe('5s');
    expect(formatDuration(65000)).toBe('1m 5s');
    expect(formatDuration(3661000)).toBe('1h 1m');
  });
});

// ─── No "待发" state ──────────────────────────────────────────────────────────

describe('No "待发" / pending artificial state', () => {
  test('there is no pending status in the state machine', () => {
    const e = tmpEngine({ maxSlots: 19 });
    const tasks = [];
    for (let i = 0; i < 25; i++) {
      tasks.push(e.enqueue({ title: `T${i}` }));
    }

    const s = e._load();
    // Active tasks should be in spawning, excess in queued
    // NO task should have status "pending"
    const allStatuses = [
      ...Object.values(s.spawning).map(t => t.status),
      ...Object.values(s.running).map(t => t.status),
      ...Object.values(s.queued).map(t => t.status),
    ];

    expect(allStatuses).not.toContain('pending');
    expect(allStatuses.filter(s => s === 'spawning')).toHaveLength(19);
    expect(allStatuses.filter(s => s === 'queued')).toHaveLength(6);
  });
});

// ─── allTasks / activeTasks ───────────────────────────────────────────────────

describe('Reporting helpers', () => {
  test('allTasks returns complete picture', () => {
    const e = tmpEngine({ maxSlots: 2 });
    const t1 = e.enqueue({ title: 'T1' });
    const t2 = e.enqueue({ title: 'T2' });
    const t3 = e.enqueue({ title: 'T3' });

    e.markRunning(t1.taskId);
    e.markDone(t1.taskId);

    const all = e.allTasks();
    expect(all.length).toBeGreaterThanOrEqual(3);
    // running first, then spawning, then queued, then finished
    const statuses = all.map(t => t.status);
    expect(statuses).toContain('done');
  });

  test('activeTasks only returns spawning + running', () => {
    const e = tmpEngine({ maxSlots: 2 });
    e.enqueue({ title: 'T1' });
    e.enqueue({ title: 'T2' });
    e.enqueue({ title: 'T3' }); // queued

    const active = e.activeTasks();
    expect(active).toHaveLength(2);
    expect(active.every(t => ['spawning', 'running'].includes(t.status))).toBe(true);
  });
});
