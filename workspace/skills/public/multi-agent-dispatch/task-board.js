'use strict';

/**
 * task-board.js — Persistent Task Board with history tracking and query API.
 * 
 * Provides structured task registration, history archival, batch tracking,
 * and auto-summary triggers on top of the DispatchEngine state.
 */

const fs = require('fs');
const path = require('path');

function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }
function now() { return new Date().toISOString(); }
function uid(prefix = 'b') { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }

function readJson(file, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return typeof fallback === 'function' ? fallback() : JSON.parse(JSON.stringify(fallback)); }
}

function writeJson(file, data) {
  ensureDir(path.dirname(file));
  const tmp = file + '.tmp.' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  try { fs.renameSync(tmp, file); } catch { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }
}

function emptyBoard() {
  return {
    version: 1,
    boardId: uid('board'),
    createdAt: now(),
    updatedAt: null,
    summary: {
      maxSlots: 19,
      occupied: 0,
      free: 19,
      queued: 0,
      totalRegistered: 0,
      totalCompleted: 0,
      totalFailed: 0,
      totalCancelled: 0,
    },
    active: [],
    queued: [],
    history: [],
    batches: {},
    autoSummaries: [],
  };
}

class TaskBoard {
  /**
   * @param {object} opts
   * @param {string} opts.boardFile - Path to task-board.json
   * @param {string} opts.summaryDir - Path to summaries directory
   * @param {number} opts.historyMax - Max history entries (default 1000)
   * @param {number} opts.summaryThreshold - Auto-summary every N completions (default 5)
   * @param {number} opts.summaryIntervalMs - Min interval between auto-summaries (default 30min)
   * @param {number} opts.maxSummaries - Max auto-summaries kept (default 50)
   */
  constructor(opts = {}) {
    this.boardFile = opts.boardFile || path.join(__dirname, 'state', 'task-board.json');
    this.summaryDir = opts.summaryDir || path.join(__dirname, 'state', 'summaries');
    this.historyMax = opts.historyMax || 1000;
    this.summaryThreshold = opts.summaryThreshold || 5;
    this.summaryIntervalMs = opts.summaryIntervalMs || 30 * 60 * 1000;
    this.maxSummaries = opts.maxSummaries || 50;
    this._completionsSinceLastSummary = 0;
    this._board = null;
  }

  _load() {
    if (!this._board) {
      this._board = readJson(this.boardFile, emptyBoard);
      if (!this._board.version) this._board = emptyBoard();
    }
    return this._board;
  }

  _save() {
    const b = this._load();
    b.updatedAt = now();
    if (b.history.length > this.historyMax) {
      b.history = b.history.slice(0, this.historyMax);
    }
    if (b.autoSummaries.length > this.maxSummaries) {
      b.autoSummaries = b.autoSummaries.slice(0, this.maxSummaries);
    }
    writeJson(this.boardFile, b);
  }

  reload() { this._board = null; return this._load(); }

  // ── Sync from DispatchEngine state ────────────────────────────────────────

  /**
   * Sync board from engine state. Call after any engine state change.
   * @param {object} engineState - The engine's internal state { queued, spawning, running, finished }
   * @param {number} maxSlots
   */
  syncFromEngine(engineState, maxSlots = 19) {
    const b = this._load();
    const spawning = Object.values(engineState.spawning || {});
    const running = Object.values(engineState.running || {});
    const queued = Object.values(engineState.queued || {});

    b.active = [...spawning, ...running].map(briefRecord);
    b.queued = queued.map(briefRecord);

    b.summary.maxSlots = maxSlots;
    b.summary.occupied = b.active.length;
    b.summary.free = Math.max(0, maxSlots - b.active.length);
    b.summary.queued = b.queued.length;

    this._save();
    return b;
  }

  // ── Task registration ─────────────────────────────────────────────────────

  /**
   * Register a task on the board (called on enqueue).
   */
  registerTask(task) {
    const b = this._load();
    b.summary.totalRegistered += 1;
    this._save();
  }

  /**
   * Record task completion in history.
   * Returns auto-summary if triggered, null otherwise.
   */
  recordCompletion(task) {
    const b = this._load();
    const record = briefRecord(task);
    record.completedAt = task.finishedAt || now();

    // Deduplicate: remove existing entry for same taskId
    b.history = b.history.filter(h => h.taskId !== task.taskId);
    b.history.unshift(record);

    // Update summary counts
    if (task.status === 'done') b.summary.totalCompleted += 1;
    else if (task.status === 'failed') b.summary.totalFailed += 1;
    else if (task.status === 'cancelled') b.summary.totalCancelled += 1;

    // Update batch if applicable
    if (task.batchId && b.batches[task.batchId]) {
      const batch = b.batches[task.batchId];
      batch.completedCount = (batch.completedCount || 0) + 1;
      if (batch.completedCount >= batch.totalCount) {
        batch.status = 'completed';
        batch.completedAt = now();
      }
    }

    this._save();

    // Check auto-summary trigger
    this._completionsSinceLastSummary += 1;
    return this._checkAutoSummary();
  }

  // ── Batch management ──────────────────────────────────────────────────────

  /**
   * Create a new batch for a group of tasks.
   */
  createBatch(label, taskIds) {
    const b = this._load();
    const batchId = uid('batch');
    b.batches[batchId] = {
      batchId,
      label,
      createdAt: now(),
      taskIds: taskIds || [],
      status: 'in_progress',
      completedCount: 0,
      totalCount: (taskIds || []).length,
    };
    this._save();
    return batchId;
  }

  addToBatch(batchId, taskId) {
    const b = this._load();
    if (!b.batches[batchId]) return;
    if (!b.batches[batchId].taskIds.includes(taskId)) {
      b.batches[batchId].taskIds.push(taskId);
      b.batches[batchId].totalCount = b.batches[batchId].taskIds.length;
    }
    this._save();
  }

  // ── History query ─────────────────────────────────────────────────────────

  /**
   * Query history with filters.
   * @param {object} opts
   * @param {string} opts.status - Filter by status
   * @param {string} opts.since - ISO timestamp, return tasks completed after this
   * @param {string} opts.until - ISO timestamp, return tasks completed before this
   * @param {string} opts.search - Search in title/description
   * @param {string} opts.batchId - Filter by batch
   * @param {number} opts.limit - Max results (default 50)
   */
  queryHistory(opts = {}) {
    const b = this._load();
    let results = [...b.history];

    if (opts.status) {
      const s = opts.status.toLowerCase();
      results = results.filter(t => (t.status || '').toLowerCase() === s);
    }
    if (opts.since) {
      const since = new Date(opts.since).getTime();
      results = results.filter(t => {
        const ts = new Date(t.completedAt || t.finishedAt || 0).getTime();
        return ts >= since;
      });
    }
    if (opts.until) {
      const until = new Date(opts.until).getTime();
      results = results.filter(t => {
        const ts = new Date(t.completedAt || t.finishedAt || 0).getTime();
        return ts <= until;
      });
    }
    if (opts.search) {
      const q = opts.search.toLowerCase();
      results = results.filter(t =>
        (t.title || '').toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q)
      );
    }
    if (opts.batchId) {
      const batch = b.batches[opts.batchId];
      if (batch) {
        const ids = new Set(batch.taskIds);
        results = results.filter(t => ids.has(t.taskId));
      }
    }

    const limit = opts.limit || 50;
    return results.slice(0, limit);
  }

  /**
   * Get current board snapshot (for reporting).
   */
  getBoard() {
    return this._load();
  }

  /**
   * Get all batches with status.
   */
  getBatches() {
    return this._load().batches;
  }

  /**
   * Get summaries.
   */
  getSummaries(limit = 10) {
    return this._load().autoSummaries.slice(0, limit);
  }

  // ── Auto-summary ─────────────────────────────────────────────────────────

  _checkAutoSummary() {
    if (this._completionsSinceLastSummary < this.summaryThreshold) return null;

    const b = this._load();
    const lastSummary = b.autoSummaries[0];
    if (lastSummary) {
      const elapsed = Date.now() - new Date(lastSummary.triggeredAt).getTime();
      if (elapsed < this.summaryIntervalMs) return null;
    }

    return this.generateSummary('threshold_reached');
  }

  /**
   * Generate and store an auto-summary.
   * @param {string} trigger - What triggered: threshold_reached | batch_complete | manual
   */
  generateSummary(trigger = 'manual') {
    const b = this._load();
    const lastSummary = b.autoSummaries[0];
    const since = lastSummary ? lastSummary.triggeredAt : b.createdAt;

    // Recent completions since last summary
    const recentHistory = this.queryHistory({ since, limit: 100 });
    const doneCount = recentHistory.filter(t => t.status === 'done').length;
    const failedCount = recentHistory.filter(t => t.status === 'failed').length;

    const summary = {
      summaryId: uid('sum'),
      triggeredAt: now(),
      trigger,
      sinceLast: since,
      stats: {
        totalRegistered: b.summary.totalRegistered,
        totalCompleted: b.summary.totalCompleted,
        totalFailed: b.summary.totalFailed,
        currentActive: b.active.length,
        currentQueued: b.queued.length,
        recentDone: doneCount,
        recentFailed: failedCount,
      },
      recentCompletions: recentHistory.slice(0, 20).map(t => ({
        taskId: t.taskId,
        title: t.title,
        status: t.status,
        completedAt: t.completedAt,
        duration: t.duration,
      })),
    };

    b.autoSummaries.unshift(summary);
    this._completionsSinceLastSummary = 0;
    this._save();

    // Also write to summaries dir
    const summaryFile = path.join(this.summaryDir, `${summary.summaryId}.json`);
    writeJson(summaryFile, summary);

    return summary;
  }

  /**
   * Reset board (for testing).
   */
  reset() {
    this._board = emptyBoard();
    this._completionsSinceLastSummary = 0;
    this._save();
  }
}

function briefRecord(t) {
  return {
    taskId: t.taskId,
    title: t.title || t.task || '(untitled)',
    description: t.description || '',
    status: t.status,
    priority: t.priority,
    model: t.model,
    agentId: t.agentId,
    source: t.source,
    batchId: t.batchId || null,
    createdAt: t.createdAt,
    queuedAt: t.queuedAt,
    runningAt: t.runningAt,
    finishedAt: t.finishedAt,
    completedAt: t.finishedAt,
    duration: t.duration,
    error: t.error,
    result: typeof t.result === 'string' ? t.result.slice(0, 500) : null,
    sessionKey: t.sessionKey,
  };
}

module.exports = { TaskBoard, emptyBoard, briefRecord };
