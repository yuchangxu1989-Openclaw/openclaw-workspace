#!/usr/bin/env node
'use strict';

/**
 * dispatch-bridge.js
 * ──────────────────
 * Bridge between DispatchEngine and the agent's sessions_spawn.
 *
 * This file clarifies the "onDispatch is null" P0:
 * DispatchEngine is a **coordination layer** (state machine + slot accounting).
 * Actual spawning is done by the main agent via sessions_spawn tool calls.
 *
 * The bridge provides:
 *   1. A concrete onDispatch that logs dispatch-ready tasks to a pickup file
 *   2. A `pending-dispatches.json` file the agent reads during prompt
 *   3. Delivery metadata so the real card/report chain can correlate dispatch → spawn → finish
 *
 * Usage in agent prompt / runtime:
 *   - Engine calls onDispatch(task) → writes to pending-dispatches.json
 *   - Agent / runner reads pending-dispatches.json at each tick
 *   - Agent / runner calls sessions_spawn for each pending task
 *   - Agent / runner calls markSpawned(taskId, { sessionKey, ... }) after spawn success
 *   - On subagent completion, agent / runner calls markDelivered(taskId, { ... }) or markDeliveryFailed(taskId, { ... })
 */

const fs = require('fs');
const path = require('path');
const { chooseGovernedModel } = require('./model-governance');

const PENDING_FILE = path.join(__dirname, 'state', 'pending-dispatches.json');

function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }

function isoNow() { return new Date().toISOString(); }

function defaultState() {
  return {
    version: 2,
    tasks: [],
    updatedAt: null,
  };
}

function normalizePending(data) {
  const base = data && typeof data === 'object' ? data : defaultState();
  return {
    version: base.version || 2,
    tasks: Array.isArray(base.tasks) ? base.tasks : [],
    updatedAt: base.updatedAt || null,
  };
}

function readPending() {
  try {
    return normalizePending(JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8')));
  } catch {
    return defaultState();
  }
}

function writePending(data) {
  ensureDir(path.dirname(PENDING_FILE));
  const next = normalizePending(data);
  next.updatedAt = isoNow();
  fs.writeFileSync(PENDING_FILE, JSON.stringify(next, null, 2));
  return next;
}

function buildDispatchDecision(task) {
  const governance = task.governance || null;
  return governance ? {
    requestedModel: governance.requestedModel,
    finalModel: governance.finalModel || task.model,
    changed: governance.changed,
    reason: governance.reason,
    evaluation: governance.opus || governance.evaluation || null,
  } : chooseGovernedModel(task);
}

function toPendingRecord(task) {
  const decision = buildDispatchDecision(task);
  const governedTask = {
    ...task,
    model: decision.finalModel,
    governance: task.governance || {
      requestedModel: decision.requestedModel,
      finalModel: decision.finalModel,
      changed: decision.changed,
      reason: decision.reason,
      evaluation: decision.evaluation,
    },
  };

  return {
    taskId: governedTask.taskId,
    title: governedTask.title,
    model: governedTask.model,
    requestedModel: decision.requestedModel,
    agentId: governedTask.agentId,
    priority: governedTask.priority,
    payload: governedTask.payload,
    payloadForSpawn: {
      ...governedTask.payload,
      governance: governedTask.governance,
    },
    governance: governedTask.governance,
    status: governedTask.status,
    dispatchAttempts: governedTask.dispatchAttempts || 0,
    createdAt: governedTask.createdAt || null,
    queuedAt: governedTask.queuedAt || null,
    spawningAt: governedTask.spawningAt || null,
    runningAt: governedTask.runningAt || null,
    dispatchedAt: isoNow(),
    delivery: {
      state: 'pending',
      pendingAt: isoNow(),
      ackedAt: null,
      spawnedAt: null,
      deliveredAt: null,
      failedAt: null,
      sessionKey: null,
      worker: null,
      message: null,
      error: null,
      attempts: 0,
      history: [
        { ts: isoNow(), state: 'pending', source: 'onDispatchBridge' }
      ],
    },
  };
}

function appendHistory(record, entry) {
  const history = Array.isArray(record.delivery?.history) ? record.delivery.history : [];
  history.push(entry);
  if (!record.delivery) record.delivery = {};
  record.delivery.history = history.slice(-20);
}

function updateTask(taskId, mutator) {
  const pending = readPending();
  const record = pending.tasks.find(t => t.taskId === taskId);
  if (!record) return null;
  mutator(record);
  writePending(pending);
  return record;
}

function onDispatchBridge(task, engine = null) {
  const pending = readPending();
  const existing = pending.tasks.find(t => t.taskId === task.taskId);

  if (!existing) {
    pending.tasks.push(toPendingRecord(task));
  } else {
    existing.title = task.title;
    existing.model = task.model || existing.model;
    existing.agentId = task.agentId || existing.agentId;
    existing.priority = task.priority || existing.priority;
    existing.payload = task.payload || existing.payload;
    existing.status = task.status || existing.status;
    existing.dispatchAttempts = task.dispatchAttempts || existing.dispatchAttempts || 0;
    existing.spawningAt = task.spawningAt || existing.spawningAt || null;
    existing.runningAt = task.runningAt || existing.runningAt || null;
    if (!existing.delivery) existing.delivery = { state: 'pending', history: [] };
    existing.delivery.state = existing.delivery.state === 'delivered' ? 'delivered' : 'pending';
    existing.delivery.pendingAt = isoNow();
    existing.delivery.error = null;
    appendHistory(existing, { ts: isoNow(), state: 'pending', source: 'onDispatchBridge:refresh' });
  }

  writePending(pending);

  if (engine && typeof engine.liveBoard === 'function') {
    try {
      const board = engine.liveBoard();
      const active = board.summary.busySlots;
      const queued = board.summary.queueDepth;
      if (queued > 0 && board.summary.freeSlots > 0) {
        engine.drain();
      }
      return { pending: pending.tasks.length, active, queued };
    } catch {
      return { pending: pending.tasks.length };
    }
  }

  return { pending: pending.tasks.length };
}

function getPendingTasks() {
  return readPending().tasks;
}

function ackTask(taskId, meta = {}) {
  return updateTask(taskId, (record) => {
    if (!record.delivery) record.delivery = { history: [] };
    record.delivery.state = 'acked';
    record.delivery.ackedAt = meta.ackedAt || isoNow();
    record.delivery.worker = meta.worker || record.delivery.worker || null;
    record.delivery.attempts = (record.delivery.attempts || 0) + 1;
    record.status = meta.status || record.status || 'spawning';
    appendHistory(record, {
      ts: record.delivery.ackedAt,
      state: 'acked',
      source: meta.source || 'ackTask',
      worker: record.delivery.worker || undefined,
    });
  });
}

function markSpawned(taskId, meta = {}) {
  return updateTask(taskId, (record) => {
    if (!record.delivery) record.delivery = { history: [] };
    record.delivery.state = 'spawned';
    record.delivery.spawnedAt = meta.spawnedAt || isoNow();
    record.delivery.sessionKey = meta.sessionKey || record.delivery.sessionKey || null;
    record.delivery.worker = meta.worker || record.delivery.worker || null;
    record.delivery.message = meta.message || record.delivery.message || null;
    record.delivery.error = null;
    record.status = meta.status || 'running';
    appendHistory(record, {
      ts: record.delivery.spawnedAt,
      state: 'spawned',
      source: meta.source || 'markSpawned',
      sessionKey: record.delivery.sessionKey || undefined,
    });
  });
}

function markDelivered(taskId, meta = {}) {
  return updateTask(taskId, (record) => {
    if (!record.delivery) record.delivery = { history: [] };
    record.delivery.state = 'delivered';
    record.delivery.deliveredAt = meta.deliveredAt || isoNow();
    record.delivery.sessionKey = meta.sessionKey || record.delivery.sessionKey || null;
    record.delivery.message = meta.message || record.delivery.message || null;
    record.delivery.worker = meta.worker || record.delivery.worker || null;
    record.delivery.error = null;
    record.status = meta.status || record.status || 'running';
    appendHistory(record, {
      ts: record.delivery.deliveredAt,
      state: 'delivered',
      source: meta.source || 'markDelivered',
      sessionKey: record.delivery.sessionKey || undefined,
      message: record.delivery.message || undefined,
    });
  });
}

function markDeliveryFailed(taskId, meta = {}) {
  return updateTask(taskId, (record) => {
    if (!record.delivery) record.delivery = { history: [] };
    record.delivery.state = 'failed';
    record.delivery.failedAt = meta.failedAt || isoNow();
    record.delivery.error = meta.error || 'delivery failed';
    record.delivery.worker = meta.worker || record.delivery.worker || null;
    record.status = meta.status || record.status || 'failed';
    appendHistory(record, {
      ts: record.delivery.failedAt,
      state: 'failed',
      source: meta.source || 'markDeliveryFailed',
      error: record.delivery.error,
    });
  });
}

function clearPending() {
  writePending({ version: 2, tasks: [] });
}

if (require.main === module) {
  const [cmd, arg1, arg2] = process.argv.slice(2);
  const meta = arg2 ? JSON.parse(arg2) : {};

  switch (cmd) {
    case 'list':
      console.log(JSON.stringify(getPendingTasks(), null, 2));
      break;
    case 'ack':
      if (!arg1) { console.error('Usage: dispatch-bridge.js ack <taskId> [jsonMeta]'); process.exit(1); }
      console.log(JSON.stringify(ackTask(arg1, meta), null, 2));
      break;
    case 'spawned':
      if (!arg1) { console.error('Usage: dispatch-bridge.js spawned <taskId> [jsonMeta]'); process.exit(1); }
      console.log(JSON.stringify(markSpawned(arg1, meta), null, 2));
      break;
    case 'delivered':
      if (!arg1) { console.error('Usage: dispatch-bridge.js delivered <taskId> [jsonMeta]'); process.exit(1); }
      console.log(JSON.stringify(markDelivered(arg1, meta), null, 2));
      break;
    case 'failed':
      if (!arg1) { console.error('Usage: dispatch-bridge.js failed <taskId> [jsonMeta]'); process.exit(1); }
      console.log(JSON.stringify(markDeliveryFailed(arg1, meta), null, 2));
      break;
    case 'clear':
      clearPending();
      console.log('Pending dispatches cleared');
      break;
    default:
      console.log('Usage: dispatch-bridge.js [list|ack <taskId> [jsonMeta]|spawned <taskId> [jsonMeta]|delivered <taskId> [jsonMeta]|failed <taskId> [jsonMeta]|clear]');
  }
}

module.exports = {
  onDispatchBridge,
  getPendingTasks,
  ackTask,
  markSpawned,
  markDelivered,
  markDeliveryFailed,
  clearPending,
  readPending,
  writePending,
  PENDING_FILE,
};
