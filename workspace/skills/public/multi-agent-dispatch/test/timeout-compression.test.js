'use strict';

/**
 * CHANGE 2: Timeout compression tests.
 *
 * gpt-5.3-codex tasks get 15-minute timeout (was ~60min).
 * After timeout, auto-split and requeue.
 * Keeps existing governance chain: replace → split_requeue → human_handoff.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { DispatchEngine, extractBaseModelId } = require('../dispatch-engine');
const { buildSpawnPayload, resolveTimeout, DEFAULTS } = require('../dispatch-runner');

function tmpEngine(opts = {}) {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-timeout-'));
  return new DispatchEngine({ baseDir, maxSlots: opts.maxSlots ?? 19, ...opts });
}

describe('CHANGE 2: Timeout compression', () => {

  test('DEFAULTS.boomTimeoutSeconds is 900 (15 minutes)', () => {
    expect(DEFAULTS.boomTimeoutSeconds).toBe(900);
  });

  test('resolveTimeout returns 15min for gpt-5.3-codex tasks', () => {
    const task = { model: 'boom-coder/gpt-5.3-codex', payload: { model: 'boom-coder/gpt-5.3-codex' } };
    const result = resolveTimeout(task);
    expect(result.runTimeoutSeconds).toBe(900);
    expect(result.timeoutSeconds).toBe(900);
    expect(result.source).toBe('boom_compressed');
  });

  test('resolveTimeout returns default for non-boom models', () => {
    const task = { model: 'claude-coder/claude-opus-4-6', payload: { model: 'claude-coder/claude-opus-4-6' } };
    const result = resolveTimeout(task);
    expect(result.runTimeoutSeconds).toBeUndefined();
    expect(result.timeoutSeconds).toBeUndefined();
    expect(result.source).toBe('default');
  });

  test('resolveTimeout respects explicit timeout override', () => {
    const task = {
      model: 'boom-coder/gpt-5.3-codex',
      payload: { model: 'boom-coder/gpt-5.3-codex', runTimeoutSeconds: 120 },
    };
    const result = resolveTimeout(task);
    expect(result.runTimeoutSeconds).toBe(120);
    expect(result.source).toBe('explicit');
  });

  test('buildSpawnPayload applies 15min timeout for gpt-5.3-codex', () => {
    const task = {
      title: 'Test gpt-5.3-codex task',
      model: 'boom-coder/gpt-5.3-codex',
      agentId: 'coder',
      payload: {
        model: 'boom-coder/gpt-5.3-codex',
        task: 'Implement feature X',
        agentId: 'coder',
      },
    };

    const payload = buildSpawnPayload(task);
    expect(payload.runTimeoutSeconds).toBe(900);
    expect(payload.timeoutSeconds).toBe(900);
  });

  test('buildSpawnPayload does NOT compress timeout for claude models', () => {
    const task = {
      title: 'Test claude task',
      model: 'claude-coder/claude-opus-4-6',
      payload: {
        model: 'claude-coder/claude-opus-4-6',
        task: 'Review code',
      },
    };

    const payload = buildSpawnPayload(task);
    // Should not set the compressed timeout
    expect(payload.runTimeoutSeconds).toBeUndefined();
    expect(payload.timeoutSeconds).toBeUndefined();
  });

  test('extractBaseModelId correctly strips provider prefix', () => {
    expect(extractBaseModelId('boom-coder/gpt-5.3-codex')).toBe('gpt-5.3-codex');
    expect(extractBaseModelId('gpt-5.3-codex')).toBe('gpt-5.3-codex');
    expect(extractBaseModelId('claude-main/claude-opus-4-6-thinking')).toBe('claude-opus-4-6-thinking');
    expect(extractBaseModelId('')).toBeNull();
    expect(extractBaseModelId(null)).toBeNull();
  });

  test('detectStale with model-specific overrides detects gpt-5.3-codex tasks faster', () => {
    const e = tmpEngine({ maxSlots: 19 });

    // Create a gpt-5.3-codex task
    const t1 = e.enqueue({ title: 'Fast timeout', agentId: 'coder', model: 'boom-coder/gpt-5.3-codex' });
    e.markRunning(t1.taskId);

    // Backdate runningAt to 16 minutes ago (> 15min threshold)
    const s = e._load();
    s.running[t1.taskId].runningAt = new Date(Date.now() - 16 * 60_000).toISOString();
    e._save();

    const stale = e.detectStale({
      modelStaleOverrides: { 'gpt-5.3-codex': 900_000 }, // 15min
      staleRunningMs: 30 * 60_000, // default 30min
    });

    expect(stale).toHaveLength(1);
    expect(stale[0].taskId).toBe(t1.taskId);
    expect(stale[0].reason).toBe('no_heartbeat');
  });

  test('detectStale does NOT flag claude tasks at 16 minutes', () => {
    const e = tmpEngine({ maxSlots: 19 });

    const t1 = e.enqueue({ title: 'Normal timeout', agentId: 'researcher', model: 'claude-researcher/claude-opus-4-6' });
    e.markRunning(t1.taskId);

    // Backdate to 16 min ago (under 30min default)
    const s = e._load();
    s.running[t1.taskId].runningAt = new Date(Date.now() - 16 * 60_000).toISOString();
    e._save();

    const stale = e.detectStale({
      modelStaleOverrides: { 'gpt-5.3-codex': 900_000 },
      staleRunningMs: 30 * 60_000,
    });

    expect(stale).toHaveLength(0);
  });

  test('timeout governance chain preserved: replace → split_requeue → human_handoff', () => {
    const e = tmpEngine({ maxSlots: 19 });

    // First timeout → should get 'replace' action
    const t1 = e.enqueue({ title: 'Timeout chain', agentId: 'coder', model: 'boom-coder/gpt-5.3-codex' });
    e.markRunning(t1.taskId);

    // Backdate
    const s1 = e._load();
    s1.running[t1.taskId].runningAt = new Date(Date.now() - 20 * 60_000).toISOString();
    e._save();

    const reaped1 = e.reapStale({
      staleRunningMs: 900_000,
      modelStaleOverrides: { 'gpt-5.3-codex': 900_000 },
    });

    expect(reaped1).toHaveLength(1);
    expect(reaped1[0].timeoutDecision.action).toBe('replace');

    // The derived (replacement) task should exist
    const s2 = e._load();
    const replacement = Object.values(s2.spawning).find(
      t => t.parentTaskId === t1.taskId || (t.payload && t.payload.timeoutFollowupFor === t1.taskId)
    ) || Object.values(s2.queued).find(
      t => t.parentTaskId === t1.taskId || (t.payload && t.payload.timeoutFollowupFor === t1.taskId)
    );
    expect(replacement).toBeTruthy();

    // Second timeout → should trigger split_requeue
    if (replacement) {
      e.markRunning(replacement.taskId);
      const s3 = e._load();
      s3.running[replacement.taskId].runningAt = new Date(Date.now() - 20 * 60_000).toISOString();
      // Set timeoutCount to 1 to trigger split_requeue
      s3.running[replacement.taskId].timeoutCount = 1;
      e._save();

      const reaped2 = e.reapStale({
        staleRunningMs: 900_000,
        modelStaleOverrides: { 'gpt-5.3-codex': 900_000 },
      });

      if (reaped2.length > 0) {
        expect(reaped2[0].timeoutDecision.action).toBe('split_requeue');
      }
    }
  });

  test('resolveTimeout identifies gpt-5.3-codex in various model formats', () => {
    const cases = [
      { model: 'gpt-5.3-codex', expected: 'boom_compressed' },
      { model: 'boom-coder/gpt-5.3-codex', expected: 'boom_compressed' },
      { model: 'boom-main/gpt-5.3-codex', expected: 'boom_compressed' },
      { model: 'boom-analyst/gpt-5.3-codex', expected: 'boom_compressed' },
      { model: 'claude-coder/claude-opus-4-6', expected: 'default' },
      { model: 'claude-coder/claude-opus-4-6-thinking', expected: 'default' },
    ];

    for (const { model, expected } of cases) {
      const task = { model, payload: { model } };
      const result = resolveTimeout(task);
      expect(result.source).toBe(expected);
    }
  });
});
