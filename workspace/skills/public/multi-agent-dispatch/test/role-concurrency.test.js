'use strict';

/**
 * CHANGE 1: Role concurrency limit tests.
 * CHANGE 4: Cross-role borrowing modifies behavior — when a role is occupied
 *           and idle roles exist, tasks borrow instead of queuing.
 *
 * These tests verify both strict 1-per-role and borrowing interactions.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { DispatchEngine, BORROW_PRIORITY } = require('../dispatch-engine');

function tmpEngine(opts = {}) {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-role-'));
  return new DispatchEngine({ baseDir, maxSlots: opts.maxSlots ?? 19, ...opts });
}

describe('CHANGE 1: Role concurrency limit', () => {

  test('only 1 task per agent role can be active at a time (no borrowing when all roles full)', () => {
    const e = tmpEngine({ maxSlots: 19 });
    const roles = ['researcher', 'coder', 'reviewer', 'writer', 'analyst', 'scout', 'cron-worker'];

    // Fill ALL 8 roles so no borrowing is possible
    for (const role of roles) {
      e.enqueue({ title: `Fill ${role}`, agentId: role, model: `boom-${role}/gpt-5.3-codex` });
    }

    // Now enqueue a 2nd coder task — no idle role to borrow → must queue
    const t_extra = e.enqueue({ title: 'Extra coder', agentId: 'coder', model: 'boom-coder/gpt-5.3-codex' });

    const s = e._load();
    expect(s.queued[t_extra.taskId]).toBeTruthy();
    expect(Object.keys(s.spawning)).toHaveLength(7);
  });

  test('different roles can run concurrently', () => {
    const e = tmpEngine({ maxSlots: 19 });

    const t1 = e.enqueue({ title: 'Code task', agentId: 'coder', model: 'boom-coder/gpt-5.3-codex' });
    const t2 = e.enqueue({ title: 'Research task', agentId: 'researcher', model: 'boom-researcher/gpt-5.3-codex' });
    const t3 = e.enqueue({ title: 'Review task', agentId: 'reviewer', model: 'boom-reviewer/gpt-5.3-codex' });

    const s = e._load();

    // All 3 should be active (different roles)
    expect(s.spawning[t1.taskId]).toBeTruthy();
    expect(s.spawning[t2.taskId]).toBeTruthy();
    expect(s.spawning[t3.taskId]).toBeTruthy();
    expect(Object.keys(s.queued)).toHaveLength(0);
  });

  test('max parallel = number of distinct agent roles (when all same-model tasks)', () => {
    const e = tmpEngine({ maxSlots: 19 });
    const roles = ['researcher', 'coder', 'reviewer', 'writer', 'analyst', 'scout', 'cron-worker'];

    // Enqueue one task per role
    const tasks = roles.map(role =>
      e.enqueue({ title: `Task for ${role}`, agentId: role, model: `boom-${role}/gpt-5.3-codex` })
    );

    const s = e._load();
    expect(Object.keys(s.spawning)).toHaveLength(roles.length);
    expect(Object.keys(s.queued)).toHaveLength(0);
  });

  test('all roles occupied → extra tasks must queue', () => {
    const e = tmpEngine({ maxSlots: 19 });
    const roles = ['researcher', 'coder', 'reviewer', 'writer', 'analyst', 'scout', 'cron-worker'];

    // Fill all roles
    for (const role of roles) {
      e.enqueue({ title: `Fill ${role}`, agentId: role, model: `boom-${role}/gpt-5.3-codex` });
    }

    // Now add more for each role — no borrowing possible, must queue
    const extraTasks = roles.map(role =>
      e.enqueue({ title: `Extra for ${role}`, agentId: role, model: `claude-${role}/claude-opus-4-6` })
    );

    const s2 = e._load();
    expect(Object.keys(s2.spawning)).toHaveLength(roles.length);
    expect(Object.keys(s2.queued)).toHaveLength(roles.length);
  });

  test('queued task dispatches when role slot frees up', () => {
    const e = tmpEngine({ maxSlots: 19 });
    const roles = ['researcher', 'coder', 'reviewer', 'writer', 'analyst', 'scout', 'cron-worker'];

    // Fill all roles
    for (const role of roles) {
      e.enqueue({ title: `Fill ${role}`, agentId: role, model: `boom-${role}/gpt-5.3-codex` });
    }

    // Add extra coder task — queued because all roles full
    const t_extra = e.enqueue({ title: 'Extra coder', agentId: 'coder', model: 'boom-coder/gpt-5.3-codex' });
    expect(e._load().queued[t_extra.taskId]).toBeTruthy();

    // Complete the coder task → extra should auto-dispatch
    const coderTaskId = Object.values(e._load().spawning).find(t =>
      t.agentId === 'coder' && t.title === 'Fill coder'
    ).taskId;
    e.markRunning(coderTaskId);
    e.markDone(coderTaskId);

    const s = e._load();
    expect(s.spawning[t_extra.taskId] || s.running[t_extra.taskId]).toBeTruthy();
    expect(Object.keys(s.queued)).toHaveLength(0);
  });

  test('failed task frees role for next queued task', () => {
    const e = tmpEngine({ maxSlots: 19 });
    const roles = ['researcher', 'coder', 'reviewer', 'writer', 'analyst', 'scout', 'cron-worker'];
    for (const role of roles) {
      e.enqueue({ title: `Fill ${role}`, agentId: role, model: `boom-${role}/gpt-5.3-codex` });
    }

    const t_extra = e.enqueue({ title: 'Extra coder', agentId: 'coder', model: 'boom-coder/gpt-5.3-codex' });

    const coderTaskId = Object.values(e._load().spawning).find(t =>
      t.agentId === 'coder' && t.title === 'Fill coder'
    ).taskId;
    e.markRunning(coderTaskId);
    e.markFailed(coderTaskId, { error: 'oops' });

    const s = e._load();
    expect(s.spawning[t_extra.taskId]).toBeTruthy();
  });

  test('cancelled task frees role for next queued task', () => {
    const e = tmpEngine({ maxSlots: 19 });
    const roles = ['researcher', 'coder', 'reviewer', 'writer', 'analyst', 'scout', 'cron-worker'];
    for (const role of roles) {
      e.enqueue({ title: `Fill ${role}`, agentId: role, model: `boom-${role}/gpt-5.3-codex` });
    }

    const t_extra = e.enqueue({ title: 'Extra coder', agentId: 'coder', model: 'boom-coder/gpt-5.3-codex' });

    const coderTaskId = Object.values(e._load().spawning).find(t =>
      t.agentId === 'coder' && t.title === 'Fill coder'
    ).taskId;
    e.cancel(coderTaskId);

    const s = e._load();
    expect(s.spawning[t_extra.taskId]).toBeTruthy();
  });

  test('activeRoleMap correctly tracks occupied roles', () => {
    const e = tmpEngine({ maxSlots: 19 });

    e.enqueue({ title: 'C1', agentId: 'coder', model: 'boom-coder/gpt-5.3-codex' });
    e.enqueue({ title: 'R1', agentId: 'researcher', model: 'boom-researcher/gpt-5.3-codex' });

    const roleMap = e.activeRoleMap();
    expect(Object.keys(roleMap)).toContain('coder');
    expect(Object.keys(roleMap)).toContain('researcher');
    expect(roleMap['coder']).toHaveLength(1);
    expect(roleMap['researcher']).toHaveLength(1);
  });

  test('occupiedRoles returns Set of active role names', () => {
    const e = tmpEngine({ maxSlots: 19 });

    e.enqueue({ title: 'C1', agentId: 'coder', model: 'boom-coder/gpt-5.3-codex' });
    e.enqueue({ title: 'W1', agentId: 'writer', model: 'boom-writer/gpt-5.3-codex' });

    const roles = e.occupiedRoles();
    expect(roles.has('coder')).toBe(true);
    expect(roles.has('writer')).toBe(true);
    expect(roles.has('reviewer')).toBe(false);
  });

  test('tasks without agentId are not role-blocked', () => {
    const e = tmpEngine({ maxSlots: 19 });

    // Two tasks with no agentId and different model keys — should both dispatch
    const t1 = e.enqueue({ title: 'No role 1', model: 'boom-scout/gpt-5.3-codex' });
    const t2 = e.enqueue({ title: 'No role 2', model: 'boom-analyst/gpt-5.3-codex' });

    const s = e._load();
    // Both should be dispatched (no role to conflict on)
    expect(s.spawning[t1.taskId]).toBeTruthy();
    expect(s.spawning[t2.taskId]).toBeTruthy();
  });

  test('priority ordering still respected within role queue (all roles full)', () => {
    const e = tmpEngine({ maxSlots: 19 });
    const roles = ['researcher', 'coder', 'reviewer', 'writer', 'analyst', 'scout', 'cron-worker'];

    // Fill all roles
    for (const role of roles) {
      e.enqueue({ title: `Fill ${role}`, agentId: role, model: `boom-${role}/gpt-5.3-codex` });
    }

    // Queue tasks with different priorities for the same role
    const tLow = e.enqueue({ title: 'Low prio', agentId: 'coder', model: 'boom-coder/gpt-5.3-codex', priority: 'low' });
    const tHigh = e.enqueue({ title: 'High prio', agentId: 'coder', model: 'claude-coder/claude-opus-4-6', priority: 'high' });

    // Free the coder slot
    const coderTaskId = Object.values(e._load().spawning).find(t =>
      t.agentId === 'coder' && t.title === 'Fill coder'
    ).taskId;
    e.markRunning(coderTaskId);
    e.markDone(coderTaskId);

    // High priority should dispatch first
    const s = e._load();
    // tHigh should be dispatched, tLow still queued
    expect(s.spawning[tHigh.taskId] || s.running[tHigh.taskId]).toBeTruthy();
    expect(s.queued[tLow.taskId]).toBeTruthy();
  });

  test('role from payload.agentId is also enforced (all roles full)', () => {
    const e = tmpEngine({ maxSlots: 19 });
    const roles = ['researcher', 'coder', 'reviewer', 'writer', 'analyst', 'scout', 'cron-worker'];
    for (const role of roles) {
      e.enqueue({ title: `Fill ${role}`, agentId: role, model: `boom-${role}/gpt-5.3-codex` });
    }

    const t_extra = e.enqueue({ title: 'Extra', payload: { agentId: 'coder' }, model: 'boom-coder/gpt-5.3-codex' });

    const s = e._load();
    expect(s.queued[t_extra.taskId]).toBeTruthy();
  });
});
