'use strict';

/**
 * auto-split.js — Automatic task decomposition for batch workloads.
 *
 * Detects splittable patterns in task descriptions/payloads and produces
 * an array of independent sub-task descriptors that can be enqueued in
 * parallel via DispatchEngine.enqueueBatch().
 *
 * Design principles:
 *   1. Generic — works for any "do N things" pattern, not just eval.
 *   2. Non-invasive — called before enqueue; does NOT mutate the engine.
 *   3. Backwards-compatible — returns [] when nothing is splittable.
 *   4. Each sub-task gets its own timeout, error handling, and lineage.
 */

// ── Pattern catalogue ────────────────────────────────────────────────────────

/**
 * Each pattern returns { count, itemLabel, items? } or null.
 *   count     — how many items detected
 *   itemLabel — human-readable label ("eval", "file", "row", …)
 *   items     — optional array of per-item identifiers (filenames, ids, …)
 */
const SPLIT_PATTERNS = [
  // ── Explicit list in payload ──────────────────────────────────────────
  {
    name: 'payload_items',
    detect(task) {
      const p = task.payload || {};
      const items = p.items || p.files || p.urls || p.ids || p.inputs || p.targets || p.queries || p.records || p.cases || p.prompts;
      if (Array.isArray(items) && items.length > 1) {
        const label = p.itemLabel || p.itemType || inferLabelFromKey(p, items);
        return { count: items.length, itemLabel: label, items };
      }
      return null;
    },
  },

  // ── Explicit count in payload ─────────────────────────────────────────
  {
    name: 'payload_count',
    detect(task) {
      const p = task.payload || {};
      const count = p.count || p.total || p.n || p.batchSize || p.numItems;
      if (typeof count === 'number' && count > 1) {
        return { count, itemLabel: p.itemLabel || p.itemType || 'item' };
      }
      return null;
    },
  },

  // ── Natural language: "跑N条eval" / "process N files" / "分析N条" ──────
  {
    name: 'nl_chinese_count',
    detect(task) {
      const text = taskText(task);
      // Match: 跑/运行/处理/分析/执行/测试 + N + 条/个/份/项/篇/组 + label
      const m = text.match(/(?:跑|运行|处理|分析|执行|测试|评估|生成|翻译|检查|审查|批量)\s*(\d+)\s*(?:条|个|份|项|篇|组|次|轮|批)\s*(\S+)/);
      if (m) {
        const count = parseInt(m[1], 10);
        if (count > 1) return { count, itemLabel: m[2] };
      }
      return null;
    },
  },

  {
    name: 'nl_english_count',
    detect(task) {
      const text = taskText(task);
      // Match: "run/process/analyze/execute/test N evals/files/items/…"
      const m = text.match(/(?:run|process|analyze|execute|test|evaluate|generate|translate|check|review|batch)\s+(\d+)\s+(\w+)/i);
      if (m) {
        const count = parseInt(m[1], 10);
        if (count > 1) return { count, itemLabel: m[2] };
      }
      return null;
    },
  },

  // ── File glob patterns ────────────────────────────────────────────────
  {
    name: 'file_glob',
    detect(task) {
      const p = task.payload || {};
      const glob = p.glob || p.pattern || p.filePattern;
      if (typeof glob === 'string' && (glob.includes('*') || glob.includes('?'))) {
        // Can't know count without fs access; signal splittable with count=-1
        return { count: -1, itemLabel: 'file', glob };
      }
      return null;
    },
  },
];

// ── Core API ─────────────────────────────────────────────────────────────────

/**
 * Analyze a task and return split info without actually splitting.
 *
 * @param {object} task — Task descriptor (same shape as enqueue input)
 * @param {object} [opts]
 * @param {number} [opts.maxConcurrency=19] — Max parallel sub-tasks
 * @param {number} [opts.minSplitCount=2]   — Don't split if count < this
 * @returns {{ splittable: boolean, pattern?: string, count?: number, itemLabel?: string, items?: any[] }}
 */
function analyzeSplittability(task, opts = {}) {
  if (!task) return { splittable: false };

  // Respect explicit opt-out
  const p = task.payload || {};
  if (p.noAutoSplit === true || task.noAutoSplit === true) {
    return { splittable: false, reason: 'opt-out' };
  }

  // Already a child of a split — don't re-split
  if (p.splitFromTaskId || p.parentTaskId || task.parentTaskId) {
    return { splittable: false, reason: 'already-child' };
  }

  const minCount = opts.minSplitCount || 2;

  for (const pattern of SPLIT_PATTERNS) {
    const result = pattern.detect(task);
    if (result && (result.count === -1 || result.count >= minCount)) {
      return {
        splittable: true,
        pattern: pattern.name,
        count: result.count,
        itemLabel: result.itemLabel,
        items: result.items || null,
        glob: result.glob || null,
      };
    }
  }

  return { splittable: false };
}

/**
 * Split a task into parallel sub-tasks.
 *
 * @param {object} task — Original task descriptor
 * @param {object} [opts]
 * @param {number} [opts.maxConcurrency=19]    — Max parallel sub-tasks
 * @param {number} [opts.minSplitCount=2]      — Min items to trigger split
 * @param {number} [opts.subTaskTimeoutMs]     — Per-subtask timeout (default: scale with count)
 * @param {string} [opts.model]                — Override model for sub-tasks
 * @param {string} [opts.agentId]              — Override agentId for sub-tasks
 * @returns {object[]} — Array of sub-task descriptors ready for enqueueBatch()
 */
function autoSplit(task, opts = {}) {
  const analysis = analyzeSplittability(task, opts);
  if (!analysis.splittable) return [];

  const maxConcurrency = opts.maxConcurrency || 19;
  const count = analysis.count;

  // If count is unknown (glob), return empty — caller should resolve glob first
  if (count === -1) return [];

  const items = analysis.items || null;
  const effectiveCount = Math.min(count, maxConcurrency);

  // Chunk items into effectiveCount groups if count > maxConcurrency
  const chunks = chunkItems(count, items, effectiveCount);

  const basePayload = { ...(task.payload || {}) };
  // Strip fields that would cause re-splitting
  delete basePayload.items;
  delete basePayload.files;
  delete basePayload.urls;
  delete basePayload.ids;
  delete basePayload.inputs;
  delete basePayload.targets;
  delete basePayload.queries;
  delete basePayload.records;
  delete basePayload.cases;
  delete basePayload.prompts;
  delete basePayload.count;
  delete basePayload.total;
  delete basePayload.n;
  delete basePayload.batchSize;
  delete basePayload.numItems;

  const rootTaskId = task.taskId || `root_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const baseTitle = task.title || task.payload?.task?.slice(0, 60) || '(batch task)';
  const defaultSubTimeout = opts.subTaskTimeoutMs || Math.max(120_000, Math.min(1800_000, 300_000));

  return chunks.map((chunk, index) => {
    const subTitle = items
      ? `${baseTitle} [${index + 1}/${chunks.length}: ${chunk.label}]`
      : `${baseTitle} [${index + 1}/${chunks.length}]`;

    const subPayload = {
      ...basePayload,
      splitFromTaskId: rootTaskId,
      splitShardIndex: index,
      splitShardCount: chunks.length,
      splitItemLabel: analysis.itemLabel,
      noAutoSplit: true, // prevent recursive splitting
    };

    // Attach the chunk's items
    if (chunk.items) {
      subPayload.items = chunk.items;
      subPayload.itemOffset = chunk.offset;
      subPayload.itemCount = chunk.items.length;
    } else {
      subPayload.itemOffset = chunk.offset;
      subPayload.itemCount = chunk.size;
      subPayload.itemTotal = count;
    }

    // If original had a task prompt, augment it with chunk info
    if (basePayload.task) {
      if (chunk.items) {
        subPayload.task = `${basePayload.task}\n\n[Auto-split shard ${index + 1}/${chunks.length}] Process items: ${JSON.stringify(chunk.items)}`;
      } else {
        subPayload.task = `${basePayload.task}\n\n[Auto-split shard ${index + 1}/${chunks.length}] Process items ${chunk.offset + 1} to ${chunk.offset + chunk.size} of ${count}.`;
      }
    }

    return {
      title: subTitle,
      description: task.description || '',
      source: 'auto-split',
      model: opts.model || task.model || null,
      agentId: opts.agentId || task.agentId || null,
      priority: task.priority || 'normal',
      tags: [...(task.tags || []), 'auto-split', `shard-${index + 1}`],
      parentTaskId: rootTaskId,
      rootTaskId,
      phaseIndex: index + 1,
      phaseCount: chunks.length,
      stageLabel: `shard-${index + 1}-of-${chunks.length}`,
      payload: subPayload,
      timeoutMs: opts.subTaskTimeoutMs || defaultSubTimeout,
    };
  });
}

/**
 * Aggregate results from completed sub-tasks into a unified summary.
 *
 * @param {object[]} completedTasks — Array of finished TaskRecords (from engine.queryHistory or similar)
 * @param {object} [opts]
 * @returns {object} — Aggregated result
 */
function aggregateResults(completedTasks, opts = {}) {
  if (!Array.isArray(completedTasks) || completedTasks.length === 0) {
    return { total: 0, succeeded: 0, failed: 0, results: [], errors: [] };
  }

  const succeeded = completedTasks.filter(t => t.status === 'done');
  const failed = completedTasks.filter(t => t.status === 'failed');
  const cancelled = completedTasks.filter(t => t.status === 'cancelled');

  return {
    total: completedTasks.length,
    succeeded: succeeded.length,
    failed: failed.length,
    cancelled: cancelled.length,
    allSucceeded: failed.length === 0 && cancelled.length === 0,
    results: succeeded.map(t => ({
      taskId: t.taskId,
      title: t.title,
      shardIndex: t.phaseIndex || t.payload?.splitShardIndex,
      result: t.result,
      duration: t.duration,
    })),
    errors: failed.map(t => ({
      taskId: t.taskId,
      title: t.title,
      shardIndex: t.phaseIndex || t.payload?.splitShardIndex,
      error: t.error,
      duration: t.duration,
    })),
    summary: `${succeeded.length}/${completedTasks.length} succeeded` +
      (failed.length > 0 ? `, ${failed.length} failed` : '') +
      (cancelled.length > 0 ? `, ${cancelled.length} cancelled` : ''),
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function taskText(task) {
  const parts = [
    task.title || '',
    task.description || '',
    task.payload?.task || '',
  ];
  return parts.join(' ').trim();
}

function inferLabelFromKey(payload, items) {
  for (const key of ['items', 'files', 'urls', 'ids', 'inputs', 'targets', 'queries', 'records', 'cases', 'prompts']) {
    if (payload[key] === items) return key.replace(/s$/, '');
  }
  return 'item';
}

/**
 * Divide `count` items into `numChunks` roughly-equal groups.
 */
function chunkItems(count, items, numChunks) {
  const chunks = [];
  const chunkSize = Math.ceil(count / numChunks);
  for (let i = 0; i < numChunks; i++) {
    const offset = i * chunkSize;
    const size = Math.min(chunkSize, count - offset);
    if (size <= 0) break;
    const chunk = { offset, size };
    if (items) {
      chunk.items = items.slice(offset, offset + size);
      chunk.label = chunk.items.length === 1
        ? String(chunk.items[0]).slice(0, 40)
        : `${chunk.items.length} items`;
    }
    chunks.push(chunk);
  }
  return chunks;
}

// ── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  analyzeSplittability,
  autoSplit,
  aggregateResults,
  SPLIT_PATTERNS,
  // Exposed for testing
  chunkItems,
  taskText,
};
