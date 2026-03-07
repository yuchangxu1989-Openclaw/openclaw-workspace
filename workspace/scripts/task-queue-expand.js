#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const WORKSPACE = path.resolve(__dirname, '..');
const TASKS_DIR = path.join(WORKSPACE, 'memory', 'tasks');
const TRACKER_PATH = path.join(WORKSPACE, 'PROJECT-TRACKER.md');
const OUT_DIR = path.join(WORKSPACE, 'reports', 'task-queue');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function slugify(input) {
  return String(input || 'task')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'task';
}

function readTasks() {
  if (!fs.existsSync(TASKS_DIR)) return [];
  return fs.readdirSync(TASKS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => ({ file: path.join(TASKS_DIR, f), data: JSON.parse(fs.readFileSync(path.join(TASKS_DIR, f), 'utf8')) }));
}

function writeTask(file, data) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function createSubtasks(task) {
  const base = task.title;
  const priority = task.priority || 'P1';
  return [
    { title: `${base} / 主实现`, kind: 'implementation', priority },
    { title: `${base} / 集成改造`, kind: 'integration', priority },
    { title: `${base} / 验证测试`, kind: 'validation', priority },
    { title: `${base} / 风险治理`, kind: 'risk', priority },
    { title: `${base} / 汇报与验收`, kind: 'reporting', priority }
  ];
}

function existsByTitle(title, tasks) {
  return tasks.some(t => t.data.title === title);
}

function expandQueue() {
  const tasks = readTasks();
  const created = [];

  for (const item of tasks) {
    const task = item.data;
    if (task.parent_task) continue;
    if (task.expanded_at) continue;

    const subtasks = createSubtasks(task);
    for (const sub of subtasks) {
      if (existsByTitle(sub.title, tasks) || created.find(c => c.title === sub.title)) continue;
      const payload = {
        id: `subtask-${slugify(sub.title)}`,
        title: sub.title,
        priority: sub.priority,
        kind: sub.kind,
        status: 'open',
        parent_task: task.id,
        created_at: new Date().toISOString(),
        acceptance: [
          '必须有可验证产物',
          '必须和主任务可追溯关联'
        ]
      };
      const file = path.join(TASKS_DIR, `${slugify(sub.title)}.json`);
      writeTask(file, payload);
      created.push(payload);
    }

    task.expanded_at = new Date().toISOString();
    task.expansion_count = subtasks.length;
    writeTask(item.file, task);
  }

  return created;
}

function updateTracker(created) {
  if (!created.length || !fs.existsSync(TRACKER_PATH)) return false;
  let tracker = fs.readFileSync(TRACKER_PATH, 'utf8');
  const sectionTitle = '### 自主扩列任务（自动生成）';
  let section = `${sectionTitle}\n\n`;
  for (const task of created) {
    section += `- ⏳ ${task.priority} ${task.title} [parent=${task.parent_task}]\n`;
  }
  if (tracker.includes(sectionTitle)) {
    tracker = tracker.replace(sectionTitle, section.trimEnd() + '\n');
  } else {
    tracker += `\n\n${section}`;
  }
  fs.writeFileSync(TRACKER_PATH, tracker, 'utf8');
  return true;
}

function writeSummary(created) {
  ensureDir(OUT_DIR);
  const tasks = readTasks().map(x => x.data);
  const summary = {
    timestamp: new Date().toISOString(),
    created_count: created.length,
    total_tasks: tasks.length,
    parent_tasks: tasks.filter(t => !t.parent_task).length,
    sub_tasks: tasks.filter(t => t.parent_task).length
  };
  const file = path.join(OUT_DIR, 'queue-expansion-latest.json');
  fs.writeFileSync(file, JSON.stringify(summary, null, 2), 'utf8');
  return { summary, file };
}

function main() {
  const created = expandQueue();
  const trackerUpdated = updateTracker(created);
  const summary = writeSummary(created);
  console.log(JSON.stringify({ ok: true, created, trackerUpdated, ...summary }, null, 2));
}

main();
