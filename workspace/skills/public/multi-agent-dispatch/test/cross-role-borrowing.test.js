'use strict';

/**
 * CHANGE 4: Cross-role borrowing tests.
 *
 * When a task's preferred role is occupied, automatically find an idle role
 * and borrow it. Tasks are not bound to role semantics — they only need a
 * model key. This maximizes key utilization across all 8 roles.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  DispatchEngine,
  parseProviderModelKey,
  buildBorrowedModelKey,
  BORROW_PRIORITY,
  ALL_AGENT_ROLES,
} = require('../dispatch-engine');

function tmpEngine(opts = {}) {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-borrow-'));
  return new DispatchEngine({ baseDir, maxSlots: opts.maxSlots ?? 19, ...opts });
}

// ── parseProviderModelKey ────────────────────────────────────────────────────

describe('parseProviderModelKey', () => {
  test('parses boom-coder/gpt-5.3-codex', () => {
    const r = parseProviderModelKey('boom-coder/gpt-5.3-codex');
    expect(r).toEqual({
      providerFamily: 'boom',
      role: 'coder',
      modelId: 'gpt-5.3-codex',
      suffix: '',
      original: 'boom-coder/gpt-5.3-codex',
    });
  });

  test('parses claude-researcher/claude-opus-4-6-thinking', () => {
    const r = parseProviderModelKey('claude-researcher/claude-opus-4-6-thinking');
    expect(r.providerFamily).toBe('claude');
    expect(r.role).toBe('researcher');
    expect(r.modelId).toBe('claude-opus-4-6-thinking');
  });

  test('parses -02 suffixed provider', () => {
    const r = parseProviderModelKey('boom-coder-02/gpt-5.3-codex');
    expect(r.providerFamily).toBe('boom');
    expect(r.role).toBe('coder');
    expect(r.modelId).toBe('gpt-5.3-codex');
    expect(r.suffix).toBe('-02');
  });

  test('parses hyphenated role: cron-worker', () => {
    const r = parseProviderModelKey('boom-cron-worker/gpt-5.3-codex');
    expect(r.providerFamily).toBe('boom');
    expect(r.role).toBe('cron-worker');
    expect(r.modelId).toBe('gpt-5.3-codex');
  });

  test('returns null for unqualified model', () => {
    expect(parseProviderModelKey('gpt-5.3-codex')).toBeNull();
  });

  test('returns null for empty/null', () => {
    expect(parseProviderModelKey(null)).toBeNull();
    expect(parseProviderModelKey('')).toBeNull();
  });
});

// ── buildBorrowedModelKey ────────────────────────────────────────────────────

describe('buildBorrowedModelKey', () => {
  test('borrows boom-coder → boom-scout', () => {
    const parsed = parseProviderModelKey('boom-coder/gpt-5.3-codex');
    expect(buildBorrowedModelKey(parsed, 'scout')).toBe('boom-scout/gpt-5.3-codex');
  });

  test('borrows claude-coder → claude-analyst', () => {
    const parsed = parseProviderModelKey('claude-coder/claude-opus-4-6');
    expect(buildBorrowedModelKey(parsed, 'analyst')).toBe('claude-analyst/claude-opus-4-6');
  });

  test('preserves -02 suffix during borrow', () => {
    const parsed = parseProviderModelKey('boom-coder-02/gpt-5.3-codex');
    expect(buildBorrowedModelKey(parsed, 'writer')).toBe('boom-writer-02/gpt-5.3-codex');
  });

  test('borrows cron-worker → scout', () => {
    const parsed = parseProviderModelKey('boom-cron-worker/gpt-5.3-codex');
    expect(buildBorrowedModelKey(parsed, 'scout')).toBe('boom-scout/gpt-5.3-codex');
  });
});

// ── BORROW_PRIORITY ──────────────────────────────────────────────────────────

describe('BORROW_PRIORITY', () => {
  test('has correct order: scout first, coder last', () => {
    expect(BORROW_PRIORITY[0]).toBe('scout');
    expect(BORROW_PRIORITY[BORROW_PRIORITY.length - 1]).toBe('coder');
  });

  test('contains 7 non-main agent roles', () => {
    expect(BORROW_PRIORITY).toHaveLength(7);
    for (const role of ['researcher', 'coder', 'reviewer', 'writer', 'analyst', 'scout', 'cron-worker']) {
      expect(BORROW_PRIORITY).toContain(role);
    }
    expect(BORROW_PRIORITY).not.toContain('main');
  });
});

// ── Core borrowing behavior ──────────────────────────────────────────────────

describe('CHANGE 4: Cross-role borrowing', () => {

  test('task borrows idle role when preferred role is occupied', () => {
    const e = tmpEngine({ maxSlots: 19 });

    // Occupy coder
    const t1 = e.enqueue({ title: 'Coder task', agentId: 'coder', model: 'boom-coder/gpt-5.3-codex' });

    // Second coder task should borrow an idle role (scout is first in borrow priority)
    const t2 = e.enqueue({ title: 'Extra coder', agentId: 'coder', model: 'boom-coder/gpt-5.3-codex' });

    const s = e._load();
    // Both should be active (t2 borrowed a role)
    expect(s.spawning[t1.taskId]).toBeTruthy();
    expect(s.spawning[t2.taskId]).toBeTruthy();
    expect(Object.keys(s.queued)).toHaveLength(0);

    // t2 should have borrowing metadata
    const borrowed = s.spawning[t2.taskId];
    expect(borrowed.borrowedFrom).toBeTruthy();
    expect(borrowed.borrowedFrom.originalRole).toBe('coder');
    expect(borrowed.borrowedFrom.borrowedRole).toBe('scout'); // first in borrow priority
    expect(borrowed.borrowedFrom.originalModelKey).toBe('boom-coder/gpt-5.3-codex');
    expect(borrowed.borrowedFrom.borrowedModelKey).toBe('boom-scout/gpt-5.3-codex');

    // model key should be rewritten to borrowed key
    expect(borrowed.runtimeModelKey).toBe('boom-scout/gpt-5.3-codex');
    expect(borrowed.model).toBe('boom-scout/gpt-5.3-codex');
    // agentId should be updated to borrowed role
    expect(borrowed.agentId).toBe('scout');
  });

  test('borrowing follows priority order: scout > cron-worker > analyst > ...', () => {
    const e = tmpEngine({ maxSlots: 19 });

    // Occupy coder
    e.enqueue({ title: 'Coder', agentId: 'coder', model: 'boom-coder/gpt-5.3-codex' });

    // Occupy scout (first borrow candidate)
    e.enqueue({ title: 'Scout', agentId: 'scout', model: 'boom-scout/gpt-5.3-codex' });

    // Extra coder task should borrow cron-worker (next in priority)
    const t3 = e.enqueue({ title: 'Extra coder', agentId: 'coder', model: 'boom-coder/gpt-5.3-codex' });

    const s = e._load();
    expect(s.spawning[t3.taskId]).toBeTruthy();
    expect(s.spawning[t3.taskId].borrowedFrom.borrowedRole).toBe('cron-worker');
  });

  test('no borrowing when all roles are occupied → task queues', () => {
    const e = tmpEngine({ maxSlots: 19 });
    const roles = ['researcher', 'coder', 'reviewer', 'writer', 'analyst', 'scout', 'cron-worker'];

    // Fill all 8 roles
    for (const role of roles) {
      e.enqueue({ title: `Fill ${role}`, agentId: role, model: `boom-${role}/gpt-5.3-codex` });
    }

    // Extra task → no idle role → must queue
    const tExtra = e.enqueue({ title: 'Overflow', agentId: 'coder', model: 'boom-coder/gpt-5.3-codex' });

    const s = e._load();
    expect(s.queued[tExtra.taskId]).toBeTruthy();
    expect(Object.keys(s.spawning)).toHaveLength(7);
  });

  test('borrowed task frees the borrowed role when completed', () => {
    const e = tmpEngine({ maxSlots: 19 });

    e.enqueue({ title: 'Coder', agentId: 'coder', model: 'boom-coder/gpt-5.3-codex' });
    const t2 = e.enqueue({ title: 'Extra coder', agentId: 'coder', model: 'boom-coder/gpt-5.3-codex' });

    // t2 should have borrowed scout
    const s1 = e._load();
    expect(s1.spawning[t2.taskId].borrowedFrom.borrowedRole).toBe('scout');

    // Complete borrowed task → scout role should be free again
    e.markRunning(t2.taskId);
    e.markDone(t2.taskId);

    const occupiedRoles = e.occupiedRoles();
    expect(occupiedRoles.has('scout')).toBe(false); // freed
    expect(occupiedRoles.has('coder')).toBe(true);  // original still active
  });

  test('multiple tasks can borrow different idle roles', () => {
    const e = tmpEngine({ maxSlots: 19 });

    // Occupy coder
    e.enqueue({ title: 'Coder 1', agentId: 'coder', model: 'boom-coder/gpt-5.3-codex' });

    // 3 more coder tasks → each borrows a different idle role
    const t2 = e.enqueue({ title: 'Coder 2', agentId: 'coder', model: 'boom-coder/gpt-5.3-codex' });
    const t3 = e.enqueue({ title: 'Coder 3', agentId: 'coder', model: 'claude-coder/claude-opus-4-6' });
    const t4 = e.enqueue({ title: 'Coder 4', agentId: 'coder', model: 'claude-coder/claude-opus-4-6' });

    const s = e._load();
    // All 4 should be active
    expect(Object.keys(s.spawning)).toHaveLength(4);
    expect(Object.keys(s.queued)).toHaveLength(0);

    // Each borrowed a different role
    const borrowedRoles = [t2, t3, t4]
      .map(t => s.spawning[t.taskId]?.borrowedFrom?.borrowedRole)
      .filter(Boolean);
    const uniqueRoles = new Set(borrowedRoles);
    expect(uniqueRoles.size).toBe(3);
  });

  test('borrowing preserves task priority ordering', () => {
    const e = tmpEngine({ maxSlots: 19 });

    // Occupy coder
    e.enqueue({ title: 'Coder', agentId: 'coder', model: 'boom-coder/gpt-5.3-codex' });

    // Occupy ALL other roles to prevent borrowing
    for (const role of ['researcher', 'reviewer', 'writer', 'analyst', 'scout', 'cron-worker']) {
      e.enqueue({ title: `Fill ${role}`, agentId: role, model: `boom-${role}/gpt-5.3-codex` });
    }

    // Queue two tasks with different priorities
    const tLow = e.enqueue({ title: 'Low', agentId: 'coder', model: 'boom-coder/gpt-5.3-codex', priority: 'low' });
    const tHigh = e.enqueue({ title: 'High', agentId: 'coder', model: 'claude-coder/claude-opus-4-6', priority: 'high' });

    // Both should be queued
    const s1 = e._load();
    expect(s1.queued[tLow.taskId]).toBeTruthy();
    expect(s1.queued[tHigh.taskId]).toBeTruthy();

    // Free one role
    const scoutId = Object.values(s1.spawning).find(t => t.agentId === 'scout').taskId;
    e.markRunning(scoutId);
    e.markDone(scoutId);

    // High priority should borrow the freed role first
    const s2 = e._load();
    expect(s2.spawning[tHigh.taskId] || s2.running[tHigh.taskId]).toBeTruthy();
    expect(s2.queued[tLow.taskId]).toBeTruthy();
  });

  test('tryBorrowRole returns null for unqualified model keys', () => {
    const e = tmpEngine({ maxSlots: 19 });
    const occupiedRoles = new Set(['coder']);
    const occupiedKeys = new Set();

    const result = e.tryBorrowRole(
      { agentId: 'coder', model: 'gpt-5.3-codex', runtimeModelKey: 'gpt-5.3-codex' },
      occupiedRoles,
      occupiedKeys,
    );

    expect(result).toBeNull();
  });

  test('tryBorrowRole skips roles whose borrowed key would collide', () => {
    const e = tmpEngine({ maxSlots: 19 });
    const occupiedRoles = new Set(['coder']);
    // scout key already occupied
    const occupiedKeys = new Set(['boom-scout/gpt-5.3-codex']);

    const result = e.tryBorrowRole(
      { agentId: 'coder', model: 'boom-coder/gpt-5.3-codex', runtimeModelKey: 'boom-coder/gpt-5.3-codex' },
      occupiedRoles,
      occupiedKeys,
    );

    // Should skip scout (key collision) and try cron-worker
    expect(result).toBeTruthy();
    expect(result.borrowedRole).toBe('cron-worker');
    expect(result.borrowedModelKey).toBe('boom-cron-worker/gpt-5.3-codex');
  });

  test('borrowing records original agentId in payload.originalAgentId', () => {
    const e = tmpEngine({ maxSlots: 19 });

    e.enqueue({ title: 'Coder', agentId: 'coder', model: 'boom-coder/gpt-5.3-codex' });
    const t2 = e.enqueue({ title: 'Extra', agentId: 'coder', model: 'boom-coder/gpt-5.3-codex' });

    const s = e._load();
    const task = s.spawning[t2.taskId];
    expect(task.payload.originalAgentId).toBe('coder');
    expect(task.agentId).not.toBe('coder');
  });

  test('event log records borrowing details', () => {
    const e = tmpEngine({ maxSlots: 19 });

    e.enqueue({ title: 'Coder', agentId: 'coder', model: 'boom-coder/gpt-5.3-codex' });
    e.enqueue({ title: 'Extra', agentId: 'coder', model: 'boom-coder/gpt-5.3-codex' });

    const s = e._load();
    const dispatchEvents = s.eventLog.filter(ev => ev.type === 'dispatched' && ev.borrowed);
    expect(dispatchEvents.length).toBeGreaterThanOrEqual(1);
    const borrowEvent = dispatchEvents[0];
    expect(borrowEvent.borrowed.from).toBe('coder');
    expect(borrowEvent.borrowed.to).toBeTruthy();
  });

  test('direct candidates are preferred over borrowing', () => {
    const e = tmpEngine({ maxSlots: 19 });

    // Occupy coder
    e.enqueue({ title: 'Coder', agentId: 'coder', model: 'boom-coder/gpt-5.3-codex' });

    // Enqueue a writer task (direct candidate, no borrowing needed) AND a coder task (needs borrow)
    const tWriter = e.enqueue({ title: 'Writer', agentId: 'writer', model: 'boom-writer/gpt-5.3-codex' });
    const tCoder = e.enqueue({ title: 'Extra coder', agentId: 'coder', model: 'boom-coder/gpt-5.3-codex' });

    const s = e._load();
    // Writer should dispatch directly (no borrowing)
    expect(s.spawning[tWriter.taskId]).toBeTruthy();
    expect(s.spawning[tWriter.taskId].borrowedFrom).toBeFalsy();

    // Coder should dispatch via borrowing
    expect(s.spawning[tCoder.taskId]).toBeTruthy();
    expect(s.spawning[tCoder.taskId].borrowedFrom).toBeTruthy();
  });

  test('borrowed tasks appear in liveBoard with correct metadata', () => {
    const e = tmpEngine({ maxSlots: 19 });

    e.enqueue({ title: 'Coder', agentId: 'coder', model: 'boom-coder/gpt-5.3-codex' });
    e.enqueue({ title: 'Borrowed', agentId: 'coder', model: 'boom-coder/gpt-5.3-codex' });

    const board = e.liveBoard();
    expect(board.summary.busySlots).toBe(2);
    // The borrowed task should use a different runtimeModelKey
    const runtimeKeys = board.spawning.map(t => t.runtimeModelKey);
    expect(runtimeKeys).toContain('boom-coder/gpt-5.3-codex');
    // runtimeModelKey should reflect the borrowed role
    expect(runtimeKeys.some(k => k.includes('scout') || k.includes('cron-worker'))).toBe(true);
  });
});
