#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { DispatchEngine } = require('./dispatch-engine');
const { onDispatchBridge, ackTask, markSpawned, markDelivered, markDeliveryFailed, getPendingTasks, PENDING_FILE } = require('./dispatch-bridge');

const DEFAULTS = {
  maxDispatchPerTick: 19,
  republishSpawningMs: 5_000,
};

function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }

function resolveStateDir(baseDir) {
  return path.join(baseDir, 'state');
}

function runnerStateFile(baseDir) {
  return path.join(resolveStateDir(baseDir), 'runner-state.json');
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return typeof fallback === 'function' ? fallback() : fallback; }
}

function writeJson(file, data) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function readRunnerState(baseDir) {
  return readJson(runnerStateFile(baseDir), () => ({
    version: 1,
    updatedAt: null,
    dispatchedTaskIds: {},
    lastTickAt: null,
  }));
}

function writeRunnerState(baseDir, state) {
  state.updatedAt = new Date().toISOString();
  writeJson(runnerStateFile(baseDir), state);
}

function buildSpawnPayload(task) {
  const payload = task.payload || {};
  return {
    agentId: payload.agentId || task.agentId || 'coder',
    mode: payload.mode || 'run',
    runtime: payload.runtime || 'subagent',
    cleanup: payload.cleanup || 'delete',
    label: payload.label || task.title || task.taskId,
    cwd: payload.cwd,
    timeoutSeconds: payload.timeoutSeconds,
    runTimeoutSeconds: payload.runTimeoutSeconds,
    model: payload.model || task.model,
    task: payload.task || task.description || task.title,
  };
}

async function spawnOne(task, engine) {
  if (typeof globalThis.sessions_spawn !== 'function') {
    throw new Error('sessions_spawn not available in current runtime');
  }

  ackTask(task.taskId, { source: 'dispatch-runner', worker: 'dispatch-runner' });

  const payload = buildSpawnPayload(task);
  const result = await globalThis.sessions_spawn(payload);

  const sessionKey = result?.sessionKey || result?.session?.sessionKey || result?.id || null;
  engine.markRunning(task.taskId, { sessionKey, spawnPayload: payload, spawnResult: result });
  markSpawned(task.taskId, {
    source: 'dispatch-runner',
    worker: 'dispatch-runner',
    sessionKey,
    message: 'sessions_spawn success',
  });
  markDelivered(task.taskId, {
    source: 'dispatch-runner',
    worker: 'dispatch-runner',
    sessionKey,
    message: 'task handed to subagent runtime',
    status: 'running',
  });
  return { taskId: task.taskId, sessionKey, payload, result };
}

function republishStrandedSpawning(engine, opts = {}) {
  const thresholdMs = opts.republishSpawningMs ?? DEFAULTS.republishSpawningMs;
  const nowMs = Date.now();
  const state = engine._load();
  let republished = 0;

  for (const task of Object.values(state.spawning)) {
    const lastDispatchAt = task.lastDispatchAt || task.spawningAt;
    if (!lastDispatchAt) continue;
    if (nowMs - new Date(lastDispatchAt).getTime() < thresholdMs) continue;

    const pending = getPendingTasks();
    const alreadyPending = pending.some(t => t.taskId === task.taskId);
    if (!alreadyPending) {
      onDispatchBridge(task, engine);
      republished++;
    }
  }

  return republished;
}

async function drainAndRun(opts = {}) {
  const baseDir = opts.baseDir || __dirname;
  const engine = new DispatchEngine({
    baseDir,
    maxSlots: opts.maxSlots,
    onDispatch: (task, eng) => onDispatchBridge(task, eng),
  });

  const runnerState = readRunnerState(baseDir);
  const spawned = [];
  const errors = [];

  engine.reapStale();
  engine.drain();
  const republished = republishStrandedSpawning(engine, opts);

  const pending = getPendingTasks().slice(0, opts.maxDispatchPerTick || DEFAULTS.maxDispatchPerTick);
  for (const task of pending) {
    try {
      const result = await spawnOne(task, engine);
      runnerState.dispatchedTaskIds[task.taskId] = new Date().toISOString();
      spawned.push(result);
    } catch (error) {
      errors.push({ taskId: task.taskId, error: error.message });
      markDeliveryFailed(task.taskId, {
        source: 'dispatch-runner',
        worker: 'dispatch-runner',
        error: error.message,
        status: 'failed',
      });
      try {
        engine.markFailed(task.taskId, { error: `dispatch-runner spawn error: ${error.message}` });
      } catch {}
    }
  }

  runnerState.lastTickAt = new Date().toISOString();
  writeRunnerState(baseDir, runnerState);

  return {
    ok: errors.length === 0,
    spawned: spawned.length,
    republished,
    errors,
    board: engine.liveBoard(),
  };
}

async function main() {
  const result = await drainAndRun();
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = {
  drainAndRun,
  republishStrandedSpawning,
  buildSpawnPayload,
};
