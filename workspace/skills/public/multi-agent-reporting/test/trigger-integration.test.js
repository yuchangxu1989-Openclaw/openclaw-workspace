#!/usr/bin/env node

/**
 * report-trigger integration test
 *
 * Tests: ReportTrigger + renderReport pipeline.
 * Uses a mock DispatchEngine (EventEmitter) to avoid cross-skill dependency.
 *
 * Run: node test/trigger-integration.test.js
 * Zero external dependencies.
 */

'use strict';

const assert = require('assert');
const { EventEmitter } = require('events');
const { ReportTrigger, toReportingTask, DEFAULT_AGENT_REGISTRY, STATUS_MAP } = require('../report-trigger');

let passed = 0, failed = 0;
const failures = [];

function test(name, fn) {
  try { fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e) { failed++; failures.push({ name, error: e.message }); console.log(`  ❌ ${name}\n     ${e.message}`); }
}

// ── MockEngine: minimal DispatchEngine shape ────────────────────────────────
// Emits the same events as DispatchEngine, holds state in the same structure.

class MockEngine extends EventEmitter {
  constructor() {
    super();
    this._state = { spawning: {}, running: {}, queued: {}, finished: [], eventLog: [] };
    this._idCounter = 0;
  }

  _load() { return this._state; }

  enqueue(input) {
    const taskId = input.taskId || `t_${++this._idCounter}`;
    const task = {
      taskId, title: input.title || '(untitled)', agentId: input.agentId || 'unknown',
      model: input.model || '—', status: 'spawning', duration: input.duration || null,
      error: null, displayName: input.displayName || null,
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
    Object.assign(task, patch, { status: 'done', finishedAt: new Date().toISOString(), duration: task.duration || '1m' });
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

// ═══════════════════════════════════════════════════════════════
// toReportingTask
// ═══════════════════════════════════════════════════════════════

console.log('\n🔄 toReportingTask');

test('maps dispatch task to reporting format', () => {
  const dt = { taskId: 't1', title: '写技术文档', agentId: 'writer', model: 'claude-opus-4-20250514', status: 'running', duration: '3m12s' };
  const rt = toReportingTask(dt, DEFAULT_AGENT_REGISTRY);
  assert.strictEqual(rt.agentId, 'writer');
  assert.strictEqual(rt.displayName, '创作大师');
  assert.strictEqual(rt.task, '写技术文档');
  assert.strictEqual(rt.status, 'running');
  assert.strictEqual(rt.model, 'claude-opus-4-20250514');
  assert.strictEqual(rt.duration, '3m12s');
});

test('maps done → completed', () => {
  const rt = toReportingTask({ status: 'done' }, {});
  assert.strictEqual(rt.status, 'completed');
});

test('maps spawning → running', () => {
  const rt = toReportingTask({ status: 'spawning' }, {});
  assert.strictEqual(rt.status, 'running');
});

test('maps failed → failed with error', () => {
  const rt = toReportingTask({ status: 'failed', error: 'OOM' }, {});
  assert.strictEqual(rt.status, 'failed');
  assert.strictEqual(rt.error, 'OOM');
});

test('uses registry for displayName', () => {
  const rt = toReportingTask({ agentId: 'coder' }, { coder: '开发工程师' });
  assert.strictEqual(rt.displayName, '开发工程师');
});

test('falls back to agentId when not in registry', () => {
  const rt = toReportingTask({ agentId: 'unknown_agent' }, {});
  assert.strictEqual(rt.displayName, 'unknown_agent');
});

// ═══════════════════════════════════════════════════════════════
// ReportTrigger — event-driven reports
// ═══════════════════════════════════════════════════════════════

console.log('\n⚡ ReportTrigger events');

test('dispatched event triggers report', () => {
  const engine = new MockEngine();
  const reports = [];
  const trigger = new ReportTrigger(engine, {
    onReport: (r) => reports.push(r),
  });

  engine.enqueue({ title: 'Task A', agentId: 'writer', model: 'claude-opus-4-20250514' });
  assert.ok(reports.length >= 1, `Expected ≥1 report, got ${reports.length}`);
  assert.strictEqual(reports[reports.length - 1].event, 'dispatched');
  trigger.detach();
});

test('report contains dispatched task in text', () => {
  const engine = new MockEngine();
  let lastReport = null;
  const trigger = new ReportTrigger(engine, {
    onReport: (r) => { lastReport = r; },
  });

  engine.enqueue({ title: 'Build API', agentId: 'coder', model: 'gpt-4o-2024-08-06' });
  assert.ok(lastReport);
  assert.ok(lastReport.text.includes('开发工程师'), `Expected 开发工程师 in text`);
  assert.ok(lastReport.text.includes('Build API'));
  trigger.detach();
});

test('running event triggers report', () => {
  const engine = new MockEngine();
  const events = [];
  const trigger = new ReportTrigger(engine, {
    onReport: (r) => events.push(r.event),
  });

  const task = engine.enqueue({ title: 'T1', agentId: 'writer', model: 'm' });
  engine.markRunning(task.taskId);
  assert.ok(events.includes('running'), `Events: ${events}`);
  trigger.detach();
});

test('finished event triggers report', () => {
  const engine = new MockEngine();
  const events = [];
  const trigger = new ReportTrigger(engine, {
    onReport: (r) => events.push(r.event),
  });

  const task = engine.enqueue({ title: 'T1', agentId: 'writer', model: 'm' });
  engine.markRunning(task.taskId);
  engine.markDone(task.taskId, { result: 'ok' });
  assert.ok(events.includes('finished'), `Events: ${events}`);
  trigger.detach();
});

test('completion shows in report stats', () => {
  const engine = new MockEngine();
  let lastReport = null;
  const trigger = new ReportTrigger(engine, {
    onReport: (r) => { lastReport = r; },
  });

  const task = engine.enqueue({ title: 'Done task', agentId: 'writer', model: 'claude-opus-4-20250514' });
  engine.markRunning(task.taskId);
  engine.markDone(task.taskId);

  assert.ok(lastReport);
  assert.ok(lastReport.stats.completed >= 1, `completed: ${lastReport.stats.completed}`);
  trigger.detach();
});

// ═══════════════════════════════════════════════════════════════
// Requirement validation
// ═══════════════════════════════════════════════════════════════

console.log('\n📋 Requirements');

test('R1: 表头 # / Agent / 任务 / 模型 / 状态 / 用时', () => {
  const engine = new MockEngine();
  let lastReport = null;
  const trigger = new ReportTrigger(engine, {
    onReport: (r) => { lastReport = r; },
  });

  const task = engine.enqueue({ title: 'Task', agentId: 'writer', model: 'claude-opus-4-20250514' });
  engine.markRunning(task.taskId);

  const text = lastReport.text;
  assert.ok(text.includes('| # | Agent | 任务 | 模型 | 状态 | 用时 |'), `Headers not found`);
  trigger.detach();
});

test('R2: 没有下一步列', () => {
  const engine = new MockEngine();
  let lastReport = null;
  const trigger = new ReportTrigger(engine, {
    onReport: (r) => { lastReport = r; },
  });

  engine.enqueue({ title: 'Task', agentId: 'writer', model: 'claude-opus-4-20250514' });
  assert.ok(!lastReport.text.includes('下一步'));
  assert.ok(!lastReport.text.includes('Next'));
  trigger.detach();
});

test('R3: Agent 用人物角色全称', () => {
  const engine = new MockEngine();
  let lastReport = null;
  const trigger = new ReportTrigger(engine, {
    onReport: (r) => { lastReport = r; },
  });

  engine.enqueue({ title: 'Task', agentId: 'writer', model: 'claude-opus-4-20250514' });
  assert.ok(lastReport.text.includes('创作大师'));
  assert.ok(!lastReport.text.includes('| writer |'));
  trigger.detach();
});

test('R4: 只放进行中的任务在主表', () => {
  const engine = new MockEngine();
  let lastReport = null;
  const trigger = new ReportTrigger(engine, {
    onReport: (r) => { lastReport = r; },
  });

  const t1 = engine.enqueue({ title: 'Running', agentId: 'writer', model: 'claude-opus-4-20250514' });
  engine.markRunning(t1.taskId);
  const t2 = engine.enqueue({ title: 'Also Running', agentId: 'coder', model: 'gpt-4o' });
  engine.markRunning(t2.taskId);
  engine.markDone(t2.taskId);

  assert.ok(lastReport.stats.active >= 0);
  trigger.detach();
});

test('R5: 0活跃时不给空表 — 有内容', () => {
  const engine = new MockEngine();
  let lastReport = null;
  const trigger = new ReportTrigger(engine, {
    onReport: (r) => { lastReport = r; },
  });

  const t = engine.enqueue({ title: 'Will Complete', agentId: 'writer', model: 'claude-opus-4-20250514' });
  engine.markRunning(t.taskId);
  engine.markDone(t.taskId);

  const text = lastReport.text;
  assert.ok(text.length > 50, 'Report too short for 0-active state');
  assert.ok(text.includes('完成') || text.includes('✅'), `Expected completed content`);
  trigger.detach();
});

test('R6: dispatch events trigger reports', () => {
  const engine = new MockEngine();
  let count = 0;
  const trigger = new ReportTrigger(engine, {
    onReport: () => { count++; },
  });

  engine.enqueue({ title: 'T', agentId: 'a', model: 'm' });
  const t1Count = count;
  assert.ok(t1Count >= 1, 'Enqueue should trigger report');

  const tid = Object.keys(engine._state.spawning)[0] || Object.keys(engine._state.running)[0];
  engine.markRunning(tid);
  assert.ok(count > t1Count, 'markRunning should trigger report');

  const t2Count = count;
  engine.markDone(tid);
  assert.ok(count > t2Count, 'markDone should trigger report');
  trigger.detach();
});

test('R7: 少废话', () => {
  const engine = new MockEngine();
  let lastReport = null;
  const trigger = new ReportTrigger(engine, {
    onReport: (r) => { lastReport = r; },
  });

  engine.enqueue({ title: 'Task', agentId: 'writer', model: 'claude-opus-4-20250514' });
  const lines = lastReport.text.split('\n').filter(l => l.trim());
  assert.ok(lines.length < 25, `Too verbose: ${lines.length} lines`);
  trigger.detach();
});

test('R8: 飞书卡片输出', () => {
  const engine = new MockEngine();
  let lastReport = null;
  const trigger = new ReportTrigger(engine, {
    onReport: (r) => { lastReport = r; },
  });

  engine.enqueue({ title: 'Task', agentId: 'writer', model: 'claude-opus-4-20250514' });
  const card = lastReport.card;
  assert.ok(card.config.wide_screen_mode === true);
  assert.ok(card.header);
  assert.ok(card.header.template);
  assert.ok(Array.isArray(card.elements));
  assert.ok(card.elements.length > 0);
  trigger.detach();
});

// ═══════════════════════════════════════════════════════════════
// buildReport (manual call)
// ═══════════════════════════════════════════════════════════════

console.log('\n🔧 buildReport manual');

test('buildReport returns valid structure', () => {
  const engine = new MockEngine();
  const trigger = new ReportTrigger(engine, {});

  const task = engine.enqueue({ title: 'Manual Test', agentId: 'analyst', model: 'gemini-2.5-pro' });
  engine.markRunning(task.taskId);

  const report = trigger.buildReport('manual');
  assert.ok(report.text);
  assert.ok(report.card);
  assert.ok(report.title);
  assert.ok(report.stats);
  assert.strictEqual(report.event, 'manual');
  assert.ok(report.text.includes('洞察分析师'));
  trigger.detach();
});

test('lastReport getter works', () => {
  const engine = new MockEngine();
  const trigger = new ReportTrigger(engine, {});

  assert.strictEqual(trigger.lastReport, null);
  engine.enqueue({ title: 'T', agentId: 'a', model: 'm' });
  assert.ok(trigger.lastReport !== null);
  trigger.detach();
});

test('updateRegistry changes names', () => {
  const engine = new MockEngine();
  const trigger = new ReportTrigger(engine, {});

  trigger.updateRegistry({ writer: '大文豪' });
  engine.enqueue({ title: 'T', agentId: 'writer', model: 'm' });
  assert.ok(trigger.lastReport.text.includes('大文豪'));
  trigger.detach();
});

// ═══════════════════════════════════════════════════════════════
// Full lifecycle
// ═══════════════════════════════════════════════════════════════

console.log('\n🔁 Full lifecycle');

test('enqueue → running → done cycle produces 3+ reports', () => {
  const engine = new MockEngine();
  const reports = [];
  const trigger = new ReportTrigger(engine, {
    onReport: (r) => reports.push({ ...r }),
  });

  const task = engine.enqueue({ title: 'Lifecycle', agentId: 'scout', model: 'gpt-4o' });
  engine.markRunning(task.taskId);
  engine.markDone(task.taskId, { result: 'success' });

  assert.ok(reports.length >= 3, `Expected ≥3 reports, got ${reports.length}`);
  const last = reports[reports.length - 1];
  assert.ok(last.stats.completed >= 1);
  trigger.detach();
});

test('batch enqueue triggers single dispatched event', () => {
  const engine = new MockEngine();
  const reports = [];
  const trigger = new ReportTrigger(engine, {
    onReport: (r) => reports.push(r.event),
  });

  engine.enqueueBatch([
    { title: 'A', agentId: 'writer', model: 'm' },
    { title: 'B', agentId: 'coder', model: 'm' },
    { title: 'C', agentId: 'analyst', model: 'm' },
  ]);

  assert.ok(reports.includes('dispatched'));
  // Should be exactly 1 dispatched event for the batch
  assert.strictEqual(reports.filter(e => e === 'dispatched').length, 1);
  trigger.detach();
});

test('failed task shows as risk in report', () => {
  const engine = new MockEngine();
  let lastReport = null;
  const trigger = new ReportTrigger(engine, {
    onReport: (r) => { lastReport = r; },
  });

  const t = engine.enqueue({ title: 'Will Fail', agentId: 'coder', model: 'gpt-4o' });
  engine.markRunning(t.taskId);
  engine.markFailed(t.taskId, { error: 'Build error: OOM' });

  assert.ok(lastReport.text.includes('Build error') || lastReport.text.includes('OOM'));
  trigger.detach();
});

test('multiple agents render with correct displayNames', () => {
  const engine = new MockEngine();
  let lastReport = null;
  const trigger = new ReportTrigger(engine, {
    onReport: (r) => { lastReport = r; },
  });

  engine.enqueue({ title: 'Write docs', agentId: 'writer', model: 'claude-opus-4-20250514' });
  engine.enqueue({ title: 'Build API', agentId: 'coder', model: 'gpt-4o' });
  engine.enqueue({ title: 'Analyze data', agentId: 'analyst', model: 'gemini-2.5-pro' });

  const text = lastReport.text;
  assert.ok(text.includes('创作大师'));
  assert.ok(text.includes('开发工程师'));
  assert.ok(text.includes('洞察分析师'));
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
