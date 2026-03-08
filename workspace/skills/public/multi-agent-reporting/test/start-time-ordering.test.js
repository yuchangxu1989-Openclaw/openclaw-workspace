#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { renderReport, selectVisibleTasks, formatTaskTimeCell } = require('../index');
const { toReportingTask } = require('../report-trigger');

const tasks = [
  { taskId: 't-old', task: '旧任务', model: 'boom/gpt-5.4', status: 'running', runningAt: '2026-03-07T12:00:00.000Z' },
  { taskId: 't-new', task: '新任务', model: 'boom/gpt-5.4', status: 'spawning', spawningAt: '2026-03-07T12:05:00.000Z' },
  { taskId: 't-mid', task: '中间任务', model: 'boom/gpt-5.4', status: 'queued', queuedAt: '2026-03-07T12:03:00.000Z' },
  { taskId: 't-dur', task: '仅持续任务', model: 'boom/gpt-5.4', status: 'running', duration: '3m 12s' },
  { taskId: 't-done', task: '已完成任务', model: 'boom/gpt-5.4', status: 'done', runningAt: '2026-03-07T12:06:00.000Z' }
];

const visible = selectVisibleTasks(tasks);
assert.deepStrictEqual(visible.map(t => t.taskId), ['t-new', 't-mid', 't-old', 't-dur']);

const report = renderReport(tasks);
assert.ok(report.text.includes('| 任务 | 模型 | 状态 | 开始/持续 |'));
assert.ok(report.text.includes('| 新任务 | gpt-5.4 | active | 20:05 |'));
assert.ok(report.text.includes('| 中间任务 | gpt-5.4 | queued | 20:03 |'));
assert.ok(report.text.includes('| 旧任务 | gpt-5.4 | active | 20:00 |'));
assert.ok(report.text.includes('| 仅持续任务 | gpt-5.4 | active | 3m 12s |'));
assert.ok(report.text.indexOf('新任务') < report.text.indexOf('中间任务'));
assert.ok(report.text.indexOf('中间任务') < report.text.indexOf('旧任务'));
assert.strictEqual(formatTaskTimeCell({ duration: '9m' }), '9m');

const mapped = toReportingTask({
  taskId: 'dispatch-1',
  title: '透传任务',
  agentId: 'coder',
  model: 'gpt-4o-2024-08-06',
  status: 'spawning',
  spawningAt: '2026-03-07T12:10:00.000Z',
  queuedAt: '2026-03-07T12:09:00.000Z'
}, {});
assert.strictEqual(mapped.startedAt, '2026-03-07T12:10:00.000Z');
assert.strictEqual(mapped.spawningAt, '2026-03-07T12:10:00.000Z');
assert.strictEqual(mapped.taskId, 'dispatch-1');

console.log('ok: reporting start/duration passthrough + ordering');
