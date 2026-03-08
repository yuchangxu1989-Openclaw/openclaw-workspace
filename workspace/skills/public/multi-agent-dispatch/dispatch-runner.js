#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { DispatchEngine } = require('./dispatch-engine');
const { onDispatchBridge, ackTask, markSpawned, markDelivered, markDeliveryFailed, getPendingTasks, PENDING_FILE } = require('./dispatch-bridge');
const { inferModelKey } = require('./runtime-model-key');
const { validateModelProviderRoute, buildProviderIndexFromAgents } = require('./spawn-routing');
const { readFreeModelKeys } = require('./free-key-auto-expand');

const DEFAULTS = {
  maxDispatchPerTick: 19,
  republishSpawningMs: 5_000,
  // CHANGE 2: Model-specific timeout defaults (in seconds)
  defaultTimeoutSeconds: 3600,        // 60min for most models
  boomTimeoutSeconds: 900,           // 15min for boom tasks
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

/**
 * Determine the timeout for a task based on its model.
 * CHANGE 2: boom tasks get a 15-minute timeout (was ~60min).
 */
function resolveTimeout(task) {
  const payload = task.payload || {};
  // Explicit timeout in task payload takes precedence
  if (payload.runTimeoutSeconds || payload.timeoutSeconds) {
    return {
      runTimeoutSeconds: payload.runTimeoutSeconds || undefined,
      timeoutSeconds: payload.timeoutSeconds || undefined,
      source: 'explicit',
    };
  }

  const model = String(payload.model || task.model || '').toLowerCase();
  const isBoom = model.includes('gpt-5.3-codex') || model.includes('boom-');

  if (isBoom) {
    return {
      runTimeoutSeconds: DEFAULTS.boomTimeoutSeconds,
      timeoutSeconds: DEFAULTS.boomTimeoutSeconds,
      source: 'boom_compressed',
    };
  }

  return {
    runTimeoutSeconds: undefined,
    timeoutSeconds: undefined,
    source: 'default',
  };
}

function buildSpawnPayload(task) {
  const payload = task.payload || {};
  const timeout = resolveTimeout(task);
  return {
    agentId: payload.agentId || task.agentId || 'coder',
    mode: payload.mode || 'run',
    runtime: payload.runtime || 'subagent',
    cleanup: payload.cleanup || 'delete',
    label: payload.label || task.title || task.taskId,
    cwd: payload.cwd,
    timeoutSeconds: timeout.timeoutSeconds || payload.timeoutSeconds,
    runTimeoutSeconds: timeout.runTimeoutSeconds || payload.runTimeoutSeconds,
    model: payload.model || task.model,
    task: (payload.task || task.description || task.title) + '\n\n【语言要求】所有输出、报告、文件内容必须使用中文。',
    _timeoutSource: timeout.source,
  };
}

async function spawnOne(task, engine) {
  if (typeof globalThis.sessions_spawn !== 'function') {
    throw new Error('sessions_spawn not available in current runtime');
  }

  ackTask(task.taskId, { source: 'dispatch-runner', worker: 'dispatch-runner' });

  const payload = buildSpawnPayload(task);

  // ── Fail-fast: model→provider route consistency check ──────────────────
  // Prevents cross-provider misroutes (e.g. boom-coder/claude-opus-4-6-thinking)
  try {
    const routeCheck = validateModelProviderRoute(payload.model, {
      providerIndex: spawnOne._providerIndex || undefined,
    });
    // Strip provider prefix from model if provider-scoped (gateway resolves provider by agent config)
    if (routeCheck.providerScoped) {
      payload.model = routeCheck.modelId;
    }
    // Cache index for the tick to avoid repeated fs reads
    if (!spawnOne._providerIndex) {
      spawnOne._providerIndex = buildProviderIndexFromAgents().index;
    }
  } catch (routeError) {
    if (routeError.code === 'SPAWN_MODEL_PROVIDER_ROUTE_MISMATCH') {
      const details = routeError.details || {};
      throw new Error(
        `[spawn-routing] BLOCKED: model "${details.modelId}" cannot route through provider "${details.providerName}"` +
        (details.matchedProviders?.length ? `; valid providers: ${details.matchedProviders.join(', ')}` : '') +
        `. Fix the model key in the task or openclaw config.`
      );
    }
    throw routeError;
  }
  // ── End fail-fast ──────────────────────────────────────────────────────

  const result = await globalThis.sessions_spawn(payload);

  const sessionKey = result?.sessionKey || result?.session?.sessionKey || result?.id || null;
  const runtimeModelKey = inferModelKey(task, payload.model);
  engine.markRunning(task.taskId, { sessionKey, spawnPayload: payload, spawnResult: result, modelKey: runtimeModelKey, runtimeModelKey });
  markSpawned(task.taskId, {
    source: 'dispatch-runner',
    worker: 'dispatch-runner',
    sessionKey,
    modelKey: runtimeModelKey,
    runtimeModelKey,
    message: 'sessions_spawn success',
  });
  markDelivered(task.taskId, {
    source: 'dispatch-runner',
    worker: 'dispatch-runner',
    sessionKey,
    modelKey: runtimeModelKey,
    runtimeModelKey,
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

  // Reset provider index cache for fresh tick
  spawnOne._providerIndex = null;

  const runnerState = readRunnerState(baseDir);
  const spawned = [];
  const errors = [];

  const reaped = engine.reapStale({
    // Default stale timeout: 30min for non-boom tasks
    staleRunningMs: 30 * 60_000,
    // CHANGE 2: boom/gpt-5.3-codex tasks get compressed 15min stale timeout
    modelStaleOverrides: {
      'gpt-5.3-codex': DEFAULTS.boomTimeoutSeconds * 1000,
    },
  });
  engine.drain();
  const republished = republishStrandedSpawning(engine, opts);

  const pending = getPendingTasks().slice(0, opts.maxDispatchPerTick || DEFAULTS.maxDispatchPerTick);

  // cron环境下没有sessions_spawn API，跳过spawn步骤只做reap+drain+republish
  const canSpawn = typeof globalThis.sessions_spawn === 'function';
  if (!canSpawn && pending.length > 0) {
    console.log(`[dispatch-cron] skip spawn: ${pending.length} pending tasks (sessions_spawn not available in cron env, spawn deferred to runtime)`);
  }

  for (const task of (canSpawn ? pending : [])) {
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
    reaped: reaped.length,
    reapedFollowups: reaped.filter((item) => item.derivedTaskId).length,
    errors,
    board: engine.liveBoard(),
    expansion: {
      freeModelKeys: readFreeModelKeys(),
      enabled: !!(engine.autoExpand && engine.autoExpand.options && engine.autoExpand.options.enabled),
      highWatermarkRatio: engine.autoExpand?.options?.highWatermarkRatio ?? null,
      maxExtraPerTick: engine.autoExpand?.options?.maxExtraPerTick ?? null,
    },
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
  resolveTimeout,
  DEFAULTS,
};
