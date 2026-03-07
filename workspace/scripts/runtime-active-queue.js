#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const WORKSPACE = path.resolve(__dirname, '..');
const RUNTIME_DIR = path.join(WORKSPACE, 'memory', 'runtime');
const TASKS_DIR = path.join(WORKSPACE, 'memory', 'tasks');
const OUT_DIR = path.join(WORKSPACE, 'reports', 'task-queue');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function readTasks() {
  if (!fs.existsSync(TASKS_DIR)) return [];
  return fs.readdirSync(TASKS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(fs.readFileSync(path.join(TASKS_DIR, f), 'utf8')));
}

function pickActiveRoots(tasks, size = 6) {
  return tasks
    .filter(t => !t.parent_task)
    .sort((a, b) => String(a.priority).localeCompare(String(b.priority)) || String(a.created_at).localeCompare(String(b.created_at)))
    .slice(0, size);
}

function collectChildren(parentId, tasks) {
  return tasks.filter(t => t.parent_task === parentId);
}

function buildRuntimeQueue() {
  const queueFile = path.join(RUNTIME_DIR, 'active-task-queue.json');
  const tasks = readTasks();
  const existing = readJson(queueFile, null);
  const roots = pickActiveRoots(tasks, 6);

  const doing = [];
  const queuedNext = [];
  const inserted = [];

  for (const root of roots) {
    doing.push({
      id: root.id,
      title: root.title,
      priority: root.priority,
      status: 'doing',
      lane: 'root',
      why_now: '高优先级根任务进入进行中队列'
    });

    const children = collectChildren(root.id, tasks);
    const preferredKinds = ['implementation', 'integration', 'validation', 'risk', 'reporting'];
    for (const kind of preferredKinds) {
      const child = children.find(c => c.kind === kind);
      if (!child) continue;
      const entry = {
        id: child.id,
        title: child.title,
        priority: child.priority,
        status: 'queued-next',
        lane: kind,
        parent_task: root.id,
        spawned_from: root.title,
        why_added_now: `进行中根任务 ${root.title} 需要同步推进 ${kind}`,
        inserted_at_runtime: new Date().toISOString()
      };
      queuedNext.push(entry);
      inserted.push(entry);
    }
  }

  const { readJson: readCounter } = require('./report-counter');
  const COUNTER_FILE = path.join(OUT_DIR, 'report-counter.json');
  const reportCounter = readCounter(COUNTER_FILE, { count: 0 }).count || 0;
  if (reportCounter > 0 && reportCounter % 3 === 0) {
    queuedNext.unshift({
      id: `runtime-global-summary-${Date.now()}`,
      title: '全局进展总结 / 运行时自动插入',
      priority: 'P0',
      status: 'queued-next',
      lane: 'global-summary',
      spawned_from: 'reporting-cycle',
      why_added_now: '达到每3次汇报一次全局总结的阈值',
      inserted_at_runtime: new Date().toISOString()
    });
  }

  const queue = {
    timestamp: new Date().toISOString(),
    mode: 'runtime-active-queue',
    doing,
    queued_next: queuedNext,
    blocked: existing?.blocked || [],
    inserted_runtime: inserted,
    notes: [
      '这不是静态任务仓库，而是进行中的动态任务列',
      'queued_next 表示运行时根据当前推进态自动插入的任务'
    ]
  };

  writeJson(queueFile, queue);
  return { queueFile, queue };
}

function main() {
  const result = buildRuntimeQueue();
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
}

main();
