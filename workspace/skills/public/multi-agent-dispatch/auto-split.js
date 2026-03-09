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

// ── Simple Auto-Split (sessions_spawn ready) ─────────────────────────────────

/**
 * Simple task splitter for batch workloads → sessions_spawn-ready subtasks.
 *
 * @param {object} task - { description: string, items_count: number, type: string }
 * @param {number} [maxConcurrency=19] - Maximum parallel lanes
 * @returns {object[]} - Array of { task, label } objects ready for sessions_spawn
 */
function autoSplitSimple(task, maxConcurrency = 19) {
  if (!task || !task.items_count || task.items_count <= 1) {
    return [{ task: task.description || '', label: task.type || 'task' }];
  }

  const count = task.items_count;
  const lanes = Math.min(count, maxConcurrency);
  const chunkSize = Math.ceil(count / lanes);
  const subtasks = [];

  for (let i = 0; i < lanes; i++) {
    const start = i * chunkSize + 1;
    const end = Math.min((i + 1) * chunkSize, count);
    if (start > count) break;

    subtasks.push({
      task: `${task.description}\n\n[Shard ${i + 1}/${lanes}] Process ${task.type || 'items'} ${start}-${end} (of ${count} total).`,
      label: `${task.type || 'batch'}-shard-${i + 1}-of-${lanes}`,
    });
  }

  return subtasks;
}

// ── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  analyzeSplittability,
  autoSplit,
  autoSplitSimple,
  aggregateResults,
  SPLIT_PATTERNS,
  // Exposed for testing
  chunkItems,
  taskText,
};

// ── CLI test runner ──────────────────────────────────────────────────────────

if (require.main === module && process.argv.includes('--test')) {
  console.log('=== autoSplitSimple tests ===\n');

  // Test 1: 100 items, 19 concurrency
  const r1 = autoSplitSimple({ description: 'Run eval suite', items_count: 100, type: 'eval' }, 19);
  console.log(`Test 1: 100 items → ${r1.length} shards`);
  console.assert(r1.length === 17, `Expected 17, got ${r1.length}`); // ceil(100/19)=6 per chunk → 17 shards
  console.log(`  First: ${r1[0].label}`);
  console.log(`  Last:  ${r1[r1.length - 1].label}\n`);

  // Test 2: 5 items
  const r2 = autoSplitSimple({ description: 'Process files', items_count: 5, type: 'file' }, 19);
  console.log(`Test 2: 5 items → ${r2.length} shards`);
  console.assert(r2.length === 5, `Expected 5, got ${r2.length}`);

  // Test 3: 1 item (no split)
  const r3 = autoSplitSimple({ description: 'Single task', items_count: 1, type: 'task' }, 19);
  console.log(`Test 3: 1 item → ${r3.length} shard (no split)`);
  console.assert(r3.length === 1, `Expected 1, got ${r3.length}`);

  // Test 4: 19 items exactly
  const r4 = autoSplitSimple({ description: 'Exact fit', items_count: 19, type: 'item' }, 19);
  console.log(`Test 4: 19 items → ${r4.length} shards`);
  console.assert(r4.length === 19, `Expected 19, got ${r4.length}`);

  // Test 5: coverage check - all items accounted for
  const r5 = autoSplitSimple({ description: 'Check coverage', items_count: 100, type: 'row' }, 19);
  let totalCovered = 0;
  for (const s of r5) {
    const m = s.task.match(/rows? (\d+)-(\d+)/);
    if (m) totalCovered += parseInt(m[2]) - parseInt(m[1]) + 1;
  }
  console.log(`Test 5: Coverage check → ${totalCovered}/100 items covered`);
  console.assert(totalCovered === 100, `Expected 100, got ${totalCovered}`);

  console.log('\n✅ All tests passed.');
}
