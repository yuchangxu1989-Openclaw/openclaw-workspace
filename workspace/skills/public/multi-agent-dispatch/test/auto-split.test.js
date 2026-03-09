'use strict';

const assert = require('assert');
const { analyzeSplittability, autoSplit, aggregateResults, chunkItems } = require('../auto-split');

// ── analyzeSplittability ─────────────────────────────────────────────────

// payload_items pattern
{
  const r = analyzeSplittability({ payload: { items: ['a', 'b', 'c'] } });
  assert.strictEqual(r.splittable, true);
  assert.strictEqual(r.pattern, 'payload_items');
  assert.strictEqual(r.count, 3);
}

// payload_items with files
{
  const r = analyzeSplittability({ payload: { files: ['/a.txt', '/b.txt'] } });
  assert.strictEqual(r.splittable, true);
  assert.strictEqual(r.itemLabel, 'file');
}

// payload_count
{
  const r = analyzeSplittability({ payload: { count: 10, itemLabel: 'eval' } });
  assert.strictEqual(r.splittable, true);
  assert.strictEqual(r.count, 10);
  assert.strictEqual(r.itemLabel, 'eval');
}

// single item — not splittable
{
  const r = analyzeSplittability({ payload: { items: ['only-one'] } });
  assert.strictEqual(r.splittable, false);
}

// Chinese NL: "跑10条eval"
{
  const r = analyzeSplittability({ title: '跑10条eval测试' });
  assert.strictEqual(r.splittable, true);
  assert.strictEqual(r.count, 10);
  assert.strictEqual(r.itemLabel, 'eval测试');
}

// English NL: "run 5 evaluations"
{
  const r = analyzeSplittability({ payload: { task: 'Please run 5 evaluations on the dataset' } });
  assert.strictEqual(r.splittable, true);
  assert.strictEqual(r.count, 5);
}

// opt-out
{
  const r = analyzeSplittability({ payload: { items: ['a', 'b'], noAutoSplit: true } });
  assert.strictEqual(r.splittable, false);
  assert.strictEqual(r.reason, 'opt-out');
}

// already a child
{
  const r = analyzeSplittability({ payload: { items: ['a', 'b'], splitFromTaskId: 'root_123' } });
  assert.strictEqual(r.splittable, false);
  assert.strictEqual(r.reason, 'already-child');
}

// ── autoSplit ────────────────────────────────────────────────────────────

// Split 6 items with max concurrency 3 → 3 shards of 2 items each
{
  const items = ['a', 'b', 'c', 'd', 'e', 'f'];
  const shards = autoSplit(
    { title: 'process files', payload: { items, task: 'analyze each file' } },
    { maxConcurrency: 3 }
  );
  assert.strictEqual(shards.length, 3);
  assert.strictEqual(shards[0].payload.items.length, 2);
  assert.deepStrictEqual(shards[0].payload.items, ['a', 'b']);
  assert.strictEqual(shards[0].payload.noAutoSplit, true); // prevent re-split
  assert.strictEqual(shards[0].parentTaskId, shards[1].parentTaskId); // same root
  assert.strictEqual(shards[0].phaseIndex, 1);
  assert.strictEqual(shards[2].phaseIndex, 3);
  assert.strictEqual(shards[0].phaseCount, 3);
}

// Split count-based (no items array)
{
  const shards = autoSplit(
    { title: '跑10条eval', payload: { count: 10 } },
    { maxConcurrency: 5 }
  );
  assert.strictEqual(shards.length, 5);
  assert.strictEqual(shards[0].payload.itemCount, 2);
  assert.strictEqual(shards[0].payload.itemOffset, 0);
  assert.strictEqual(shards[4].payload.itemOffset, 8);
}

// Non-splittable returns empty
{
  const shards = autoSplit({ title: 'simple task' });
  assert.strictEqual(shards.length, 0);
}

// ── aggregateResults ─────────────────────────────────────────────────────

{
  const tasks = [
    { taskId: 't1', status: 'done', title: 'shard 1', result: 'ok', duration: '2s', phaseIndex: 1 },
    { taskId: 't2', status: 'done', title: 'shard 2', result: 'ok', duration: '3s', phaseIndex: 2 },
    { taskId: 't3', status: 'failed', title: 'shard 3', error: 'timeout', duration: '5s', phaseIndex: 3 },
  ];
  const agg = aggregateResults(tasks);
  assert.strictEqual(agg.total, 3);
  assert.strictEqual(agg.succeeded, 2);
  assert.strictEqual(agg.failed, 1);
  assert.strictEqual(agg.allSucceeded, false);
  assert.strictEqual(agg.results.length, 2);
  assert.strictEqual(agg.errors.length, 1);
  assert.ok(agg.summary.includes('2/3'));
}

// All succeed
{
  const agg = aggregateResults([
    { taskId: 't1', status: 'done', result: 'a' },
    { taskId: 't2', status: 'done', result: 'b' },
  ]);
  assert.strictEqual(agg.allSucceeded, true);
}

// ── chunkItems ───────────────────────────────────────────────────────────

{
  const chunks = chunkItems(7, null, 3);
  assert.strictEqual(chunks.length, 3);
  assert.strictEqual(chunks[0].size, 3);
  assert.strictEqual(chunks[1].size, 3);
  assert.strictEqual(chunks[2].size, 1);
}

{
  const chunks = chunkItems(4, ['a', 'b', 'c', 'd'], 2);
  assert.strictEqual(chunks.length, 2);
  assert.deepStrictEqual(chunks[0].items, ['a', 'b']);
  assert.deepStrictEqual(chunks[1].items, ['c', 'd']);
}

// ── Integration: autoSplit preserves tags, model, priority ───────────────

{
  const shards = autoSplit({
    title: 'batch job',
    model: 'boom-coder/gpt-5.3',
    agentId: 'coder',
    priority: 'high',
    tags: ['eval', 'important'],
    payload: { items: ['x', 'y', 'z'], task: 'process each' },
  }, { maxConcurrency: 19 });

  assert.strictEqual(shards.length, 3);
  for (const s of shards) {
    assert.strictEqual(s.model, 'boom-coder/gpt-5.3');
    assert.strictEqual(s.agentId, 'coder');
    assert.strictEqual(s.priority, 'high');
    assert.ok(s.tags.includes('eval'));
    assert.ok(s.tags.includes('auto-split'));
    assert.strictEqual(s.source, 'auto-split');
  }
}

console.log('✅ All auto-split tests passed');
