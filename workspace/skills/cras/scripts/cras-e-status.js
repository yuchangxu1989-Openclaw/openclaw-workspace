#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const WORKSPACE = path.resolve(__dirname, '..');
const SIGNALS_FILE = path.join(WORKSPACE, 'memory', 'cras-e-signals.jsonl');
const TASKS_DIR = path.join(WORKSPACE, 'memory', 'tasks');
const OUT_DIR = path.join(WORKSPACE, 'reports', 'cras-e');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean);
}

function readTasks() {
  if (!fs.existsSync(TASKS_DIR)) return [];
  return fs.readdirSync(TASKS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(fs.readFileSync(path.join(TASKS_DIR, f), 'utf8')));
}

function summarize(signals, tasks) {
  const byPriority = {};
  for (const task of tasks) {
    byPriority[task.priority] = (byPriority[task.priority] || 0) + 1;
  }

  const byKey = {};
  for (const sig of signals) {
    const key = sig.task?.key || 'unknown';
    byKey[key] = (byKey[key] || 0) + 1;
  }

  return {
    timestamp: new Date().toISOString(),
    signal_count: signals.length,
    open_task_count: tasks.filter(t => t.status !== 'done').length,
    priorities: byPriority,
    top_signals: Object.entries(byKey)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([key, count]) => ({ key, count }))
  };
}

function markdown(summary, tasks) {
  const lines = [];
  lines.push('# CRAS-E 持续进化状态');
  lines.push('');
  lines.push(`- 时间: ${summary.timestamp}`);
  lines.push(`- 信号数: ${summary.signal_count}`);
  lines.push(`- 未关闭任务数: ${summary.open_task_count}`);
  lines.push('');
  lines.push('## 优先级分布');
  lines.push('');
  for (const [p, c] of Object.entries(summary.priorities)) {
    lines.push(`- ${p}: ${c}`);
  }
  lines.push('');
  lines.push('## 打透中的任务');
  lines.push('');
  for (const t of tasks) {
    lines.push(`- [${t.priority}] ${t.title} (${t.status})`);
  }
  lines.push('');
  return lines.join('\n');
}

function main() {
  const signals = readJsonl(SIGNALS_FILE);
  const tasks = readTasks();
  const summary = summarize(signals, tasks);
  ensureDir(OUT_DIR);
  const jsonFile = path.join(OUT_DIR, 'latest-summary.json');
  const mdFile = path.join(OUT_DIR, 'latest-summary.md');
  fs.writeFileSync(jsonFile, JSON.stringify(summary, null, 2), 'utf8');
  fs.writeFileSync(mdFile, markdown(summary, tasks), 'utf8');
  console.log(JSON.stringify({ ok: true, jsonFile, mdFile, summary }, null, 2));
}

main();
