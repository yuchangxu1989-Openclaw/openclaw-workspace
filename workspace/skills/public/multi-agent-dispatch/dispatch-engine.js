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
const { attachModelKey, inferModelKey } = require('./runtime-model-key');
const { createAutoExpansionController } = require('./free-key-auto-expand');
const { preflightModelCheck } = require('./model-preflight');

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

/**
 * Extract the base model ID from a possibly provider-qualified model reference.
 * e.g. "boom-coder/gpt-5.3-codex" → "gpt-5.3-codex", "gpt-5.3-codex" → "gpt-5.3-codex"
 */
function extractBaseModelId(model) {
  const raw = String(model || '').trim();
  if (!raw) return null;
  const idx = raw.indexOf('/');
  return idx > 0 ? raw.slice(idx + 1) : raw;
}

// ── CHANGE 4: Cross-role borrowing ───────────────────────────────────────────

/**
 * Borrow priority: least-critical roles first so core roles stay available.
 */
const BORROW_PRIORITY = [
  'scout',
  'cron-worker',
  'analyst',
  'reviewer',
  'researcher',
  'writer',
  'coder',
];

/**
 * Roles that must NEVER receive dispatched tasks.
 * main = orchestrator + user-facing session, its key must not be shared.
 */
const PROTECTED_ROLES = new Set(['main']);

/**
 * All known agent roles (the 8 base roles). Used to identify role-scoped
 * provider prefixes like "boom-coder" or "claude-researcher".
 */
const ALL_AGENT_ROLES = new Set(BORROW_PRIORITY);

/**
 * Parse a provider-qualified model key into its components.
 * "boom-coder/gpt-5.3-codex" → { providerFamily: "boom", role: "coder", modelId: "gpt-5.3-codex", suffix: "" }
 * "boom-coder-02/gpt-5.3-codex" → { providerFamily: "boom", role: "coder", modelId: "gpt-5.3-codex", suffix: "-02" }
 * "claude-main/claude-opus-4-6" → { providerFamily: "claude", role: "main", modelId: "claude-opus-4-6", suffix: "" }
 */
function parseProviderModelKey(modelKey) {
  const raw = String(modelKey || '').trim();
  if (!raw) return null;

  const slashIdx = raw.indexOf('/');
  if (slashIdx <= 0) return null; // unqualified — can't borrow

  const provider = raw.slice(0, slashIdx);
  const modelId = raw.slice(slashIdx + 1);

  // Try to match provider against known pattern: {family}-{role}[-suffix]
  for (const role of ALL_AGENT_ROLES) {
    // Match e.g. "boom-coder", "claude-coder", "boom-coder-02"
    const prefix = provider.replace(new RegExp(`-${role.replace('-', '\\-')}(?:-\\d+)?$`), '');
    if (prefix !== provider && prefix.length > 0) {
      const suffix = provider.slice(prefix.length + 1 + role.length); // e.g. "" or "-02"
      return { providerFamily: prefix, role, modelId, suffix, original: raw };
    }
  }

  return null; // doesn't match any known role pattern
}

/**
 * Build a borrowed model key by substituting the role.
 * "boom-coder/gpt-5.3-codex" + role="scout" → "boom-scout/gpt-5.3-codex"
 * Preserves suffix: "boom-coder-02/gpt-5.3-codex" + role="scout" → "boom-scout-02/gpt-5.3-codex"
 */
function buildBorrowedModelKey(parsed, borrowRole) {
  // For -02 suffixed providers, map to borrowed role's -02 variant
  return `${parsed.providerFamily}-${borrowRole}${parsed.suffix}/${parsed.modelId}`;
}

function preferredMaxSlots() {
  const raw = process.env.OPENCLAW_MAX_AGENT_KEYS
    || process.env.OPENCLAW_MAX_SLOTS
    || process.env.MULTI_AGENT_MAX_SLOTS
    || process.env.MAX_AGENT_KEYS;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return 19;
}

// ── Default configuration ────────────────────────────────────────────────────

const DEFAULTS = {
  maxSlots: preferredMaxSlots(),     // one agent per key; default fill all available keys
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
  const payload = governed.payload || {};
  const runtimeTask = attachModelKey(governed, governed.model || input.model || null);
  const runtimePayload = runtimeTask.payload || payload;
  return {
    taskId,
    title:       runtimeTask.title || '(untitled)',
    description: runtimeTask.description || '',
    source:      runtimeTask.source || 'manual',
    model:       runtimeTask.model || null,
    modelKey:    runtimeTask.modelKey || null,
    runtimeModelKey: runtimeTask.runtimeModelKey || runtimeTask.modelKey || null,
    agentId:     runtimeTask.agentId || null,
    priority:    runtimeTask.priority || 'normal',   // 'critical' | 'high' | 'normal' | 'low'
    payload:     runtimePayload,
    tags:        runtimeTask.tags || [],
    governance:  runtimeTask.governance || null,

    // decomposition / lifecycle lineage
    parentTaskId: input.parentTaskId || payload.parentTaskId || null,
    rootTaskId: input.rootTaskId || payload.rootTaskId || taskId,
    phaseIndex: Number.isInteger(input.phaseIndex) ? input.phaseIndex : (Number.isInteger(payload.phaseIndex) ? payload.phaseIndex : null),
    phaseCount: Number.isInteger(input.phaseCount) ? input.phaseCount : (Number.isInteger(payload.phaseCount) ? payload.phaseCount : null),
    stageLabel: input.stageLabel || payload.stageLabel || null,

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
    this.autoExpand = opts.autoExpand || createAutoExpansionController(this, opts.autoExpandOptions || {});

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
    return this.activeTasks().length;
  }

  activeKeyMap() {
    const active = this.activeTasks();
    const byKey = {};
    for (const task of active) {
      const key = task.runtime_model_key || task.runtimeModelKey || inferModelKey(task, task.model);
      if (!key) continue;
      if (!byKey[key]) byKey[key] = [];
      byKey[key].push(task.taskId);
    }
    return byKey;
  }

  activeKeyCount() {
    return Object.keys(this.activeKeyMap()).length;
  }

  assertKeyOccupancyInvariant(context = 'runtime') {
    const active = this.activeTasks();
    const byKey = this.activeKeyMap();
    const collisions = Object.entries(byKey)
      .filter(([, taskIds]) => taskIds.length > 1)
      .map(([modelKey, taskIds]) => ({ modelKey, taskIds }));

    if (collisions.length > 0) {
      const error = new Error(`1task=1agent=1key invariant violated in ${context}: ${JSON.stringify(collisions)}`);
      error.code = 'DISPATCH_MODEL_KEY_COLLISION';
      error.collisions = collisions;
      throw error;
    }

    if (active.length !== Object.keys(byKey).length) {
      const error = new Error(`active task count (${active.length}) must equal occupied model key count (${Object.keys(byKey).length}) in ${context}`);
      error.code = 'DISPATCH_ACTIVE_KEY_MISMATCH';
      throw error;
    }

    return { active: active.length, occupiedKeys: Object.keys(byKey).length, byKey };
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
   * Throws if the requested model fails the preflight check (model not found in openclaw.json).
   */
  enqueue(input) {
    // HARD RULE: Never dispatch to main agent
    const inputAgentId = input.agentId || (input.payload && input.payload.agentId) || null;
    if (inputAgentId === 'main') {
      throw new Error('DISPATCH_BLOCKED: Cannot dispatch tasks to main agent. Main is the orchestrator and must not receive dispatched work.');
    }

    // CHANGE 3: Model preflight check — validate model exists before accepting the task
    const governedPreview = applyModelGovernance(input);
    const modelToCheck = governedPreview.model || input.model || null;
    const agentIdForCheck = input.agentId || (input.payload && input.payload.agentId) || null;
    if (modelToCheck) {
      preflightModelCheck(modelToCheck, agentIdForCheck);
    }

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
   * Throws on first model preflight failure.
   */
  enqueueBatch(inputs) {
    // CHANGE 3: Model preflight check for batch
    for (const input of inputs) {
      const governedPreview = applyModelGovernance(input);
      const modelToCheck = governedPreview.model || input.model || null;
      const agentIdForCheck = input.agentId || (input.payload && input.payload.agentId) || null;
      if (modelToCheck) {
        preflightModelCheck(modelToCheck, agentIdForCheck);
      }
    }

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

  // ── Role concurrency helpers ────────────────────────────────────────────

  /**
   * CHANGE 1: Get the set of agent roles currently occupied by active tasks.
   * An agent role (e.g. "coder", "researcher") can only have 1 concurrent task.
   */
  activeRoleMap() {
    const active = this.activeTasks();
    const byRole = {};
    for (const task of active) {
      const role = task.agentId || (task.payload && task.payload.agentId) || null;
      if (!role) continue;
      if (!byRole[role]) byRole[role] = [];
      byRole[role].push(task.taskId);
    }
    return byRole;
  }

  /**
   * Returns set of currently occupied agent role names.
   */
  occupiedRoles() {
    return new Set(Object.keys(this.activeRoleMap()));
  }

  // ── CHANGE 4: Cross-role borrowing ──────────────────────────────────────

  /**
   * Attempt to borrow an idle role for a task whose preferred role is occupied.
   *
   * Returns { borrowedRole, borrowedModelKey, originalRole, originalModelKey }
   * or null if no idle role can serve this task's model.
   *
   * @param {object} task - The queued task
   * @param {Set<string>} occupiedRoles - Currently occupied role names
   * @param {Set<string>} occupiedKeys - Currently occupied model keys
   */
  tryBorrowRole(task, occupiedRoles, occupiedKeys) {
    const originalKey = task.runtime_model_key || task.runtimeModelKey || inferModelKey(task, task.model);
    if (!originalKey) return null;

    const parsed = parseProviderModelKey(originalKey);
    if (!parsed) return null; // can't borrow unqualified keys

    const originalRole = task.agentId || (task.payload && task.payload.agentId) || parsed.role;

    for (const candidateRole of BORROW_PRIORITY) {
      if (candidateRole === originalRole) continue; // skip own role
      if (occupiedRoles.has(candidateRole)) continue; // role busy

      const borrowedKey = buildBorrowedModelKey(parsed, candidateRole);
      if (occupiedKeys.has(borrowedKey)) continue; // key collision

      return {
        borrowedRole: candidateRole,
        borrowedModelKey: borrowedKey,
        originalRole,
        originalModelKey: originalKey,
      };
    }

    return null;
  }

  // ── Drain: fill every free slot from queue ───────────────────────────────

  /**
   * Core scheduling loop. Pops highest-priority queued tasks into free slots.
   * Called automatically after every state mutation that frees a slot.
   * Returns array of tasks that were dispatched this cycle.
   *
   * CHANGE 1: Enforces strict 1 concurrent subagent per agent role.
   * If a role is already occupied, tasks for that role stay queued
   * unless CHANGE 4 cross-role borrowing finds an idle role.
   *
   * CHANGE 4: Cross-role borrowing. When a task's preferred role is occupied,
   * scan idle roles (in borrow priority order) and rewrite the model key to
   * use the idle role's provider. This maximizes key utilization.
   */
  drain() {
    const s = this._load();
    const dispatched = [];

    this.assertKeyOccupancyInvariant('drain:before');

    while (true) {
      const free = this.maxSlots - this.activeKeyCount();
      if (free <= 0) break;

      // CHANGE 1: Build set of occupied agent roles (strict 1-per-role)
      const occupiedRoles = this.occupiedRoles();

      // pick highest-priority queued task that does not collide with an occupied key
      // AND does not collide with an occupied agent role
      const occupiedKeys = new Set(Object.keys(this.activeKeyMap()));
      const candidates = Object.values(s.queued)
        .sort(prioCmp)
        .filter((candidate) => {
          const candidateKey = candidate.runtime_model_key || candidate.runtimeModelKey || inferModelKey(candidate, candidate.model);
          if (!candidateKey || occupiedKeys.has(candidateKey)) return false;

          // CHANGE 1: Role concurrency — block if role already has an active task
          const candidateRole = candidate.agentId || (candidate.payload && candidate.payload.agentId) || null;
          if (candidateRole && occupiedRoles.has(candidateRole)) return false;

          return true;
        });

      // ── CHANGE 4: Cross-role borrowing ──────────────────────────────────
      // If no direct candidates, try to borrow an idle role for role-blocked tasks
      let borrowResult = null;
      let task = candidates[0] || null;

      if (!task) {
        // Find highest-priority queued task that IS role-blocked but could borrow
        const roleBlockedCandidates = Object.values(s.queued)
          .sort(prioCmp)
          .filter((candidate) => {
            const candidateKey = candidate.runtime_model_key || candidate.runtimeModelKey || inferModelKey(candidate, candidate.model);
            if (!candidateKey) return false;
            // Must be role-blocked (key might or might not collide — borrowing changes the key)
            const candidateRole = candidate.agentId || (candidate.payload && candidate.payload.agentId) || null;
            return candidateRole && occupiedRoles.has(candidateRole);
          });

        for (const blocked of roleBlockedCandidates) {
          const borrow = this.tryBorrowRole(blocked, occupiedRoles, occupiedKeys);
          if (borrow) {
            task = blocked;
            borrowResult = borrow;
            break;
          }
        }
      }

      if (!task) break;
      // ── End CHANGE 4 ───────────────────────────────────────────────────

      const taskKey = borrowResult
        ? borrowResult.borrowedModelKey
        : inferModelKey(task, task.model);
      delete s.queued[task.taskId];

      task.status = 'spawning';
      task.spawningAt = now();
      task.lastDispatchAt = task.spawningAt;
      task.dispatchAttempts = (task.dispatchAttempts || 0) + 1;
      if (!task.modelKey) task.modelKey = taskKey;
      task.runtimeModelKey = taskKey;
      task.runtime_model_key = taskKey;

      // CHANGE 4: Record borrowing metadata on the task
      if (borrowResult) {
        task.model = taskKey; // rewrite model to borrowed key
        task.borrowedFrom = {
          originalRole: borrowResult.originalRole,
          originalModelKey: borrowResult.originalModelKey,
          borrowedRole: borrowResult.borrowedRole,
          borrowedModelKey: borrowResult.borrowedModelKey,
          borrowedAt: now(),
        };
        // Update agentId to the borrowed role so the runner uses the right provider
        task.agentId = borrowResult.borrowedRole;
        if (task.payload) {
          task.payload.agentId = borrowResult.borrowedRole;
          task.payload.originalAgentId = borrowResult.originalRole;
        }
      }

      s.spawning[task.taskId] = task;

      this._log('dispatched', {
        taskId: task.taskId,
        title: task.title,
        modelKey: taskKey,
        slotsAfter: free - 1,
        dispatchAttempts: task.dispatchAttempts,
        borrowed: borrowResult ? {
          from: borrowResult.originalRole,
          to: borrowResult.borrowedRole,
          originalKey: borrowResult.originalModelKey,
          borrowedKey: borrowResult.borrowedModelKey,
        } : null,
      });
      dispatched.push(task);
    }

    this.assertKeyOccupancyInvariant('drain:after');

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
    const patchedKeys = attachModelKey(patch, task.model);
    const runtimeModelKey = patchedKeys.runtime_model_key || patchedKeys.runtimeModelKey || task.runtime_model_key || task.runtimeModelKey || inferModelKey(task, task.model);
    Object.assign(task, patchedKeys, {
      modelKey: patchedKeys.modelKey || task.modelKey || runtimeModelKey,
      runtimeModelKey,
      runtime_model_key: runtimeModelKey,
    });
    s.running[taskId] = task;

    this.assertKeyOccupancyInvariant('markRunning');

    this._log('running', { taskId });
    this._save();
    this.emit('running', task);
    return task;
  }

  /**
   * Mark task as successfully completed. Frees slot → auto-backfill.
   */
  markDone(taskId, patch = {}) {
    const expanded = this._expandCompletionPatch(taskId, patch);
    const finished = this._finish(taskId, 'done', expanded.finishPatch);
    this._maybeAutoExpandFromFreeKey(finished, { stage: 'markDone' });
    if (expanded.followupTasks.length > 0) {
      const created = this.enqueueBatch(expanded.followupTasks);
      finished.followupTaskIds = created.map((task) => task.taskId);
      finished.followupTaskCount = created.length;
      this._log('completion_expanded', {
        taskId,
        followupTaskIds: finished.followupTaskIds,
        followupTaskCount: created.length,
      });
      this._save();
    }
    return finished;
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

  _expandCompletionPatch(taskId, patch = {}) {
    const s = this._load();
    const task = s.running[taskId] || s.spawning[taskId] || s.queued[taskId];
    if (!task) throw new Error(`Task ${taskId} not found`);

    const finishPatch = { ...patch };
    const followupTasks = [];
    const children = splitTaskIntoParallelChildren(task, { patch });
    if (children.length > 0) {
      followupTasks.push(...children);
      finishPatch.splitProducedTaskIds = children.map((child) => child.taskId).filter(Boolean);
      finishPatch.splitProducedTaskCount = children.length;
    }

    const remaining = deriveRemainingTasks(task, patch);
    if (remaining.length > 0) {
      followupTasks.push(...remaining);
      finishPatch.remainingTaskTemplates = remaining.map((next) => ({
        title: next.title,
        parentTaskId: next.parentTaskId || null,
        stageLabel: next.stageLabel || next.payload?.stageLabel || null,
      }));
      finishPatch.remainingTaskCount = remaining.length;
    }

    if (followupTasks.length > 0) {
      finishPatch.hasFollowupTasks = true;
    }

    if (hasProducedArtifacts(task, patch)) {
      finishPatch.artifactProduced = true;
      finishPatch.artifactCompletedAt = finishPatch.artifactCompletedAt || now();
    }

    return { finishPatch, followupTasks };
  }

  _maybeAutoExpandFromFreeKey(task, meta = {}) {
    if (!this.autoExpand || typeof this.autoExpand.derive !== 'function') return null;
    try {
      return this.autoExpand.derive(task, meta);
    } catch (error) {
      this._log('free_key_auto_expand_error', {
        taskId: task?.taskId || null,
        stage: meta.stage || null,
        error: error.message,
      });
      this._save();
      return null;
    }
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

    // 主表唯一当前状态：同 taskId 只允许一个 current record，finished 仅保留最新终态
    s.finished = s.finished.filter((item) => item.taskId !== taskId);
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
   *
   * CHANGE 2: Supports model-specific stale timeouts via opts.modelStaleOverrides.
   * e.g. { 'gpt-5.3-codex': 900_000 } → boom tasks go stale after 15min.
   */
  detectStale(opts = {}) {
    const s = this._load();
    const spawnTimeout = opts.spawnTimeoutMs ?? DEFAULTS.spawnTimeoutMs;
    const defaultRunTimeout = opts.staleRunningMs ?? DEFAULTS.staleRunningMs;
    const modelOverrides = opts.modelStaleOverrides || {};
    const cutoff = Date.now();
    const stale = [];

    for (const task of Object.values(s.spawning)) {
      if (cutoff - new Date(task.spawningAt).getTime() > spawnTimeout) {
        stale.push({ ...task, reason: 'spawn_timeout' });
      }
    }

    for (const task of Object.values(s.running)) {
      const lastPing = task.lastHeartbeat || task.runningAt;
      // CHANGE 2: Resolve model-specific timeout
      const modelId = extractBaseModelId(task.model);
      const runTimeout = (modelId && modelOverrides[modelId]) || defaultRunTimeout;

      if (lastPing && cutoff - new Date(lastPing).getTime() > runTimeout) {
        stale.push({ ...task, reason: 'no_heartbeat', staleTimeoutMs: runTimeout });
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
        const timeoutDecision = buildTimeoutDecision(info, opts);
        const finished = this.markFailed(info.taskId, {
          error: `auto-reaped: ${info.reason}`,
          timeoutReason: info.reason,
          timeoutAt: now(),
          timeoutCount: (info.timeoutCount || 0) + 1,
          timeoutDecision,
          nextAction: timeoutDecision.action,
          archived: timeoutDecision.action === 'archive',
          humanHandoffRequired: timeoutDecision.action === 'human_handoff',
          replacementRequested: timeoutDecision.action === 'replace',
          restartRequested: timeoutDecision.action === 'restart',
          splitRequeueRequested: timeoutDecision.action === 'split_requeue',
        });

        const followup = deriveTimeoutFollowup(info, timeoutDecision);
        let derivedTask = null;
        if (followup) {
          derivedTask = this.enqueue(followup);
          const state = this._load();
          const current = state.finished.find((t) => t.taskId === info.taskId);
          if (current) {
            current.derivedTaskId = derivedTask.taskId;
            current.derivedTaskStatus = derivedTask.status;
            current.derivedTaskAction = timeoutDecision.action;
            this._save();
          }
        }

        reaped.push({ ...info, timeoutDecision, derivedTaskId: derivedTask?.taskId || null, finished });
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
    const activeKeyMap = this.activeKeyMap();
    const active = this.activeTasks();
    const accepted = spawning.length + running.length + queued.length;
    const delivered = running.filter((task) => Boolean(task.sessionKey)).length;
    const acknowledged = spawning.filter((task) => (task.dispatchAttempts || 0) > 0).length + delivered;

    return {
      updatedAt: now(),
      maxSlots:  this.maxSlots,
      occupiedModelKeys: Object.keys(activeKeyMap),
      occupiedModelKeyCount: Object.keys(activeKeyMap).length,
      summary: {
        maxSlots:      this.maxSlots,
        busySlots:     active.length,
        occupiedModelKeyCount: Object.keys(activeKeyMap).length,
        freeSlots:     Math.max(0, this.maxSlots - Object.keys(activeKeyMap).length),
        spawningCount: spawning.length,
        runningCount:  running.length,
        queueDepth:    queued.length,
        finishedCount: s.finished.length,
        acceptedCount: accepted,
        queuedCount: queued.length,
        ackedCount: acknowledged,
        deliveredCount: delivered,
        trueOccupiedModelKeys: Object.keys(activeKeyMap).length,
        utilisation:   Object.keys(activeKeyMap).length > 0
          ? ((Object.keys(activeKeyMap).length / this.maxSlots) * 100).toFixed(1) + '%'
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
      ...Object.values(s.spawning)
        .map(t => ({ ...t, status: 'spawning' }))
        .filter((task) => inferModelKey(task, task.model)),
      ...Object.values(s.running)
        .map(t => ({ ...t, status: 'running' }))
        .filter((task) => inferModelKey(task, task.model)),
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
    modelKey:  t.modelKey || t.runtimeModelKey || inferModelKey(t, t.model),
    runtimeModelKey: t.runtimeModelKey || t.modelKey || inferModelKey(t, t.model),
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

function buildTimeoutDecision(task, opts = {}) {
  const policy = opts.timeoutPolicy || {};
  const payload = task.payload || {};
  const timeoutCount = Number.isInteger(task.timeoutCount)
    ? task.timeoutCount
    : Number.isInteger(payload.timeoutCount)
      ? payload.timeoutCount
      : 0;

  let action = policy.action
    || task.timeoutPolicyAction
    || payload.timeoutPolicyAction
    || payload.timeoutAction
    || task.nextTimeoutAction
    || task.onTimeout
    || null;

  if (!action) {
    if (timeoutCount <= 0) action = 'replace';
    else if (timeoutCount === 1) action = 'split_requeue';
    else action = 'human_handoff';
  }

  const normalized = ['restart', 'replace', 'archive', 'human_handoff', 'split_requeue'].includes(action) ? action : 'replace';
  return {
    action: normalized,
    decidedAt: now(),
    reason: task.reason || task.timeoutReason || 'timeout',
    owner: policy.owner || task.timeoutOwner || 'dispatch-engine',
    timeoutCount,
  };
}

function deriveTimeoutFollowup(task, timeoutDecision) {
  const action = timeoutDecision?.action;
  const payload = task.payload || {};
  const carryPayload = { ...payload };
  delete carryPayload.timeoutAction;
  delete carryPayload.timeoutPolicyAction;

  const nextTimeoutCount = (Number.isInteger(task.timeoutCount) ? task.timeoutCount : (Number.isInteger(payload.timeoutCount) ? payload.timeoutCount : 0)) + 1;
  const nextTimeoutAction = nextTimeoutCount <= 1 ? 'split_requeue' : 'human_handoff';

  const baseTitle = task.title || '(untitled)';
  const baseTags = Array.isArray(task.tags) ? [...task.tags, 'timeout-followup', action] : ['timeout-followup', action];
  const baseTask = {
    description: task.description || '',
    model: task.model || null,
    agentId: task.agentId || payload.agentId || null,
    priority: task.priority || 'normal',
    tags: baseTags,
    governance: task.governance || null,
    timeoutPolicyAction: nextTimeoutAction,
    parentTaskId: task.taskId,
    rootTaskId: task.rootTaskId || task.taskId,
    payload: {
      ...carryPayload,
      parentTaskId: task.taskId,
      rootTaskId: task.rootTaskId || task.taskId,
      timeoutFollowupFor: task.taskId,
      timeoutOriginStatus: task.status,
      timeoutOriginDecision: action,
      timeoutOriginalTaskTitle: baseTitle,
      timeoutAutoSplitRequeue: true,
      timeoutCount: nextTimeoutCount,
      timeoutPolicyAction: nextTimeoutAction,
    },
  };

  if (action === 'restart' || action === 'replace') {
    return {
      title: action === 'restart' ? `${baseTitle} [restart]` : `${baseTitle} [replacement]`,
      source: action === 'restart' ? 'timeout_restart' : 'timeout_replace',
      ...baseTask,
    };
  }

  if (action === 'split_requeue') {
    const shards = Array.isArray(payload.parallelChildren) && payload.parallelChildren.length > 0
      ? payload.parallelChildren
      : [
          {
            title: `${baseTitle} [split 1/2]`,
            task: (payload.task || task.description || baseTitle) + ' — focus on scope A / first half.',
          },
          {
            title: `${baseTitle} [split 2/2]`,
            task: (payload.task || task.description || baseTitle) + ' — focus on scope B / second half.',
          },
        ];

    return {
      title: `${baseTitle} [split-requeue]`,
      source: 'timeout_split_requeue',
      ...baseTask,
      tags: [...baseTags, 'split-requeue'],
      payload: {
        ...baseTask.payload,
        timeoutDerivedType: 'split_requeue',
        parallelChildren: shards,
        task: payload.task
          || `Timeout split+requeue follow-up: break task ${task.taskId} into smaller parallel children, preserve context, and continue from the last known checkpoint.`,
      },
    };
  }

  if (action === 'archive') {
    return {
      title: `${baseTitle} [archive-review]`,
      source: 'timeout_archive_review',
      ...baseTask,
      tags: [...baseTags, 'archive-review'],
      payload: {
        ...baseTask.payload,
        timeoutDerivedType: 'archive_review',
        task: payload.task
          || `Archive timeout follow-up: review partial outputs, decide whether to keep/archive artifacts, and prepare resumable next-step notes for task ${task.taskId}.`,
      },
    };
  }

  if (action === 'human_handoff') {
    return {
      title: `${baseTitle} [handoff-package]`,
      source: 'timeout_handoff_package',
      ...baseTask,
      tags: [...baseTags, 'handoff-package'],
      payload: {
        ...baseTask.payload,
        timeoutDerivedType: 'handoff_package',
        task: payload.task
          || `Human handoff follow-up: summarize blocker, last known progress, missing inputs, and exact operator decision needed for task ${task.taskId}.`,
      },
    };
  }

  return null;
}

function hasProducedArtifacts(task, patch = {}) {
  if (patch.artifactProduced === true) return true;
  if (Array.isArray(patch.artifacts) && patch.artifacts.length > 0) return true;
  if (Array.isArray(patch.outputs) && patch.outputs.length > 0) return true;
  if (typeof patch.result === 'string' && patch.result.trim()) return true;
  const payload = task?.payload || {};
  if (Array.isArray(payload.artifacts) && payload.artifacts.length > 0) return true;
  return false;
}

function deriveRemainingTasks(task, patch = {}) {
  const payload = task?.payload || {};
  const remaining = patch.remainingTasks
    || patch.remaining
    || payload.remainingTasks
    || payload.remaining
    || [];

  if (!Array.isArray(remaining) || remaining.length === 0) return [];

  return remaining.map((item, index) => {
    const next = (item && typeof item === 'object' && !Array.isArray(item)) ? { ...item } : { title: String(item) };
    const nextPayload = { ...(payload || {}), ...(next.payload || {}) };
    delete nextPayload.parallelChildren;
    delete nextPayload.shards;
    delete nextPayload.subtasks;
    delete nextPayload.remaining;
    delete nextPayload.remainingTasks;

    const taskId = next.taskId || uid();
    return {
      taskId,
      title: next.title || `${task.title || '(untitled)'} · remaining ${index + 1}`,
      description: next.description || task.description || '',
      source: next.source || 'remaining_followup',
      model: next.model || task.model || null,
      agentId: next.agentId || task.agentId || payload.agentId || null,
      priority: next.priority || task.priority || 'normal',
      tags: Array.isArray(task.tags) ? [...task.tags, 'remaining-followup'] : ['remaining-followup'],
      parentTaskId: task.taskId,
      rootTaskId: task.rootTaskId || task.taskId,
      phaseIndex: Number.isInteger(next.phaseIndex) ? next.phaseIndex : null,
      phaseCount: Number.isInteger(next.phaseCount) ? next.phaseCount : null,
      stageLabel: next.stageLabel || nextPayload.stageLabel || null,
      payload: {
        ...nextPayload,
        parentTaskId: task.taskId,
        rootTaskId: task.rootTaskId || task.taskId,
        derivedFromCompletedTaskId: task.taskId,
        remainingIndex: index,
      },
      governance: task.governance || null,
    };
  });
}

function splitTaskIntoParallelChildren(task, opts = {}) {
  const patch = opts.patch || {};
  const payload = task.payload || {};
  const shards = patch.parallelChildren || patch.shards || patch.subtasks || payload.parallelChildren || payload.shards || payload.subtasks || [];
  if (!Array.isArray(shards) || shards.length === 0) return [];

  return shards.map((shard, index) => {
    const shardPayload = (shard && typeof shard === 'object' && !Array.isArray(shard)) ? { ...shard } : { task: String(shard) };
    const title = shardPayload.title || `${task.title || '(untitled)'} [${index + 1}/${shards.length}]`;
    delete shardPayload.title;

    const taskId = shardPayload.taskId || uid();
    return {
      taskId,
      title,
      description: shardPayload.description || task.description || '',
      source: shardPayload.source || payload.source || 'parallel_split',
      model: shardPayload.model || task.model || null,
      agentId: shardPayload.agentId || task.agentId || payload.agentId || null,
      priority: shardPayload.priority || task.priority || 'normal',
      tags: Array.isArray(task.tags) ? [...task.tags, 'parallel-child'] : ['parallel-child'],
      parentTaskId: task.taskId,
      rootTaskId: task.rootTaskId || task.taskId,
      phaseIndex: index + 1,
      phaseCount: shards.length,
      stageLabel: shardPayload.stageLabel || `phase-${index + 1}`,
      payload: {
        ...payload,
        ...shardPayload,
        parentTaskId: task.taskId,
        rootTaskId: task.rootTaskId || task.taskId,
        splitFromTaskId: task.taskId,
        splitShardIndex: index,
        splitShardCount: shards.length,
        phaseIndex: index + 1,
        phaseCount: shards.length,
      },
      governance: task.governance || null,
    };
  });
}

// ── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  DispatchEngine,
  makeTask,
  formatDuration,
  extractBaseModelId,
  parseProviderModelKey,
  buildBorrowedModelKey,
  BORROW_PRIORITY,
  ALL_AGENT_ROLES,
  DEFAULTS,
  PRIO_ORDER,
};
