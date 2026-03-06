'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_STATE = {
  version: 1,
  updatedAt: null,
  slots: {},
  queue: [],
  running: [],
  history: []
};

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function writeJson(file, data) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function nowIso() {
  return new Date().toISOString();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

class DispatchLayer {
  constructor(options = {}) {
    this.baseDir = options.baseDir || __dirname;
    this.stateFile = options.stateFile || path.join(this.baseDir, 'state', 'dispatch-layer-state.json');
    this.progressFile = options.progressFile || path.join(this.baseDir, 'state', 'dispatch-progress-board.json');
    this.defaultSlotCount = Number.isInteger(options.defaultSlotCount) && options.defaultSlotCount > 0
      ? options.defaultSlotCount
      : 2;
    this.defaultSlotPrefix = options.defaultSlotPrefix || 'slot';
  }

  load() {
    const state = readJson(this.stateFile, clone(DEFAULT_STATE));
    if (!state.version) state.version = 1;
    if (!state.slots || typeof state.slots !== 'object') state.slots = {};
    if (!Array.isArray(state.queue)) state.queue = [];
    if (!Array.isArray(state.running)) state.running = [];
    if (!Array.isArray(state.history)) state.history = [];
    return state;
  }

  save(state) {
    state.updatedAt = nowIso();
    writeJson(this.stateFile, state);
    writeJson(this.progressFile, this.buildProgressBoard(state));
    return state;
  }

  ensureSlots(state, slotCount = this.defaultSlotCount) {
    for (let i = 1; i <= slotCount; i++) {
      const slotId = `${this.defaultSlotPrefix}-${i}`;
      if (!state.slots[slotId]) {
        state.slots[slotId] = {
          slotId,
          status: 'idle',
          taskId: null,
          assignedAt: null,
          lastEventAt: null
        };
      }
    }
    return state;
  }

  detectIdleSlots(state) {
    return Object.values(state.slots).filter(slot => slot.status !== 'running' || !slot.taskId);
  }

  enqueue(task, options = {}) {
    const state = this.ensureSlots(this.load(), options.slotCount);
    const taskId = task.taskId || `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const record = {
      taskId,
      title: task.title || task.action || task.type || 'untitled-task',
      source: task.source || 'manual',
      payload: task.payload || {},
      priority: task.priority || 'normal',
      status: 'queued',
      createdAt: task.createdAt || nowIso(),
      queuedAt: nowIso(),
      assignedSlotId: null,
      startedAt: null,
      finishedAt: null,
      result: null,
      error: null
    };

    state.queue.push(record);
    state.history.push({ ts: nowIso(), type: 'enqueued', taskId, title: record.title });
    this.save(state);
    return record;
  }

  dispatchNext(options = {}) {
    const state = this.ensureSlots(this.load(), options.slotCount);
    const idleSlots = this.detectIdleSlots(state);
    const dispatched = [];

    while (idleSlots.length > 0 && state.queue.length > 0) {
      const slot = idleSlots.shift();
      const task = state.queue.shift();
      task.status = 'running';
      task.assignedSlotId = slot.slotId;
      task.startedAt = nowIso();
      slot.status = 'running';
      slot.taskId = task.taskId;
      slot.assignedAt = task.startedAt;
      slot.lastEventAt = task.startedAt;
      state.running.push(task);
      state.history.push({ ts: nowIso(), type: 'dispatched', taskId: task.taskId, slotId: slot.slotId });
      dispatched.push({ slotId: slot.slotId, taskId: task.taskId, title: task.title });
    }

    this.save(state);
    return { dispatched, idleSlotsAfter: this.detectIdleSlots(state).map(s => s.slotId) };
  }

  markTask(taskId, nextStatus, patch = {}, options = {}) {
    const state = this.ensureSlots(this.load(), options.slotCount);
    const task = state.running.find(item => item.taskId === taskId)
      || state.queue.find(item => item.taskId === taskId);

    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const prevStatus = task.status;
    task.status = nextStatus;
    Object.assign(task, patch);

    if (nextStatus === 'running' && !task.startedAt) {
      task.startedAt = nowIso();
    }

    if (['done', 'failed', 'cancelled'].includes(nextStatus)) {
      task.finishedAt = task.finishedAt || nowIso();
      const runningIndex = state.running.findIndex(item => item.taskId === taskId);
      if (runningIndex >= 0) state.running.splice(runningIndex, 1);

      if (task.assignedSlotId && state.slots[task.assignedSlotId]) {
        state.slots[task.assignedSlotId] = {
          ...state.slots[task.assignedSlotId],
          status: 'idle',
          taskId: null,
          assignedAt: null,
          lastEventAt: nowIso()
        };
      }
    }

    state.history.push({ ts: nowIso(), type: 'status_changed', taskId, from: prevStatus, to: nextStatus });
    this.save(state);
    return task;
  }

  tick(options = {}) {
    const state = this.ensureSlots(this.load(), options.slotCount);
    this.save(state);
    return {
      idleSlots: this.detectIdleSlots(state).map(slot => slot.slotId),
      queueDepth: state.queue.length,
      runningCount: state.running.length,
      progressBoard: this.buildProgressBoard(state),
      dispatched: this.dispatchNext(options).dispatched
    };
  }

  buildProgressBoard(state) {
    return {
      updatedAt: state.updatedAt || nowIso(),
      principle: '先发任务、空槽即补位、只汇报进行中',
      summary: {
        slotCount: Object.keys(state.slots).length,
        idleSlotCount: this.detectIdleSlots(state).length,
        queueDepth: state.queue.length,
        runningCount: state.running.length
      },
      running: state.running.map(task => ({
        taskId: task.taskId,
        title: task.title,
        slotId: task.assignedSlotId,
        status: task.status,
        startedAt: task.startedAt,
        priority: task.priority,
        source: task.source
      }))
    };
  }
}

module.exports = { DispatchLayer, DEFAULT_STATE };
