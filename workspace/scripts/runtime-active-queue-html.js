#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const WORKSPACE = path.resolve(__dirname, '..');
const QUEUE_FILE = path.join(WORKSPACE, 'memory', 'runtime', 'active-task-queue.json');
const OUT_DIR = path.join(WORKSPACE, 'reports', 'task-queue');
const HTML_FILE = path.join(OUT_DIR, 'active-runtime-queue.html');

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function card(title, items, color) {
  const body = items.length
    ? items.map(item => `<div class="item"><div class="title">${esc(item.title)}</div><div class="meta">${esc(item.priority || '')} ${esc(item.why_now || item.why_added_now || '')}</div></div>`).join('')
    : '<div class="empty">暂无</div>';
  return `<section class="col"><div class="head ${color}">${esc(title)} <span>${items.length}</span></div><div class="body">${body}</div></section>`;
}

function main() {
  const q = readJson(QUEUE_FILE, { doing: [], queued_next: [], blocked: [] });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Runtime Active Queue</title>
<style>
body{font-family:Inter,Arial,sans-serif;background:#0b1020;color:#e5e7eb;margin:0;padding:24px}
.wrap{max-width:1400px;margin:0 auto}.top{display:flex;justify-content:space-between;align-items:center;margin-bottom:18px}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.col{background:#111827;border:1px solid #1f2937;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,.25)}
.head{padding:14px 16px;font-weight:700;display:flex;justify-content:space-between}.blue{background:#1d4ed8}.amber{background:#b45309}.red{background:#b91c1c}
.body{padding:14px 16px;display:flex;flex-direction:column;gap:12px;min-height:320px}.item{padding:12px;border-radius:12px;background:#0f172a;border:1px solid #243041}.title{font-size:14px;font-weight:700;margin-bottom:6px}.meta{font-size:12px;color:#93c5fd;line-height:1.4}.empty{color:#6b7280}
.note{margin-top:18px;color:#93c5fd;font-size:13px}
</style></head><body><div class="wrap"><div class="top"><h1>进行中的动态任务列</h1><div>${esc(q.timestamp || '')}</div></div>
<div class="grid">
${card('Doing', q.doing || [], 'blue')}
${card('Queued Next', q.queued_next || [], 'amber')}
${card('Blocked', q.blocked || [], 'red')}
</div>
<div class="note">这是运行时动态任务列，不是静态任务仓库。Queued Next 表示执行中自动插入的后续任务。</div>
</div></body></html>`;
  fs.writeFileSync(HTML_FILE, html, 'utf8');
  console.log(JSON.stringify({ ok: true, file: HTML_FILE }, null, 2));
}

main();
