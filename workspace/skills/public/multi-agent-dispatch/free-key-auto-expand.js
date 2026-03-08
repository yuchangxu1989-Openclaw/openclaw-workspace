'use strict';

function normalizeText(value) {
  return String(value || '').trim();
}

function envInt(name, fallback) {
  const raw = process.env[name];
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function envFloat(name, fallback) {
  const raw = process.env[name];
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function envBool(name, fallback = false) {
  const raw = normalizeText(process.env[name]).toLowerCase();
  if (!raw) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  return fallback;
}

function inferFreeKeyFromTask(task = {}) {
  const candidates = [
    task.freeModel,
    task.free_model,
    task.freeKey,
    task.free_key,
    task.runtimeModelKey,
    task.runtime_model_key,
    task.modelKey,
    task.model,
    task.payload && task.payload.freeModel,
    task.payload && task.payload.free_model,
    task.payload && task.payload.freeKey,
    task.payload && task.payload.free_key,
    task.payload && task.payload.runtimeModelKey,
    task.payload && task.payload.runtime_model_key,
    task.payload && task.payload.modelKey,
    task.payload && task.payload.model,
  ];

  for (const value of candidates) {
    const normalized = normalizeText(value);
    if (normalized) return normalized;
  }
  return null;
}

function readFreeModelKeys() {
  const explicit = normalizeText(process.env.OPENCLAW_FREE_MODEL_KEYS || process.env.MULTI_AGENT_FREE_MODEL_KEYS);
  if (!explicit) return [];
  return Array.from(new Set(
    explicit
      .split(/[\n,;]+/)
      .map((item) => normalizeText(item))
      .filter(Boolean)
  ));
}

function isFreeModelKey(task = {}, freeModelKeys = readFreeModelKeys()) {
  const key = inferFreeKeyFromTask(task);
  return !!key && freeModelKeys.includes(key);
}

function normalizeExpansionTask(input, parentTask) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;

  const task = { ...input };
  task.payload = { ...(parentTask.payload || {}), ...(task.payload || {}) };
  task.tags = Array.from(new Set([
    ...(Array.isArray(parentTask.tags) ? parentTask.tags : []),
    ...(Array.isArray(task.tags) ? task.tags : []),
    'auto-expansion',
  ]));
  task.parentTaskId = task.parentTaskId || parentTask.taskId;
  task.rootTaskId = task.rootTaskId || parentTask.rootTaskId || parentTask.taskId;
  task.model = task.model || parentTask.model || null;
  task.agentId = task.agentId || parentTask.agentId || parentTask.payload?.agentId || null;
  task.priority = task.priority || parentTask.priority || 'normal';
  task.source = task.source || 'free_key_auto_expand';
  task.payload.expansionParentTaskId = parentTask.taskId;
  task.payload.expansionRootTaskId = task.rootTaskId;
  return task;
}

function deriveExpansionCandidates(task, opts = {}) {
  const payload = task.payload || {};
  const sources = [
    payload.autoExpansionTasks,
    payload.autoExpandTasks,
    payload.expansionTasks,
    payload.followupTasks,
    payload.remediationTasks,
    payload.auditTasks,
    payload.backlogTasks,
  ];

  const candidates = [];
  for (const source of sources) {
    if (!Array.isArray(source)) continue;
    for (const item of source) {
      const normalized = normalizeExpansionTask(item, task);
      if (normalized) candidates.push(normalized);
    }
  }

  if (candidates.length > 0) return candidates;

  if (opts.includeCompletionDerived !== false) {
    const children = Array.isArray(payload.parallelChildren) ? payload.parallelChildren : [];
    const remaining = Array.isArray(payload.remainingTasks) ? payload.remainingTasks : [];
    for (const item of [...children, ...remaining]) {
      const normalized = normalizeExpansionTask(item, task);
      if (normalized) candidates.push(normalized);
    }
  }

  return candidates;
}

function createAutoExpansionController(engine, opts = {}) {
  const options = {
    enabled: opts.enabled ?? envBool('OPENCLAW_FREE_KEY_AUTO_EXPAND', true),
    freeModelKeys: Array.isArray(opts.freeModelKeys) ? opts.freeModelKeys : readFreeModelKeys(),
    highWatermarkRatio: opts.highWatermarkRatio ?? envFloat('OPENCLAW_FREE_KEY_EXPAND_HIGH_WATERMARK', 0.85),
    maxExtraPerTick: opts.maxExtraPerTick ?? envInt('OPENCLAW_FREE_KEY_EXPAND_MAX_EXTRA_PER_TICK', 8),
    maxDepth: opts.maxDepth ?? envInt('OPENCLAW_FREE_KEY_EXPAND_MAX_DEPTH', 2),
    maxPerRoot: opts.maxPerRoot ?? envInt('OPENCLAW_FREE_KEY_EXPAND_MAX_PER_ROOT', 12),
    maxPendingPerRoot: opts.maxPendingPerRoot ?? envInt('OPENCLAW_FREE_KEY_EXPAND_MAX_PENDING_PER_ROOT', 6),
    maxConflictsPerTick: opts.maxConflictsPerTick ?? envInt('OPENCLAW_FREE_KEY_EXPAND_MAX_CONFLICTS_PER_TICK', 3),
    maxRiskyPerTick: opts.maxRiskyPerTick ?? envInt('OPENCLAW_FREE_KEY_EXPAND_MAX_RISKY_PER_TICK', 1),
    instrumentationTag: opts.instrumentationTag || 'free_key_auto_expand',
  };

  function currentSummary() {
    return engine.liveBoard().summary;
  }

  function targetBusySlots() {
    const summary = currentSummary();
    const rawTarget = Math.ceil(summary.maxSlots * options.highWatermarkRatio);
    return Math.max(1, Math.min(summary.maxSlots, rawTarget));
  }

  function shouldExpandForTask(task) {
    if (!options.enabled) return false;
    if (!Array.isArray(options.freeModelKeys) || options.freeModelKeys.length === 0) return false;
    return isFreeModelKey(task, options.freeModelKeys);
  }

  function derive(task, meta = {}) {
    if (!shouldExpandForTask(task)) {
      return {
        triggered: false,
        reason: 'not_free_key',
        taskId: task.taskId,
        created: [],
        skipped: [],
        targetBusySlots: targetBusySlots(),
        boardSummary: currentSummary(),
      };
    }

    const summary = currentSummary();
    const target = targetBusySlots();
    if (summary.busySlots >= target) {
      return {
        triggered: false,
        reason: 'high_watermark_reached',
        taskId: task.taskId,
        created: [],
        skipped: [],
        targetBusySlots: target,
        boardSummary: summary,
      };
    }

    const state = engine._load();
    const rootTaskId = task.rootTaskId || task.taskId;
    const rootPendingCount = [state.queued, state.spawning, state.running]
      .flatMap((bucket) => Object.values(bucket || {}))
      .filter((item) => (item.rootTaskId || item.taskId) === rootTaskId).length;

    const rootFinishedCount = (state.finished || [])
      .filter((item) => (item.rootTaskId || item.taskId) === rootTaskId).length;

    const nextDepth = Number.isInteger(task.phaseIndex)
      ? task.phaseIndex
      : Number.isInteger(task.payload?.expansionDepth)
        ? task.payload.expansionDepth
        : 0;

    const allCandidates = deriveExpansionCandidates(task, meta);
    const created = [];
    const skipped = [];
    let conflicts = 0;
    let risky = 0;

    const remainingCapacity = Math.max(0, target - summary.busySlots);
    const creationBudget = Math.max(0, Math.min(options.maxExtraPerTick, remainingCapacity));

    for (const candidate of allCandidates) {
      if (created.length >= creationBudget) {
        skipped.push({ title: candidate.title, reason: 'tick_budget_reached' });
        continue;
      }
      if (nextDepth + 1 > options.maxDepth) {
        skipped.push({ title: candidate.title, reason: 'depth_limit' });
        continue;
      }
      if ((rootFinishedCount + rootPendingCount + created.length) >= options.maxPerRoot) {
        skipped.push({ title: candidate.title, reason: 'root_limit' });
        continue;
      }
      if ((rootPendingCount + created.length) >= options.maxPendingPerRoot) {
        skipped.push({ title: candidate.title, reason: 'root_pending_limit' });
        continue;
      }

      const title = normalizeText(candidate.title).toLowerCase();
      const riskyTask = candidate.priority === 'critical' || /p0|migration|schema|rewrite|delete|drop|refactor/.test(title);
      if (riskyTask) {
        risky += 1;
        if (risky > options.maxRiskyPerTick) {
          skipped.push({ title: candidate.title, reason: 'risk_limit' });
          continue;
        }
      }

      const stateNow = engine._load();
      const occupied = new Set(Object.keys(engine.activeKeyMap()));
      const queuedSameKey = Object.values(stateNow.queued || {}).some((item) => {
        const key = inferFreeKeyFromTask(item);
        return key && key === inferFreeKeyFromTask(candidate);
      });
      const candidateKey = inferFreeKeyFromTask(candidate);
      if (candidateKey && (occupied.has(candidateKey) || queuedSameKey)) {
        conflicts += 1;
        skipped.push({ title: candidate.title, reason: 'model_key_conflict', modelKey: candidateKey });
        if (conflicts >= options.maxConflictsPerTick) break;
        continue;
      }

      created.push({
        ...candidate,
        payload: {
          ...(candidate.payload || {}),
          expansionDepth: nextDepth + 1,
          autoExpansionTriggeredBy: task.taskId,
          autoExpansionTriggeredAt: new Date().toISOString(),
        },
      });
    }

    if (created.length > 0) {
      engine.enqueueBatch(created);
      engine._log(options.instrumentationTag, {
        taskId: task.taskId,
        rootTaskId,
        createdTaskIds: created.map((item) => item.taskId || null),
        createdCount: created.length,
        skippedCount: skipped.length,
        targetBusySlots: target,
        busyBefore: summary.busySlots,
        busyAfter: engine.liveBoard().summary.busySlots,
      });
      engine._save();
    }

    return {
      triggered: created.length > 0,
      reason: created.length > 0 ? 'expanded' : (skipped[0]?.reason || 'no_candidates'),
      taskId: task.taskId,
      rootTaskId,
      created,
      skipped,
      targetBusySlots: target,
      boardSummary: engine.liveBoard().summary,
    };
  }

  return {
    options,
    shouldExpandForTask,
    derive,
    readFreeModelKeys,
  };
}

module.exports = {
  readFreeModelKeys,
  inferFreeKeyFromTask,
  isFreeModelKey,
  deriveExpansionCandidates,
  createAutoExpansionController,
};
