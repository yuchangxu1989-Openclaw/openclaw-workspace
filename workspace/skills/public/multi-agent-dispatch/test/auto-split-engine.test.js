'use strict';

const assert = require('assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { DispatchEngine } = require('../dispatch-engine');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-split-engine-'));

function makeEngine(opts = {}) {
  return new DispatchEngine({
    baseDir: tmpDir,
    maxSlots: opts.maxSlots || 19,
    stateFile: path.join(tmpDir, `state-${Date.now()}-${Math.random().toString(36).slice(2)}.json`),
    boardFile: path.join(tmpDir, `board-${Date.now()}-${Math.random().toString(36).slice(2)}.json`),
    ...opts,
  });
}

// ── Test 1: autoSplitEnqueue splits a batch task ──────────────────────────

{
  const engine = makeEngine({ maxSlots: 5 });
  const result = engine.autoSplitEnqueue({
    title: 'Run evals',
    payload: { items: ['e1', 'e2', 'e3', 'e4', 'e5', 'e6'], task: 'evaluate each' },
  });

  assert.strictEqual(result.split, true);
  assert.ok(result.tasks.length >= 2, `Expected >=2 shards, got ${result.tasks.length}`);
  assert.ok(result.rootTaskId, 'Should have rootTaskId');
  assert.strictEqual(result.pattern, 'payload_items');
  console.log(`  Split into ${result.tasks.length} shards ✓`);
}

// ── Test 2: autoSplitEnqueue falls back for non-batch task ────────────────

{
  const engine = makeEngine();
  const result = engine.autoSplitEnqueue({
    title: 'Single task',
    payload: { task: 'do one thing' },
  });

  assert.strictEqual(result.split, false);
  assert.strictEqual(result.tasks.length, 1);
  console.log('  Non-batch task → normal enqueue ✓');
}

// ── Test 3: Sub-tasks are independent (partial failure) ───────────────────

{
  const engine = makeEngine({ maxSlots: 10 });
  const result = engine.autoSplitEnqueue({
    title: 'Process files',
    payload: { items: ['f1', 'f2', 'f3'], task: 'process file' },
  });

  assert.strictEqual(result.split, true);
  const tasks = result.tasks;

  // Mark first as done, second as failed — third should still be fine
  for (const t of tasks) {
    // Move spawning → running
    try { engine.markRunning(t.taskId, { sessionKey: `sess-${t.taskId}` }); } catch {}
  }

  engine.markDone(tasks[0].taskId, { result: 'ok' });
  engine.markFailed(tasks[1].taskId, { error: 'disk full' });
  engine.markDone(tasks[2].taskId, { result: 'ok' });

  // Verify partial failure doesn't crash — each subtask independent
  const state = engine.reload();
  const finishedIds = state.finished.map(t => t.taskId);
  assert.ok(finishedIds.includes(tasks[0].taskId), 'Task 0 should be finished');
  assert.ok(finishedIds.includes(tasks[1].taskId), 'Task 1 should be finished');
  assert.ok(finishedIds.includes(tasks[2].taskId), 'Task 2 should be finished');
  const t1 = state.finished.find(t => t.taskId === tasks[0].taskId);
  const t2 = state.finished.find(t => t.taskId === tasks[1].taskId);
  assert.strictEqual(t1.status, 'done');
  assert.strictEqual(t2.status, 'failed');
  console.log('  Partial failure isolation ✓');
}

// ── Test 4: Respects opt-out ──────────────────────────────────────────────

{
  const engine = makeEngine();
  const result = engine.autoSplitEnqueue({
    title: 'Batch but opt out',
    payload: { items: ['a', 'b', 'c'], noAutoSplit: true },
  });

  assert.strictEqual(result.split, false);
  console.log('  Opt-out respected ✓');
}

// ── Test 5: Chinese NL detection ──────────────────────────────────────────

{
  const engine = makeEngine({ maxSlots: 19 });
  const result = engine.autoSplitEnqueue({
    title: '跑8条eval测试',
    payload: { count: 8, task: '运行评估' },
  });

  assert.strictEqual(result.split, true);
  assert.strictEqual(result.tasks.length, 8);
  console.log('  Chinese NL + count detection ✓');
}

// Cleanup
try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}

console.log('✅ All autoSplitEnqueue integration tests passed');
