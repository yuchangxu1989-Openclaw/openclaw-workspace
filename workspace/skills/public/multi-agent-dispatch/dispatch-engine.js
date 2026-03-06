'use strict';

/**
 * multi-agent-dispatch  v1.0.0
 * ─────────────────────────────
 * High-utilisation, zero-delay multi-agent dispatch engine.
 *
 * Design axioms (from user corrections):
 *   1. Dispatch ≫ explain/report. Every CPU cycle goes to filling slots first.
 *   2. enqueue() === attempt-dispatch(). There is no separate "dispatch" step.
 *   3. No "pending" / "待发" artificial hold state. Tasks go queued → spawning → running.
 *   4. Slot freed → immediate backfill. No wait-for-wave.
 *   5. 19-lane default. Aim for ≥90 % utilisation.
 *   6. Accurate counts. Running count === actually-running sessions.
 *   7. Workspace-only. Zero gateway changes.
 *
 * State machine per task:
 *
 *   ┌────────┐   drain()   ┌──────────┐  onSpawned()  ┌─────────┐
 *   │ queued │ ──────────► │ spawning │ ────────────► │ running │
 *   └────────┘             └──────────┘               └─────────┘
 *                                │                        │
 *                           onSpawnFail()            markDone() / markFailed()
 *                                │                        │
 *                                ▼                        ▼
 *                          ┌────────┐              ┌──────────┐
 *                          │ failed │              │done/failed│
 *                          └────────┘              └──────────┘
 *
 * Every mutation that frees a slot calls drain() automatically.
 */

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { execSync } = require('child_process');
const { applyModelGovernance } = require('./model-governance');

// ── Helpers ──────────────────────────────────────────────────────────────────

function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return typeof fallback === 'function' ? fallback() : JSON.parse(JSON.stringify(fallback)); }
}

/**
 * Write JSON atomically with flock to prevent concurrent write corruption.
 * Falls back to direct write if flock unavailable.
 */
function writeJson(file, data) {
  ensureDir(path.dirname(file));
  const tmp = file + '.tmp.' + process.pid;
  const json = JSON.stringify(data, null, 2);
  fs.writeFileSync(tmp, json);
  try {
    // Use flock for cross-process mutual exclusion
    execSync(`flock "${file}.lock" mv "${tmp}" "${file}"`, { timeout: 5000 });
  } catch {
    // Fallback: direct rename (still atomic on same filesystem)
    try { fs.renameSync(tmp, file); } catch { fs.writeFileSync(file, json); }
  }
}

function now() { return new Date().toISOString(); }
function uid() { return `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }

// ── Default configuration ────────────────────────────────────────────────────

const DEFAULTS = {
  maxSlots: 19,                    // 19 codex/gpt-5.4 lanes
  stateFile: null,                 // auto: <baseDir>/state/engine-state.json
  boardFile: null,                 // auto: <baseDir>/state/live-board.json
  historyMax: 500,                 // max finished tasks to keep in history
  spawnTimeoutMs: 120_000,         // 2 min: if spawning doesn't confirm → fail
  staleRunningMs: 30 * 60_000,    // 30 min: running task with no heartbeat → stale
};

// ── State shape ──────────────────────────────────────────────────────────────

function emptyState() {
  return {
    version: 2,
    updatedAt: null,
    maxSlots: DEFAULTS.maxSlots,
    // Maps keyed by taskId
    queued: {},      // taskId → TaskRecord  (FIFO order via insertedAt)
    spawning: {},    // taskId → TaskRecord
    running: {},     // taskId → TaskRecord
    finished: [],    // TaskRecord[] (most recent first, capped)
    eventLog: [],    // compact audit trail
  };
}

// ── TaskRecord ───────────────────────────────────────────────────────────────

function makeTask(input) {
  const taskId = input.taskId || uid();
  const governed = applyModelGovernance(input);
  return {
    taskId,
    title:       governed.title || '(untitled)',
    description: governed.description || '',
    source:      governed.source || 'manual',
    model:       governed.model || null,
    agentId:     governed.agentId || null,
    priority:    governed.priority || 'normal',   // 'critical' | 'high' | 'normal' | 'low'
    payload:     governed.payload || {},
    tags:        governed.tags || [],
    governance:  governed.governance || null,

    // lifecycle timestamps
    status:      'queued',
    createdAt:   governed.createdAt || now(),
    queuedAt:    now(),
    spawningAt:  null,
    runningAt:   null,
    finishedAt:  null,

    // dispatch bookkeeping
    dispatchAttempts: 0,
    lastDispatchAt: null,

    // session link
    sessionKey:  null,

    // result
    result:      null,
    error:       null,
    duration:    null,
  };
}

// ── Priority ordering ────────────────────────────────────────────────────────

const PRIO_ORDER = { critical: 0, high: 1, normal: 2, low: 3 };

function prioCmp(a, b) {
  const pa = PRIO_ORDER[a.priority] ?? 2;
  const pb = PRIO_ORDER[b.priority] ?? 2;
  if (pa !== pb) return pa - pb;
  // same priority → FIFO by queuedAt
  return (a.queuedAt || '').localeCompare(b.queuedAt || '');
}

// ── Engine ───────────────────────────────────────────────────────────────────

class DispatchEngine extends EventEmitter {
  /**
   * @param {object} opts
   * @param {string} opts.baseDir    — skill directory (default: __dirname)
   * @param {number} opts.maxSlots   — concurrent lanes (default: 19)
   * @param {string} opts.stateFile  — override state path
   * @param {string} opts.boardFile  — override board path
   * @param {number} opts.historyMax — max finished tasks kept
   * @param {Function} opts.onDispatch — called with (task) when a task should be spawned
   */
  constructor(opts = {}) {
    super();
    this.baseDir    = opts.baseDir || __dirname;
    this.maxSlots   = opts.maxSlots ?? DEFAULTS.maxSlots;
    this.stateFile  = opts.stateFile  || path.join(this.baseDir, 'state', 'engine-state.json');
    this.boardFile  = opts.boardFile  || path.join(this.baseDir, 'state', 'live-board.json');
    this.historyMax = opts.historyMax ?? DEFAULTS.historyMax;
    this.onDispatch = opts.onDispatch || null;   // external spawn callback

    // in-memory cache (loaded lazily)
    this._state = null;
  }

  // ── State I/O ────────────────────────────────────────────────────────────

  _load() {
    if (!this._state) {
      this._state = readJson(this.stateFile, emptyState);
      // migrations
      if (!this._state.version || this._state.version < 2) {
        const fresh = emptyState();
        Object.assign(fresh, this._state);
        fresh.version = 2;
        this._state = fresh;
      }
      this._state.maxSlots = this.maxSlots;
    }
    return this._state;
  }

  _save() {
    const s = this._load();
    s.updatedAt = now();
    // cap history
    if (s.finished.length > this.historyMax) {
      s.finished = s.finished.slice(0, this.historyMax);
    }
    // cap event log
    if (s.eventLog.length > 2000) {
      s.eventLog = s.eventLog.slice(-1000);
    }
    writeJson(this.stateFile, s);
    writeJson(this.boardFile, this.liveBoard());
    return s;
  }

  _log(type, data) {
    const s = this._load();
    s.eventLog.push({ ts: now(), type, ...data });
  }

  /** Force re-read from disk (useful between process invocations) */
  reload() { this._state = null; return this._load(); }

  // ── Slot accounting ──────────────────────────────────────────────────────

  /** Number of slots currently occupied (spawning + running) */
  busyCount() {
    const s = this._load();
    return Object.keys(s.spawning).length + Object.keys(s.running).length;
  }

  /** Number of free slots right now */
  freeSlots() {
    return Math.max(0, this.maxSlots - this.busyCount());
  }

  /** Number of tasks waiting in queue */
  queueDepth() {
    return Object.keys(this._load().queued).length;
  }

  // ── Enqueue (always triggers drain) ──────────────────────────────────────

  /**
   * Add a task. Immediately attempts to fill a free slot.
   * Returns the TaskRecord.
   */
  enqueue(input) {
    const s = this._load();
    const task = makeTask(input);
    s.queued[task.taskId] = task;
    this._log('enqueued', { taskId: task.taskId, title: task.title });
    this._save();

    // Axiom 2: enqueue === attempt dispatch
    this.drain();

    return task;
  }

  /**
   * Batch-enqueue multiple tasks, then drain once.
   * More efficient than N individual enqueue() calls.
   */
  enqueueBatch(inputs) {
    const s = this._load();
    const tasks = [];
    for (const input of inputs) {
      const task = makeTask(input);
      s.queued[task.taskId] = task;
      this._log('enqueued', { taskId: task.taskId, title: task.title });
      tasks.push(task);
    }
    this._save();
    this.drain();
    return tasks;
  }

  // ── Drain: fill every free slot from queue ───────────────────────────────

  /**
   * Core scheduling loop. Pops highest-priority queued tasks into free slots.
   * Called automatically after every state mutation that frees a slot.
   * Returns array of tasks that were dispatched this cycle.
   */
  drain() {
    const s = this._load();
    const dispatched = [];

    while (true) {
      const free = this.maxSlots - (Object.keys(s.spawning).length + Object.keys(s.running).length);
      if (free <= 0) break;

      // pick highest-priority queued task
      const candidates = Object.values(s.queued).sort(prioCmp);
      if (candidates.length === 0) break;

      const task = candidates[0];
      delete s.queued[task.taskId];

      task.status = 'spawning';
      task.spawningAt = now();
      task.lastDispatchAt = task.spawningAt;
      task.dispatchAttempts = (task.dispatchAttempts || 0) + 1;
      s.spawning[task.taskId] = task;

      this._log('dispatched', {
        taskId: task.taskId,
        title: task.title,
        slotsAfter: free - 1,
        dispatchAttempts: task.dispatchAttempts,
      });
      dispatched.push(task);
    }

    if (dispatched.length > 0) {
      this._save();
      this.emit('dispatched', dispatched);

      // Fire external spawn callback for each task
      if (this.onDispatch) {
        for (const task of dispatched) {
          try {
            this.onDispatch(task, this);
          } catch (e) {
            // spawn callback failed → mark as failed, which triggers backfill
            this.markFailed(task.taskId, { error: `onDispatch error: ${e.message}` });
          }
        }
      }
    }

    return dispatched;
  }

  // ── Lifecycle transitions ────────────────────────────────────────────────

  /**
   * Confirm a spawning task is now actively running.
   * Call this when sessions_spawn returns success.
   */
  markRunning(taskId, patch = {}) {
    const s = this._load();
    const task = s.spawning[taskId];
    if (!task) {
      // maybe already running (idempotent)
      if (s.running[taskId]) return s.running[taskId];
      throw new Error(`Task ${taskId} not in spawning state`);
    }

    delete s.spawning[taskId];
    task.status = 'running';
    task.runningAt = now();
    Object.assign(task, patch);
    s.running[taskId] = task;

    this._log('running', { taskId });
    this._save();
    this.emit('running', task);
    return task;
  }

  /**
   * Mark task as successfully completed. Frees slot → auto-backfill.
   */
  markDone(taskId, patch = {}) {
    return this._finish(taskId, 'done', patch);
  }

  /**
   * Mark task as failed. Frees slot → auto-backfill.
   */
  markFailed(taskId, patch = {}) {
    return this._finish(taskId, 'failed', patch);
  }

  /**
   * Cancel a task (queued, spawning, or running). Frees slot → auto-backfill.
   */
  cancel(taskId) {
    return this._finish(taskId, 'cancelled', {});
  }

  _finish(taskId, status, patch) {
    const s = this._load();

    // Find task in any active map
    let task = s.running[taskId] || s.spawning[taskId] || s.queued[taskId];
    if (!task) throw new Error(`Task ${taskId} not found`);

    const from = task.status;
    delete s.queued[taskId];
    delete s.spawning[taskId];
    delete s.running[taskId];

    task.status = status;
    task.finishedAt = now();
    Object.assign(task, patch);

    // compute duration if we have start time
    const startTime = task.runningAt || task.spawningAt || task.queuedAt;
    if (startTime) {
      const ms = new Date(task.finishedAt) - new Date(startTime);
      task.duration = formatDuration(ms);
    }

    s.finished.unshift(task);
    this._log('finished', { taskId, from, to: status });
    this._save();
    this.emit('finished', task);

    // Axiom 4: slot freed → immediate backfill
    this.drain();

    return task;
  }

  // ── Heartbeat / progress update ──────────────────────────────────────────

  /**
   * Update a running task's metadata without changing its status.
   * Useful for progress heartbeats from subagents.
   */
  heartbeat(taskId, patch = {}) {
    const s = this._load();
    const task = s.running[taskId] || s.spawning[taskId];
    if (!task) return null;
    Object.assign(task, patch, { lastHeartbeat: now() });
    this._save();
    return task;
  }

  // ── Stale task recovery ──────────────────────────────────────────────────

  /**
   * Find tasks stuck in spawning/running without heartbeat for too long.
   * Returns them but does NOT auto-fail (caller decides).
   */
  detectStale(opts = {}) {
    const s = this._load();
    const spawnTimeout = opts.spawnTimeoutMs ?? DEFAULTS.spawnTimeoutMs;
    const runTimeout   = opts.staleRunningMs ?? DEFAULTS.staleRunningMs;
    const cutoff = Date.now();
    const stale = [];

    for (const task of Object.values(s.spawning)) {
      if (cutoff - new Date(task.spawningAt).getTime() > spawnTimeout) {
        stale.push({ ...task, reason: 'spawn_timeout' });
      }
    }

    for (const task of Object.values(s.running)) {
      const lastPing = task.lastHeartbeat || task.runningAt;
      if (lastPing && cutoff - new Date(lastPing).getTime() > runTimeout) {
        stale.push({ ...task, reason: 'no_heartbeat' });
      }
    }

    return stale;
  }

  /**
   * Reap stale tasks: mark them failed, which triggers backfill.
   * Returns reaped tasks.
   */
  reapStale(opts = {}) {
    const stale = this.detectStale(opts);
    const reaped = [];
    for (const info of stale) {
      try {
        this.markFailed(info.taskId, { error: `auto-reaped: ${info.reason}` });
        reaped.push(info);
      } catch { /* already finished */ }
    }
    return reaped;
  }

  // ── Live board (read-only snapshot) ──────────────────────────────────────

  /**
   * Build a structured snapshot of current state.
   * This is what the reporting skill reads.
   */
  liveBoard() {
    const s = this._load();
    const spawning = Object.values(s.spawning);
    const running  = Object.values(s.running);
    const queued   = Object.values(s.queued).sort(prioCmp);
    const active   = [...spawning, ...running];

    return {
      updatedAt: now(),
      maxSlots:  this.maxSlots,
      summary: {
        maxSlots:      this.maxSlots,
        busySlots:     active.length,
        freeSlots:     Math.max(0, this.maxSlots - active.length),
        spawningCount: spawning.length,
        runningCount:  running.length,
        queueDepth:    queued.length,
        finishedCount: s.finished.length,
        utilisation:   active.length > 0
          ? ((active.length / this.maxSlots) * 100).toFixed(1) + '%'
          : '0.0%',
      },
      spawning: spawning.map(briefTask),
      running:  running.map(briefTask),
      queued:   queued.map(briefTask),
      recentFinished: s.finished.slice(0, 20).map(briefTask),
    };
  }

  /**
   * Flat list of all active tasks (for reporting skill compatibility).
   */
  activeTasks() {
    const s = this._load();
    return [
      ...Object.values(s.spawning).map(t => ({ ...t, status: 'spawning' })),
      ...Object.values(s.running).map(t => ({ ...t, status: 'running' })),
    ];
  }

  /**
   * Full task list for reporting (active + recent finished + queued).
   */
  allTasks() {
    const s = this._load();
    return [
      ...Object.values(s.running),
      ...Object.values(s.spawning),
      ...Object.values(s.queued),
      ...s.finished.slice(0, 50),
    ];
  }

  // ── Bulk operations ──────────────────────────────────────────────────────

  /** Cancel all queued tasks (does not touch running). */
  clearQueue() {
    const s = this._load();
    const count = Object.keys(s.queued).length;
    s.queued = {};
    this._log('queue_cleared', { count });
    this._save();
    return count;
  }

  /** Full reset: cancel everything, empty state. */
  reset() {
    this._state = emptyState();
    this._state.maxSlots = this.maxSlots;
    this._save();
    return true;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function briefTask(t) {
  return {
    taskId:    t.taskId,
    title:     t.title,
    status:    t.status,
    priority:  t.priority,
    model:     t.model,
    agentId:   t.agentId,
    source:    t.source,
    queuedAt:  t.queuedAt,
    runningAt: t.runningAt,
    duration:  t.duration,
    error:     t.error,
    sessionKey: t.sessionKey,
  };
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  if (mins < 60) return `${mins}m ${remSecs}s`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hours}h ${remMins}m`;
}

// ── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  DispatchEngine,
  makeTask,
  formatDuration,
  DEFAULTS,
  PRIO_ORDER,
};
