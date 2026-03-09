#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { touchReportCounter, readJson } = require('./report-counter');

const WORKSPACE = path.resolve(__dirname, '..');
const TASKS_DIR = path.join(WORKSPACE, 'memory', 'tasks');
const OUT_DIR = path.join(WORKSPACE, 'reports', 'task-queue');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readTasks() {
  if (!fs.existsSync(TASKS_DIR)) return [];
  return fs.readdirSync(TASKS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(fs.readFileSync(path.join(TASKS_DIR, f), 'utf8')));
}

function group(tasks) {
  const root = tasks.filter(t => !t.parent_task);
  const subs = tasks.filter(t => t.parent_task);
  return { root, subs };
}

function render(tasks) {
  const { root, subs } = group(tasks);
  const index = new Map();
  for (const sub of subs) {
    if (!index.has(sub.parent_task)) index.set(sub.parent_task, []);
    index.get(sub.parent_task).push(sub);
  }

  const lines = [];
  lines.push('# 任务队列汇报');
  lines.push('');
  lines.push(`- 时间: ${new Date().toISOString()}`);
  lines.push(`- 根任务: ${root.length}`);
  lines.push(`- 子任务: ${subs.length}`);
  lines.push('');

  // Use shared report counter
  const counterResult = touchReportCounter({
    source: 'task-queue-report',
    event: 'render',
    title: null,
    stats: { root: root.length, subs: subs.length, total: tasks.length },
  });
  const reportCount = counterResult.count;

  for (const task of root) {
    lines.push(`## [${task.priority}] ${task.title}`);
    lines.push(`- 状态: ${task.status}`);
    const children = index.get(task.id) || [];
    lines.push(`- 子任务数: ${children.length}`);
    for (const child of children) {
      lines.push(`  - [${child.kind}] ${child.title} (${child.status})`);
    }
    lines.push('');
  }

  if (reportCount % 3 === 0) {
    lines.push('## 全局进展总结');
    lines.push('');
    const open = tasks.filter(t => t.status !== 'done').length;
    const byKind = {};
    for (const t of subs) byKind[t.kind] = (byKind[t.kind] || 0) + 1;
    lines.push(`- 当前未关闭任务总数: ${open}`);
    lines.push(`- 根任务推进说明: 已具备自动扩列与分层追踪能力`);
    lines.push(`- 子任务结构分布: ${Object.entries(byKind).map(([k,v]) => `${k}:${v}`).join(', ') || '暂无'}`);
    lines.push(`- 结论: 已开始形成“每几次汇报自动总结一次全局进展”的汇报节奏`);
    lines.push('');
  }

  return lines.join('\n');
}

function main() {
  const tasks = readTasks();
  ensureDir(OUT_DIR);
  const md = render(tasks);
  const file = path.join(OUT_DIR, 'latest-report.md');
  fs.writeFileSync(file, md, 'utf8');
  console.log(JSON.stringify({ ok: true, file, taskCount: tasks.length }, null, 2));
}

main();
