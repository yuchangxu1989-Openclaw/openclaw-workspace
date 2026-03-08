#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const file = path.join(__dirname, '..', 'skills', 'public', 'multi-agent-reporting', 'index.js');
const src = fs.readFileSync(file, 'utf8');

function extractConst(name) {
  const re = new RegExp(`const\\s+${name}\\s*=\\s*([^;]+);`);
  const m = src.match(re);
  if (!m) throw new Error(`const not found: ${name}`);
  return m[1];
}

function extractFunction(name) {
  const marker = `function ${name}(`;
  const start = src.indexOf(marker);
  if (start === -1) throw new Error(`function not found: ${name}`);
  let paren = 0;
  let bodyStart = -1;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (ch === '(') paren++;
    else if (ch === ')') {
      paren--;
      if (paren === 0) {
        bodyStart = src.indexOf('{', i);
        break;
      }
    }
  }
  if (bodyStart === -1) throw new Error(`function body not found: ${name}`);
  let depth = 0;
  for (let j = bodyStart; j < src.length; j++) {
    const ch = src[j];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return src.slice(start, j + 1);
    }
  }
  throw new Error(`function parse failed: ${name}`);
}

const bootstrap = [
  `const DONE_REALTIME_TTL_MS = ${extractConst('DONE_REALTIME_TTL_MS')};`,
  `const STATUS_ORDER = ${extractConst('STATUS_ORDER')};`,
  extractFunction('normalizeStatus'),
  extractFunction('taskStartAt'),
  extractFunction('compareTasksByStartTimeDesc'),
  extractFunction('statusOrder'),
  extractFunction('compareTasksForDashboard'),
  extractFunction('isDoneRecentEnough'),
  extractFunction('selectVisibleTasks'),
  extractFunction('selectExpiredDoneTasks'),
  'module.exports = { DONE_REALTIME_TTL_MS, isDoneRecentEnough, selectVisibleTasks, selectExpiredDoneTasks };'
].join('\n\n');

const sandbox = { module: { exports: {} }, exports: {}, console, Date };
vm.runInNewContext(bootstrap, sandbox);
const { DONE_REALTIME_TTL_MS, isDoneRecentEnough, selectVisibleTasks, selectExpiredDoneTasks } = sandbox.module.exports;

assert.strictEqual(DONE_REALTIME_TTL_MS, 10 * 60 * 1000, 'TTL constant should stay 10 minutes');

const now = Date.parse('2026-03-08T01:00:00.000Z');
const tasks = [
  { taskId: 'run-1', task: 'Running task', status: 'running', runningAt: '2026-03-08T00:58:00.000Z' },
  { taskId: 'done-9', task: 'Done within ttl', status: 'done', finishedAt: '2026-03-08T00:51:00.000Z' },
  { taskId: 'done-10', task: 'Done exactly ttl', status: 'done', finishedAt: '2026-03-08T00:50:00.000Z' },
  { taskId: 'done-11', task: 'Done expired ttl', status: 'done', finishedAt: '2026-03-08T00:49:00.000Z' },
  { taskId: 'queue-1', task: 'Queued task', status: 'queued', queuedAt: '2026-03-08T00:59:00.000Z' }
];

const visible = Array.from(selectVisibleTasks(tasks, { nowMs: now }), t => t.taskId);
const expired = Array.from(selectExpiredDoneTasks(tasks, { nowMs: now }), t => t.taskId);

assert.deepStrictEqual(
  visible,
  ['run-1', 'queue-1', 'done-9', 'done-10'],
  'visible realtime board should keep done<=10min and hide only older completions'
);
assert.deepStrictEqual(
  expired,
  ['done-11'],
  'historical archive bucket should retain expired done tasks'
);
assert.strictEqual(isDoneRecentEnough(tasks[2], now), true, 'exactly 10 minutes should still be visible');
assert.strictEqual(isDoneRecentEnough(tasks[3], now), false, 'older than 10 minutes should be hidden');

console.log('ok: done TTL filters realtime board, preserves expired done history');
