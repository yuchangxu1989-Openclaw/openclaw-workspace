#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  renderText,
  renderCard,
  renderReport,
  computeStats,
  normalizeStatus,
} = require('../index.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`✅ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`❌ ${name}`);
    console.error(`   ${err.message}`);
  }
}

const mixedTasks = [
  { task: '任务A', model: 'boom-writer/gpt-5.4', status: 'running' },
  { task: '任务B', model: 'boom-researcher/gpt-5.4', status: 'completed' },
  { task: '任务C', model: 'boom-coder/gpt-5.4', status: 'failed' },
  { task: '任务D', model: 'boom-reviewer/gpt-5.4', status: 'timeout' },
  { task: '任务E', model: 'boom-main/gpt-5.4', status: 'queued' },
];

const manyTasks = Array.from({ length: 21 }, (_, i) => ({
  task: `任务${i + 1}`,
  model: 'boom-writer/gpt-5.4',
  status: i < 3 ? 'running' : 'completed'
}));

test('normalizeStatus maps active aliases', () => {
  assert.strictEqual(normalizeStatus('running'), 'active');
  assert.strictEqual(normalizeStatus('in_progress'), 'active');
});

test('computeStats only counts active in title metric, but keeps summary counts', () => {
  const stats = computeStats(mixedTasks);
  assert.strictEqual(stats.total, 5);
  assert.strictEqual(stats.active, 1);
  assert.strictEqual(stats.done, 1);
  assert.strictEqual(stats.blocked, 1);
  assert.strictEqual(stats.timeout, 1);
  assert.strictEqual(stats.queued, 1);
});

test('renderText shows only active/uncompleted tasks by default', () => {
  const text = renderText(mixedTasks);
  assert.ok(text.includes('| 任务A | gpt-5.4 | active |'));
  assert.ok(text.includes('| 任务C | gpt-5.4 | blocked |'));
  assert.ok(text.includes('| 任务D | gpt-5.4 | timeout |'));
  assert.ok(text.includes('| 任务E | gpt-5.4 | queued |'));
  assert.ok(!text.includes('任务B'));
  assert.ok(text.includes('- done：0'));
  assert.ok(text.includes('- timeout：1'));
  assert.ok(text.includes('- blocked：1'));
});

test('when task count exceeds 20, completed tasks are refreshed out and only active tasks remain', () => {
  const text = renderText(manyTasks);
  assert.ok(text.includes('Agent并行总数：3'));
  assert.ok(text.includes('| 任务1 | gpt-5.4 | active |'));
  assert.ok(text.includes('| 任务2 | gpt-5.4 | active |'));
  assert.ok(text.includes('| 任务3 | gpt-5.4 | active |'));
  assert.ok(!text.includes('任务4'));
  assert.ok(text.includes('- done：0'));
});

test('renderCard follows same filtered rule', () => {
  const card = renderCard(mixedTasks);
  const body = JSON.stringify(card);
  assert.ok(body.includes('任务A'));
  assert.ok(body.includes('任务C'));
  assert.ok(!body.includes('任务B'));
});

test('renderReport exposes filtered stats for downstream reporting', () => {
  const report = renderReport(manyTasks);
  assert.strictEqual(report.stats.total, 3);
  assert.strictEqual(report.stats.active, 3);
  assert.strictEqual(report.stats.done, 0);
});

if (failed > 0) {
  console.error(`\n${failed} test(s) failed, ${passed} passed.`);
  process.exit(1);
}

console.log(`\nAll ${passed} tests passed.`);
