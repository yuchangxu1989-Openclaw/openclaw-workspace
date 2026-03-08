#!/usr/bin/env node
'use strict';

/**
 * activation-validation.js
 * ────────────────────────
 * End-to-end validation of DispatchEngine + ReportTrigger integration.
 * Runs against a temporary state file (no production mutation).
 *
 * Tests:
 *   1. Enqueue → immediate dispatch (Axiom 2)
 *   2. Slot exhaustion → queue overflow
 *   3. Slot freed (markDone) → instant backfill (Axiom 4)
 *   4. Report trigger fires on every lifecycle event
 *   5. 0-active report: shows completed/risks/decisions (not empty)
 *   6. Failed task → slot freed + backfill + risk in report
 *   7. Priority ordering (critical > high > normal > low)
 *   8. Batch enqueue + drain
 *   9. Stale detection + reap
 *  10. Full lifecycle: enqueue → spawn → running → done → report
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const { DispatchEngine } = require('../dispatch-engine');
// Integration test: requires sibling reporting skill (peer dependency)
let ReportTrigger;
try { ({ ReportTrigger } = require('../../multi-agent-reporting/report-trigger')); }
catch { console.error('multi-agent-reporting not found — skipping trigger tests'); process.exit(0); }

// ── Test infra ───────────────────────────────────────────────────────────────

let passed = 0, failed = 0;
const results = [];

function assert(cond, name, detail) {
  if (cond) {
    passed++;
    results.push({ name, ok: true });
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    results.push({ name, ok: false, detail: detail || '' });
    console.log(`  ❌ ${name}${detail ? ': ' + detail : ''}`);
  }
}

function makeEngine(slots = 3) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-val-'));
  return new DispatchEngine({
    baseDir: tmpDir,
    maxSlots: slots,
    stateFile: path.join(tmpDir, 'state.json'),
    boardFile: path.join(tmpDir, 'board.json'),
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════════════════════

console.log('\n🔬 DispatchEngine + ReportTrigger Activation Validation\n');

// ── T1: Enqueue → Immediate Dispatch ─────────────────────────────────────────
console.log('T1: Enqueue → Immediate Dispatch (Axiom 2)');
{
  const engine = makeEngine(3);
  const task = engine.enqueue({ title: 'test-1', agentId: 'coder' });
  assert(task.taskId, 'task has ID');
  // After enqueue, task should be in spawning (drained immediately)
  const s = engine._load();
  assert(s.spawning[task.taskId] !== undefined, 'task moved to spawning immediately');
  assert(Object.keys(s.queued).length === 0, 'queue is empty (no pending state)');
  assert(engine.busyCount() === 1, 'busyCount is 1');
  assert(engine.freeSlots() === 2, 'freeSlots is 2');
}

// ── T2: Slot Exhaustion → Queue Overflow ─────────────────────────────────────
console.log('\nT2: Slot Exhaustion → Queue Overflow');
{
  const engine = makeEngine(2);
  const t1 = engine.enqueue({ title: 'fill-1', agentId: 'coder' });
  const t2 = engine.enqueue({ title: 'fill-2', agentId: 'writer' });
  const t3 = engine.enqueue({ title: 'overflow-1', agentId: 'researcher' });
  assert(engine.busyCount() === 2, '2 slots occupied');
  assert(engine.freeSlots() === 0, '0 free slots');
  assert(engine.queueDepth() === 1, '1 task queued (overflow)');
}

// ── T3: Slot Freed → Instant Backfill ────────────────────────────────────────
console.log('\nT3: Slot Freed → Instant Backfill (Axiom 4)');
{
  const engine = makeEngine(2);
  const t1 = engine.enqueue({ title: 'fill-1', agentId: 'coder' });
  const t2 = engine.enqueue({ title: 'fill-2', agentId: 'writer' });
  engine.enqueue({ title: 'waiting', agentId: 'researcher' });
  assert(engine.queueDepth() === 1, 'queue has 1 before free');

  // Mark t1 as running then done
  engine.markRunning(t1.taskId);
  engine.markDone(t1.taskId, { result: 'ok' });

  assert(engine.queueDepth() === 0, 'queue is empty after backfill');
  assert(engine.busyCount() === 2, 'busyCount back to 2 (backfilled)');
}

// ── T4: Report Trigger Fires on Every Lifecycle Event ────────────────────────
console.log('\nT4: Report Trigger Fires on Every Event');
{
  const engine = makeEngine(3);
  const events = [];
  const trigger = new ReportTrigger(engine, {
    onReport: (report) => events.push(report.event),
  });

  const t = engine.enqueue({ title: 'tracked', agentId: 'writer' });
  // dispatched event
  assert(events.includes('dispatched'), 'dispatched event fired');

  engine.markRunning(t.taskId);
  assert(events.includes('running'), 'running event fired');

  engine.markDone(t.taskId);
  assert(events.includes('finished'), 'finished event fired');

  assert(events.length >= 3, `total events: ${events.length} ≥ 3`);
  trigger.detach();
}

// ── T5: 0-Active Report Shows Completed/Risks/Decisions ──────────────────────
console.log('\nT5: 0-Active Report Shows Completed + Risks');
{
  const engine = makeEngine(3);
  let lastReport = null;
  const trigger = new ReportTrigger(engine, {
    onReport: (report) => { lastReport = report; },
  });

  // Create and complete tasks
  const t1 = engine.enqueue({ title: 'done-task', agentId: 'coder' });
  engine.markRunning(t1.taskId);
  engine.markDone(t1.taskId, { result: 'success' });

  const t2 = engine.enqueue({ title: 'failed-task', agentId: 'writer' });
  engine.markRunning(t2.taskId);
  engine.markFailed(t2.taskId, { error: 'timeout' });

  assert(lastReport !== null, 'report generated');
  assert(lastReport.stats.active === 0, '0 active tasks');
  assert(lastReport.stats.completed >= 1, 'has completed tasks');
  assert(lastReport.text.includes('新完成'), 'text includes completed section');
  assert(lastReport.text.includes('关键风险') || lastReport.text.includes('失败'), 'text includes risk/failure');
  assert(!lastReport.text.includes('暂无任务'), 'not showing empty placeholder');
  trigger.detach();
}

// ── T6: Failed Task → Slot Freed + Backfill ──────────────────────────────────
console.log('\nT6: Failed Task → Slot Freed + Backfill');
{
  const engine = makeEngine(2);
  const t1 = engine.enqueue({ title: 'fill-1', agentId: 'coder' });
  const t2 = engine.enqueue({ title: 'fill-2', agentId: 'writer' });
  engine.enqueue({ title: 'queued-3', agentId: 'researcher' });

  assert(engine.queueDepth() === 1, 'before: 1 queued');
  engine.markFailed(t1.taskId, { error: 'crash' });

  assert(engine.queueDepth() === 0, 'after fail: queue drained');
  assert(engine.busyCount() === 2, 'slots still full (backfilled)');
}

// ── T7: Priority Ordering ────────────────────────────────────────────────────
console.log('\nT7: Priority Ordering');
{
  const engine = makeEngine(1);
  // Fill the single slot
  const blocker = engine.enqueue({ title: 'blocker', agentId: 'coder' });

  // Queue multiple priorities
  engine.enqueue({ title: 'low-task', agentId: 'writer', priority: 'low' });
  engine.enqueue({ title: 'critical-task', agentId: 'analyst', priority: 'critical' });
  engine.enqueue({ title: 'normal-task', agentId: 'researcher', priority: 'normal' });

  assert(engine.queueDepth() === 3, '3 queued');

  // Free the slot → should pick critical first
  engine.markDone(blocker.taskId);
  const s = engine._load();
  const spawningTasks = Object.values(s.spawning);
  assert(spawningTasks.length === 1, '1 task spawning');
  assert(spawningTasks[0].title === 'critical-task', 'critical priority dispatched first');
}

// ── T8: Batch Enqueue ────────────────────────────────────────────────────────
console.log('\nT8: Batch Enqueue');
{
  const engine = makeEngine(5);
  const tasks = engine.enqueueBatch([
    { title: 'batch-1', agentId: 'coder' },
    { title: 'batch-2', agentId: 'writer' },
    { title: 'batch-3', agentId: 'analyst' },
  ]);
  assert(tasks.length === 3, '3 tasks created');
  assert(engine.busyCount() === 3, 'all 3 in slots');
  assert(engine.queueDepth() === 0, 'none queued');
}

// ── T9: Stale Detection + Reap ───────────────────────────────────────────────
console.log('\nT9: Stale Detection + Reap');
{
  const engine = makeEngine(3);
  const t = engine.enqueue({ title: 'stale-test', agentId: 'coder' });
  // Hack the spawningAt to be in the past
  const s = engine._load();
  s.spawning[t.taskId].spawningAt = new Date(Date.now() - 200_000).toISOString();
  engine._save();

  const stale = engine.detectStale({ spawnTimeoutMs: 60_000 });
  assert(stale.length === 1, 'detected 1 stale task');
  assert(stale[0].reason === 'spawn_timeout', 'reason is spawn_timeout');

  const reaped = engine.reapStale({ spawnTimeoutMs: 60_000 });
  assert(reaped.length === 1, 'reaped 1 task');
  assert(engine.busyCount() === 0, 'slot freed after reap');
}

// ── T10: Full Lifecycle Chain ────────────────────────────────────────────────
console.log('\nT10: Full Lifecycle Chain (enqueue → spawn → running → done → report)');
{
  const engine = makeEngine(3);
  const reportLog = [];
  const trigger = new ReportTrigger(engine, {
    onReport: (report) => reportLog.push({
      event: report.event,
      stats: { ...report.stats },
      title: report.title,
    }),
  });

  // Step 1: Enqueue
  const t = engine.enqueue({
    title: 'lifecycle-test',
    agentId: 'coder',
    model: 'boom-coder/gpt-5.3-codex',
    priority: 'high',
  });
  assert(reportLog.length >= 1, 'report fired after enqueue');

  // Step 2: Mark running (agent confirmed spawn)
  engine.markRunning(t.taskId, { sessionKey: 'agent:coder:subagent:abc123' });
  assert(reportLog.some(r => r.event === 'running'), 'running report fired');

  // Step 3: Heartbeat
  engine.heartbeat(t.taskId, { progress: '50%' });

  // Step 4: Mark done
  engine.markDone(t.taskId, { result: 'code complete' });
  const lastReport = reportLog[reportLog.length - 1];
  assert(lastReport.stats.active === 0, 'final: 0 active');
  assert(lastReport.stats.completed >= 1, 'final: ≥1 completed');

  // Step 5: Live board check
  const board = engine.liveBoard();
  assert(board.summary.busySlots === 0, 'board: 0 busy');
  assert(board.summary.freeSlots === 3, 'board: 3 free');
  assert(board.recentFinished.length >= 1, 'board: has finished task');

  trigger.detach();
}

// ── T11: Report Text Content Quality ─────────────────────────────────────────
console.log('\nT11: Report Text Content Quality');
{
  const engine = makeEngine(5);
  const trigger = new ReportTrigger(engine, {
    agentRegistry: { coder: '开发工程师', writer: '创作大师', analyst: '洞察分析师' },
  });

  // 3 active tasks
  const t1 = engine.enqueue({ title: '实现调度引擎', agentId: 'coder', model: 'boom-coder/gpt-5.3-codex' });
  const t2 = engine.enqueue({ title: '编写设计文档', agentId: 'writer', model: 'claude-opus-4-20250514' });
  engine.markRunning(t1.taskId);
  engine.markRunning(t2.taskId);

  const report = trigger.buildReport('manual');
  
  // Check text quality
  assert(report.text.includes('Agent'), 'text has Agent header');
  assert(report.text.includes('任务'), 'text has 任务 header');
  assert(report.text.includes('模型'), 'text has 模型 header');
  assert(report.text.includes('状态'), 'text has 状态 header');
  assert(report.text.includes('用时'), 'text has 用时 header');
  assert(!report.text.includes('下一步'), 'no 下一步 column');
  assert(report.text.includes('开发工程师'), 'uses full persona name');
  assert(report.text.includes('gpt-5.3-codex'), 'model shortened correctly');
  assert(report.text.includes('opus-4'), 'claude model shortened');

  // Check card
  assert(report.card.header.template === 'blue', 'card color is blue (active)');
  assert(report.stats.active === 2, 'stats: 2 active');

  trigger.detach();
}

// ── T12: Dual-Mode Safety — Both Engines Can Coexist ─────────────────────────
console.log('\nT12: Dual-Mode Safety — Both Engines Can Coexist');
{
  // Old dispatcher state file
  const oldStateFile = path.resolve(__dirname, '..', '..', '..', '..', 'infrastructure', 'dispatcher', 'state', 'dispatch-layer-state.json');
  // New engine state file
  const newStateFile = path.resolve(__dirname, '..', 'state', 'engine-state.json');

  let oldExists = false, newExists = false;
  try { fs.statSync(oldStateFile); oldExists = true; } catch {}
  try { fs.statSync(newStateFile); newExists = true; } catch {}

  assert(oldExists, 'old dispatcher state exists');
  assert(newExists, 'new engine state exists');

  // Verify new engine state is clean or valid
  try {
    const newState = JSON.parse(fs.readFileSync(newStateFile, 'utf8'));
    assert(newState.version === 2, 'new engine state version is 2');
    assert(typeof newState.queued === 'object', 'new state has queued map');
    assert(typeof newState.spawning === 'object', 'new state has spawning map');
    assert(typeof newState.running === 'object', 'new state has running map');
  } catch (e) {
    assert(false, 'new engine state is valid JSON', e.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n══════════════════════════════════════════════════');
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('══════════════════════════════════════════════════\n');

// Write machine-readable results
const resultFile = path.join(__dirname, '..', 'state', 'validation-results.json');
fs.mkdirSync(path.dirname(resultFile), { recursive: true });
fs.writeFileSync(resultFile, JSON.stringify({
  timestamp: new Date().toISOString(),
  passed,
  failed,
  total: passed + failed,
  results,
}, null, 2));

process.exit(failed > 0 ? 1 : 0);
