#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const WORKSPACE = path.resolve(__dirname, '..');
const QUEUE_FILE = path.join(WORKSPACE, 'memory', 'runtime', 'active-task-queue.json');
const OUT_DIR = path.join(WORKSPACE, 'reports', 'task-queue');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readQueue() {
  if (!fs.existsSync(QUEUE_FILE)) {
    return { doing: [], queued_next: [], blocked: [], inserted_runtime: [] };
  }
  return JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
}

function render(queue) {
  const lines = [];
  lines.push('# 进行中的动态任务列');
  lines.push('');
  lines.push(`- 时间: ${new Date().toISOString()}`);
  lines.push(`- Doing: ${queue.doing.length}`);
  lines.push(`- Queued Next: ${queue.queued_next.length}`);
  lines.push(`- Blocked: ${queue.blocked.length}`);
  lines.push('');

  lines.push('## Doing');
  lines.push('');
  for (const t of queue.doing) {
    lines.push(`- [${t.priority}] ${t.title} :: ${t.why_now}`);
  }
  lines.push('');

  lines.push('## Queued Next（运行时动态插入）');
  lines.push('');
  for (const t of queue.queued_next) {
    lines.push(`- [${t.priority}] ${t.title}`);
    lines.push(`  - 来源: ${t.spawned_from || 'runtime'}`);
    lines.push(`  - 原因: ${t.why_added_now || '运行时自动插入'}`);
  }
  lines.push('');

  if (queue.blocked.length > 0) {
    lines.push('## Blocked');
    lines.push('');
    for (const t of queue.blocked) {
      lines.push(`- ${t.title}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function main() {
  ensureDir(OUT_DIR);
  const queue = readQueue();
  const md = render(queue);
  const file = path.join(OUT_DIR, 'active-runtime-queue.md');
  fs.writeFileSync(file, md, 'utf8');
  console.log(JSON.stringify({ ok: true, file, doing: queue.doing.length, queued_next: queue.queued_next.length }, null, 2));
}

main();
