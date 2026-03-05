/**
 * rule-dedup-deep.test.js — Phase 1 + Phase 2 去重测试
 */
'use strict';

const {
  parseArgs,
  extractEvents,
  eventOverlap,
  phase2Check,
  fallbackDeepCheck,
  callGLM5,
} = require('../../scripts/check-rule-dedup.js');

// ─── Helpers ────────────────────────────────────────────────────────────────

function mkRule(id, events, opts = {}) {
  return {
    id,
    name: opts.name || id,
    description: opts.description || `Rule ${id}`,
    trigger: {
      events: events,
      conditions: opts.conditions || [],
      actions: opts.actions || [],
    },
    action: { handler: opts.handler || 'default', type: opts.type || 'log' },
    conditions: opts.topConditions || [],
  };
}

// ─── Phase 1: Event extraction ──────────────────────────────────────────────

describe('Phase 1: extractEvents', () => {
  test('extracts from trigger.events array', () => {
    const r = mkRule('r1', ['file.changed', 'file.deleted']);
    expect(extractEvents(r)).toEqual(expect.arrayContaining(['file.changed', 'file.deleted']));
  });

  test('extracts from trigger.conditions event_name', () => {
    const r = { trigger: { conditions: [{ event_name: 'rule.created' }] } };
    expect(extractEvents(r)).toContain('rule.created');
  });

  test('extracts from auto_trigger.on_events', () => {
    const r = { auto_trigger: { on_events: ['startup'] } };
    expect(extractEvents(r)).toContain('startup');
  });

  test('returns empty for empty rule', () => {
    expect(extractEvents({})).toEqual([]);
  });
});

// ─── Phase 1: Event overlap ─────────────────────────────────────────────────

describe('Phase 1: eventOverlap', () => {
  test('no overlap = 0', () => {
    expect(eventOverlap(['a', 'b'], ['c', 'd'])).toBe(0);
  });

  test('full overlap = 1', () => {
    expect(eventOverlap(['a', 'b'], ['a', 'b'])).toBe(1);
  });

  test('partial overlap', () => {
    // {a,b} ∩ {b,c} = {b}, union = {a,b,c}, overlap = 1/3
    expect(eventOverlap(['a', 'b'], ['b', 'c'])).toBeCloseTo(1/3);
  });

  test('empty events = 0', () => {
    expect(eventOverlap([], ['a'])).toBe(0);
    expect(eventOverlap(['a'], [])).toBe(0);
  });

  // Phase 1 快筛: event无交集 → 放行
  test('no intersection → pass (Phase 1 gate)', () => {
    const overlap = eventOverlap(['file.changed'], ['rule.created']);
    expect(overlap).toBe(0);
    // overlap < 0.5 → Phase 2 skipped → pass
  });
});

// ─── Phase 2: Fallback deep check ──────────────────────────────────────────

describe('Phase 2: fallbackDeepCheck', () => {
  test('identical rules → DUPLICATE', () => {
    const r = mkRule('r1', ['e1'], { description: 'do X', handler: 'h1' });
    const result = fallbackDeepCheck(r, { ...r, id: 'r2' });
    expect(result.duplicate).toBe(true);
    expect(result.intent_equivalent).toBe(true);
    expect(result.event_chain_equivalent).toBe(true);
    expect(result.execution_equivalent).toBe(true);
    expect(result.method).toBe('fallback');
  });

  test('same intent, different events → NOT DUPLICATE', () => {
    const a = mkRule('r1', ['e1'], { description: 'do X', handler: 'h1' });
    const b = mkRule('r2', ['e2'], { description: 'do X', handler: 'h1' });
    const result = fallbackDeepCheck(a, b);
    expect(result.duplicate).toBe(false);
    expect(result.event_chain_equivalent).toBe(false);
  });

  test('same events, different handler → NOT DUPLICATE', () => {
    const a = mkRule('r1', ['e1'], { description: 'do X', handler: 'h1' });
    const b = mkRule('r2', ['e1'], { description: 'do X', handler: 'h2' });
    const result = fallbackDeepCheck(a, b);
    expect(result.duplicate).toBe(false);
    expect(result.execution_equivalent).toBe(false);
  });

  test('different description → intent not equivalent', () => {
    const a = mkRule('r1', ['e1'], { description: 'protect files' });
    const b = mkRule('r2', ['e1'], { description: 'clean temp' });
    const result = fallbackDeepCheck(a, b);
    expect(result.intent_equivalent).toBe(false);
    expect(result.duplicate).toBe(false);
  });
});

// ─── Phase 2: LLM integration ──────────────────────────────────────────────

describe('Phase 2: phase2Check', () => {
  test('no API key → fallback', async () => {
    const a = mkRule('r1', ['e1'], { name: 'same', description: 'do X', handler: 'h1' });
    const b = mkRule('r2', ['e1'], { name: 'same', description: 'do X', handler: 'h1' });
    const result = await phase2Check(a, b, null);
    expect(result.method).toBe('fallback');
    expect(result.duplicate).toBe(true);
  });

  test('GLM-5 unavailable → fallback with llm_error', async () => {
    const a = mkRule('r1', ['e1']);
    const b = mkRule('r2', ['e1']);
    // Use a fake key that will fail
    const result = await phase2Check(a, b, 'fake-key-xxx');
    expect(result.method).toBe('fallback');
    expect(result.llm_error).toBeDefined();
  });
});

// ─── Phase 2: callGLM5 timeout ─────────────────────────────────────────────

describe('Phase 2: callGLM5 timeout', () => {
  test('times out with short timeout', async () => {
    // 1ms timeout should always fail
    await expect(callGLM5('test', 'fake-key', 1)).rejects.toThrow();
  });
});

// ─── Args parsing ───────────────────────────────────────────────────────────

describe('parseArgs', () => {
  test('--quick mode', () => {
    const opts = parseArgs(['node', 'script', 'file.json', '--quick']);
    expect(opts.mode).toBe('quick');
    expect(opts.file).toContain('file.json');
  });

  test('--deep mode', () => {
    const opts = parseArgs(['node', 'script', 'file.json', '--deep']);
    expect(opts.mode).toBe('deep');
  });

  test('--scan-all flag', () => {
    const opts = parseArgs(['node', 'script', '--scan-all']);
    expect(opts.scanAll).toBe(true);
  });

  test('default is quick', () => {
    const opts = parseArgs(['node', 'script', 'file.json']);
    expect(opts.mode).toBe('quick');
  });
});
