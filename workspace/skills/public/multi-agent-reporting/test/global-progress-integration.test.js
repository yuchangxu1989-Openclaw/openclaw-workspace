#!/usr/bin/env node

/**
 * global-progress-integration.test.js
 *
 * Tests: Global Progress Summary injection into ReportTrigger pipeline.
 * Validates periodic insertion (every N reports), content correctness,
 * text+card rendering, and edge cases.
 *
 * Run: node test/global-progress-integration.test.js
 * Zero external dependencies.
 */

'use strict';

const assert = require('assert');
const { EventEmitter } = require('events');
const { ReportTrigger, computeGlobalProgress, renderProgressText, renderProgressCardElements } = require('../report-trigger');

let passed = 0, failed = 0;
const failures = [];

function test(name, fn) {
  try { fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e) { failed++; failures.push({ name, error: e.message }); console.log(`  ❌ ${name}\n     ${e.message}`); }
}

// ── MockEngine ──────────────────────────────────────────────────────────────

class MockEngine extends EventEmitter {
  constructor() {
    super();
    this._state = { spawning: {}, running: {}, queued: {}, finished: [], eventLog: [] };
    this._idCounter = 0;
  }

  _load() { return this._state; }

  liveBoard() {
    const spawning = Object.values(this._state.spawning);
    const running = Object.values(this._state.running);
    const queued = Object.values(this._state.queued);
    const active = [...spawning, ...running];
    return {
      updatedAt: new Date().toISOString(),
      maxSlots: 19,
      summary: {
        maxSlots: 19,
        busySlots: active.length,
        freeSlots: Math.max(0, 19 - active.length),
        spawningCount: spawning.length,
        runningCount: running.length,
        queueDepth: queued.length,
        finishedCount: this._state.finished.length,
        utilisation: active.length > 0
          ? ((active.length / 19) * 100).toFixed(1) + '%'
          : '0.0%',
      },
      spawning: spawning.map(briefTask),
      running: running.map(briefTask),
      queued: queued.map(briefTask),
      recentFinished: this._state.finished.slice(0, 20).map(briefTask),
    };
  }

  allTasks() {
    return [
      ...Object.values(this._state.running),
      ...Object.values(this._state.spawning),
      ...Object.values(this._state.queued),
      ...this._state.finished.slice(0, 50),
    ];
  }

  enqueue(input) {
    const taskId = input.taskId || `t_${++this._idCounter}`;
    const task = {
      taskId, title: input.title || '(untitled)', agentId: input.agentId || 'unknown',
      model: input.model || '—', status: 'spawning', duration: null, error: null,
      displayName: input.displayName || null,
      spawningAt: new Date().toISOString(),
    };
    this._state.spawning[taskId] = task;
    this.emit('dispatched', [task]);
    return task;
  }

  markRunning(taskId) {
    const task = this._state.spawning[taskId];
    if (!task) return;
    delete this._state.spawning[taskId];
    task.status = 'running';
    task.runningAt = new Date().toISOString();
    this._state.running[taskId] = task;
    this.emit('running', task);
    return task;
  }

  markDone(taskId, patch = {}) {
    const task = this._state.running[taskId] || this._state.spawning[taskId];
    if (!task) return;
    delete this._state.running[taskId];
    delete this._state.spawning[taskId];
    Object.assign(task, patch, { status: 'done', finishedAt: new Date().toISOString(), duration: patch.duration || '1m' });
    this._state.finished.unshift(task);
    this.emit('finished', task);
    return task;
  }

  markFailed(taskId, patch = {}) {
    const task = this._state.running[taskId] || this._state.spawning[taskId];
    if (!task) return;
    delete this._state.running[taskId];
    delete this._state.spawning[taskId];
    Object.assign(task, patch, { status: 'failed', finishedAt: new Date().toISOString() });
    this._state.finished.unshift(task);
    this.emit('finished', task);
    return task;
  }

  enqueueBatch(inputs) {
    const tasks = [];
    for (const input of inputs) {
      const taskId = input.taskId || `t_${++this._idCounter}`;
      const task = {
        taskId, title: input.title || '(untitled)', agentId: input.agentId || 'unknown',
        model: input.model || '—', status: 'spawning', duration: null, error: null,
        spawningAt: new Date().toISOString(),
      };
      this._state.spawning[taskId] = task;
      tasks.push(task);
    }
    this.emit('dispatched', tasks);
    return tasks;
  }
}

function briefTask(t) {
  return { taskId: t.taskId, title: t.title, status: t.status, agentId: t.agentId, model: t.model, duration: t.duration, error: t.error };
}

// ═══════════════════════════════════════════════════════════════
// computeGlobalProgress (standalone)
// ═══════════════════════════════════════════════════════════════

console.log('\n📊 computeGlobalProgress');

test('returns structured progress from engine', () => {
  const engine = new MockEngine();
  const t = engine.enqueue({ title: 'Task A', agentId: 'writer', model: 'gpt-5.4' });
  engine.markRunning(t.taskId);

  const progress = computeGlobalProgress(engine);
  assert.ok(progress.timestamp);
  assert.strictEqual(progress.totalRunning, 1);
  assert.strictEqual(progress.totalCompleted, 0);
  assert.strictEqual(progress.totalFailed, 0);
  assert.ok(progress.healthVerdict.includes('健康'));
});

test('tracks completed tasks', () => {
  const engine = new MockEngine();
  const t1 = engine.enqueue({ title: 'Done A', agentId: 'coder', model: 'm' });
  engine.markRunning(t1.taskId);
  engine.markDone(t1.taskId, { duration: '3m' });

  const progress = computeGlobalProgress(engine);
  assert.strictEqual(progress.totalCompleted, 1);
  assert.strictEqual(progress.recentCompleted.length, 1);
  assert.strictEqual(progress.recentCompleted[0].title, 'Done A');
});

test('tracks failed tasks as risks', () => {
  const engine = new MockEngine();
  const t1 = engine.enqueue({ title: 'Fail A', agentId: 'coder', model: 'm' });
  engine.markRunning(t1.taskId);
  engine.markFailed(t1.taskId, { error: 'OOM crash' });

  const progress = computeGlobalProgress(engine);
  assert.strictEqual(progress.totalFailed, 1);
  assert.strictEqual(progress.activeRisks.length, 1);
  assert.ok(progress.activeRisks[0].error.includes('OOM'));
  assert.ok(progress.healthVerdict.includes('风险'));
});

test('healthy verdict when all running, no failures', () => {
  const engine = new MockEngine();
  const t = engine.enqueue({ title: 'T', agentId: 'a', model: 'm' });
  engine.markRunning(t.taskId);

  const progress = computeGlobalProgress(engine);
  assert.ok(progress.healthVerdict.includes('🟢'));
});

test('idle verdict when nothing running', () => {
  const engine = new MockEngine();
  const progress = computeGlobalProgress(engine);
  assert.ok(progress.healthVerdict.includes('⚪') || progress.healthVerdict.includes('空闲'));
});

test('red verdict when 3+ failures', () => {
  const engine = new MockEngine();
  for (let i = 0; i < 3; i++) {
    const t = engine.enqueue({ title: `Fail ${i}`, agentId: 'a', model: 'm' });
    engine.markRunning(t.taskId);
    engine.markFailed(t.taskId, { error: `err ${i}` });
  }

  const progress = computeGlobalProgress(engine);
  assert.ok(progress.healthVerdict.includes('🔴'));
});

// ═══════════════════════════════════════════════════════════════
// renderProgressText
// ═══════════════════════════════════════════════════════════════

console.log('\n📝 renderProgressText');

test('renders Markdown with correct structure', () => {
  const engine = new MockEngine();
  const t = engine.enqueue({ title: 'Task A', agentId: 'writer', model: 'gpt-5.4' });
  engine.markRunning(t.taskId);
  const progress = computeGlobalProgress(engine);
  const text = renderProgressText(progress);

  assert.ok(text.includes('阶段性全局进展总结'));
  assert.ok(text.includes('系统状态'));
  assert.ok(text.includes('槽位利用率'));
  assert.ok(text.includes('执行中'));
  assert.ok(text.includes('排队中'));
});

test('includes recently completed tasks', () => {
  const engine = new MockEngine();
  const t = engine.enqueue({ title: 'Completed Task X', agentId: 'writer', model: 'm' });
  engine.markRunning(t.taskId);
  engine.markDone(t.taskId, { duration: '2m' });

  const progress = computeGlobalProgress(engine);
  const text = renderProgressText(progress);
  assert.ok(text.includes('Completed Task X'));
  assert.ok(text.includes('近期完成'));
});

test('includes active risks', () => {
  const engine = new MockEngine();
  const t = engine.enqueue({ title: 'Bad Task', agentId: 'coder', model: 'm' });
  engine.markRunning(t.taskId);
  engine.markFailed(t.taskId, { error: 'timeout' });

  const progress = computeGlobalProgress(engine);
  const text = renderProgressText(progress);
  assert.ok(text.includes('Bad Task'));
  assert.ok(text.includes('timeout'));
  assert.ok(text.includes('活跃风险'));
});

// ═══════════════════════════════════════════════════════════════
// renderProgressCardElements
// ═══════════════════════════════════════════════════════════════

console.log('\n🃏 renderProgressCardElements');

test('returns array of Feishu card elements', () => {
  const engine = new MockEngine();
  const progress = computeGlobalProgress(engine);
  const elements = renderProgressCardElements(progress);

  assert.ok(Array.isArray(elements));
  assert.ok(elements.length >= 1);
  // Should contain hr + div at minimum
  const hrCount = elements.filter(e => e.tag === 'hr').length;
  assert.ok(hrCount >= 1);
});

test('card elements include progress data', () => {
  const engine = new MockEngine();
  const t = engine.enqueue({ title: 'Running X', agentId: 'writer', model: 'gpt-5.4' });
  engine.markRunning(t.taskId);

  const progress = computeGlobalProgress(engine);
  const elements = renderProgressCardElements(progress);

  const textContent = elements.map(e => e.text?.content || '').join('\n');
  assert.ok(textContent.includes('全局进展'));
  assert.ok(textContent.includes('利用率'));
});

// ═══════════════════════════════════════════════════════════════
// ReportTrigger global progress integration
// ═══════════════════════════════════════════════════════════════

console.log('\n🔄 ReportTrigger periodic global progress');

test('no globalProgress on reports 1 and 2 (interval=3)', () => {
  const engine = new MockEngine();
  const reports = [];
  const trigger = new ReportTrigger(engine, {
    globalProgressInterval: 3,
    onReport: (r) => reports.push({ ...r }),
  });

  // Report 1: dispatched
  engine.enqueue({ title: 'T1', agentId: 'a', model: 'm' });
  // Report 2: dispatched
  engine.enqueue({ title: 'T2', agentId: 'b', model: 'm' });

  assert.strictEqual(reports.length, 2);
  assert.strictEqual(reports[0].globalProgress, null);
  assert.strictEqual(reports[1].globalProgress, null);
  trigger.detach();
});

test('globalProgress IS present on report 3 (interval=3)', () => {
  const engine = new MockEngine();
  const reports = [];
  const trigger = new ReportTrigger(engine, {
    globalProgressInterval: 3,
    onReport: (r) => reports.push({ ...r }),
  });

  engine.enqueue({ title: 'T1', agentId: 'a', model: 'm' });
  engine.enqueue({ title: 'T2', agentId: 'b', model: 'm' });
  engine.enqueue({ title: 'T3', agentId: 'c', model: 'm' });

  assert.strictEqual(reports.length, 3);
  assert.ok(reports[2].globalProgress !== null, 'Report 3 should have globalProgress');
  assert.ok(reports[2].globalProgress.data);
  assert.ok(reports[2].globalProgress.text);
  assert.ok(reports[2].globalProgress.cardElements);
  assert.strictEqual(reports[2].globalProgress.reportCount, 3);
  assert.strictEqual(reports[2].globalProgress.interval, 3);
  trigger.detach();
});

test('globalProgress text appended to report text', () => {
  const engine = new MockEngine();
  let thirdReport = null;
  let count = 0;
  const trigger = new ReportTrigger(engine, {
    globalProgressInterval: 3,
    onReport: (r) => { count++; if (count === 3) thirdReport = r; },
  });

  engine.enqueue({ title: 'T1', agentId: 'a', model: 'm' });
  engine.enqueue({ title: 'T2', agentId: 'b', model: 'm' });
  engine.enqueue({ title: 'T3', agentId: 'c', model: 'm' });

  assert.ok(thirdReport);
  assert.ok(thirdReport.text.includes('阶段性全局进展总结'));
  assert.ok(thirdReport.text.includes('系统状态'));
  trigger.detach();
});

test('globalProgress card elements appended to card', () => {
  const engine = new MockEngine();
  let thirdReport = null;
  let count = 0;
  const trigger = new ReportTrigger(engine, {
    globalProgressInterval: 3,
    onReport: (r) => { count++; if (count === 3) thirdReport = r; },
  });

  engine.enqueue({ title: 'T1', agentId: 'a', model: 'm' });
  engine.enqueue({ title: 'T2', agentId: 'b', model: 'm' });
  engine.enqueue({ title: 'T3', agentId: 'c', model: 'm' });

  assert.ok(thirdReport);
  assert.ok(thirdReport.card.elements.length > 0);
  // Last elements should include the global progress hr + div
  const lastElements = thirdReport.card.elements.slice(-3);
  const hasHr = lastElements.some(e => e.tag === 'hr');
  assert.ok(hasHr, 'Card should have hr separator for global progress');
  trigger.detach();
});

test('report 6 also has globalProgress (interval=3)', () => {
  const engine = new MockEngine();
  const reports = [];
  const trigger = new ReportTrigger(engine, {
    globalProgressInterval: 3,
    onReport: (r) => reports.push({ ...r }),
  });

  for (let i = 0; i < 6; i++) {
    engine.enqueue({ title: `T${i + 1}`, agentId: 'a', model: 'm' });
  }

  assert.strictEqual(reports.length, 6);
  assert.strictEqual(reports[0].globalProgress, null);
  assert.strictEqual(reports[1].globalProgress, null);
  assert.ok(reports[2].globalProgress !== null, 'Report 3 has progress');
  assert.strictEqual(reports[3].globalProgress, null);
  assert.strictEqual(reports[4].globalProgress, null);
  assert.ok(reports[5].globalProgress !== null, 'Report 6 has progress');
  trigger.detach();
});

test('globalProgressInterval=0 disables injection', () => {
  const engine = new MockEngine();
  const reports = [];
  const trigger = new ReportTrigger(engine, {
    globalProgressInterval: 0,
    onReport: (r) => reports.push({ ...r }),
  });

  for (let i = 0; i < 5; i++) {
    engine.enqueue({ title: `T${i + 1}`, agentId: 'a', model: 'm' });
  }

  assert.ok(reports.every(r => r.globalProgress === null), 'All reports should have null globalProgress');
  trigger.detach();
});

test('globalProgressInterval=1 injects every report', () => {
  const engine = new MockEngine();
  const reports = [];
  const trigger = new ReportTrigger(engine, {
    globalProgressInterval: 1,
    onReport: (r) => reports.push({ ...r }),
  });

  for (let i = 0; i < 3; i++) {
    engine.enqueue({ title: `T${i + 1}`, agentId: 'a', model: 'm' });
  }

  assert.ok(reports.every(r => r.globalProgress !== null), 'All reports should have globalProgress');
  trigger.detach();
});

test('reportCount getter works', () => {
  const engine = new MockEngine();
  const trigger = new ReportTrigger(engine, {});

  assert.strictEqual(trigger.reportCount, 0);
  engine.enqueue({ title: 'T', agentId: 'a', model: 'm' });
  assert.strictEqual(trigger.reportCount, 1);
  engine.enqueue({ title: 'T2', agentId: 'b', model: 'm' });
  assert.strictEqual(trigger.reportCount, 2);
  trigger.detach();
});

test('lastGlobalProgress getter works', () => {
  const engine = new MockEngine();
  const trigger = new ReportTrigger(engine, { globalProgressInterval: 2 });

  assert.strictEqual(trigger.lastGlobalProgress, null);
  engine.enqueue({ title: 'T1', agentId: 'a', model: 'm' });
  assert.strictEqual(trigger.lastGlobalProgress, null);
  engine.enqueue({ title: 'T2', agentId: 'b', model: 'm' });
  assert.ok(trigger.lastGlobalProgress !== null);
  assert.ok(trigger.lastGlobalProgress.data);
  trigger.detach();
});

test('global progress reflects actual completed and failed state', () => {
  const engine = new MockEngine();
  let thirdReport = null;
  let count = 0;
  const trigger = new ReportTrigger(engine, {
    globalProgressInterval: 3,
    onReport: (r) => { count++; if (count === 3) thirdReport = r; },
  });

  const t1 = engine.enqueue({ title: 'Will Complete', agentId: 'writer', model: 'gpt-5.4' });
  engine.markRunning(t1.taskId);  // report 2
  engine.markDone(t1.taskId, { duration: '5m' });  // report 3

  assert.ok(thirdReport);
  assert.ok(thirdReport.globalProgress);
  assert.ok(thirdReport.globalProgress.data.totalCompleted >= 1);
  assert.ok(thirdReport.globalProgress.text.includes('近期完成'));
  trigger.detach();
});

test('global progress data includes utilisation', () => {
  const engine = new MockEngine();
  const reports = [];
  const trigger = new ReportTrigger(engine, {
    globalProgressInterval: 3,
    onReport: (r) => reports.push({ ...r }),
  });

  const t1 = engine.enqueue({ title: 'Active A', agentId: 'writer', model: 'm' });
  engine.markRunning(t1.taskId);
  const t2 = engine.enqueue({ title: 'Active B', agentId: 'coder', model: 'm' });
  engine.markRunning(t2.taskId);  // This is report 3 (enqueue dispatched, running)
  // Actually: enqueue fires dispatched (#2), markRunning fires running (#3)

  // We need exactly 3 reports. Let's count:
  // enqueue T1 → dispatched (report 1)
  // markRunning T1 → running (report 2)
  // enqueue T2 → dispatched (report 3) ← this should have globalProgress
  
  const gpReport = reports.find(r => r.globalProgress !== null);
  assert.ok(gpReport, 'Should find a report with globalProgress');
  assert.ok(gpReport.globalProgress.data.utilisation);
  trigger.detach();
});

// ═══════════════════════════════════════════════════════════════
// Full lifecycle with global progress
// ═══════════════════════════════════════════════════════════════

console.log('\n🔁 Full lifecycle with global progress');

test('enqueue → run → done → new cycle produces global summary at interval', () => {
  const engine = new MockEngine();
  const reports = [];
  const trigger = new ReportTrigger(engine, {
    globalProgressInterval: 3,
    onReport: (r) => reports.push({ event: r.event, gp: !!r.globalProgress, count: r.reportCount }),
  });

  const t1 = engine.enqueue({ title: 'Lifecycle A', agentId: 'writer', model: 'gpt-5.4' });
  engine.markRunning(t1.taskId);
  engine.markDone(t1.taskId);  // 3 reports

  assert.ok(reports.length >= 3, `Expected ≥3 reports, got ${reports.length}`);
  // Report 3 should have globalProgress
  assert.ok(reports[2].gp, 'Report 3 should have globalProgress');
  trigger.detach();
});

test('manual buildReport also increments counter', () => {
  const engine = new MockEngine();
  const trigger = new ReportTrigger(engine, { globalProgressInterval: 2 });

  // Manual calls
  const r1 = trigger.buildReport('manual');
  assert.strictEqual(r1.reportCount, 1);
  assert.strictEqual(r1.globalProgress, null);

  const r2 = trigger.buildReport('manual');
  assert.strictEqual(r2.reportCount, 2);
  assert.ok(r2.globalProgress !== null, 'Report 2 should have globalProgress (interval=2)');
  trigger.detach();
});

// ═══════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════

console.log('\n' + '═'.repeat(50));
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('═'.repeat(50));

if (failures.length > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f.name}: ${f.error}`);
}

process.exit(failed > 0 ? 1 : 0);
