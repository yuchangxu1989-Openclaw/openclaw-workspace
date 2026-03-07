#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const WORKSPACE = path.resolve(__dirname, '..');
const bus = require(path.join(WORKSPACE, 'infrastructure', 'event-bus', 'bus-adapter.js'));

const TRACKER_PATH = path.join(WORKSPACE, 'PROJECT-TRACKER.md');
const TASKS_DIR = path.join(WORKSPACE, 'memory', 'tasks');
const SIGNALS_FILE = path.join(WORKSPACE, 'memory', 'cras-e-signals.jsonl');
const STATUS_DIR = path.join(WORKSPACE, 'reports', 'cras-e');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

function slugify(input) {
  return String(input || 'task')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'task';
}

function appendJsonl(file, record) {
  ensureDir(path.dirname(file));
  fs.appendFileSync(file, JSON.stringify(record) + '\n', 'utf8');
}

function readTracker() {
  if (!fs.existsSync(TRACKER_PATH)) return '';
  return fs.readFileSync(TRACKER_PATH, 'utf8');
}

function writeTracker(content) {
  fs.writeFileSync(TRACKER_PATH, content, 'utf8');
}

function classifyMessage(message) {
  const text = String(message || '');
  const tasks = [];
  const lower = text.toLowerCase();

  const patterns = [
    {
      key: 'cras_e_rebuild',
      title: 'CRAS-E持续进化中枢改造',
      priority: 'P0',
      evidence: 'CRAS不能只是定时任务，必须是个持续进化的技能',
      triggers: [/cras-e/i, /持续进化/, /不能只是定时任务/]
    },
    {
      key: 'memoryless_evolution',
      title: '失忆后可持续进化保障',
      priority: 'P0',
      evidence: '如果你失忆了，还能像最近这几次任务一样自主进化么？一定要确保',
      triggers: [/失忆/, /自主进化/, /确保/]
    },
    {
      key: 'per_turn_intent',
      title: '每轮对话意图洞察强制化',
      priority: 'P0',
      evidence: '你现在每轮对话都洞察我意图并自主进化么',
      triggers: [/每轮对话/, /洞察我意图/, /自主进化/]
    },
    {
      key: 'day2_closure',
      title: 'Day2遗留项逐桩打透',
      priority: 'P1',
      evidence: 'Day2还有遗留项么',
      triggers: [/day2/i, /遗留项/]
    },
    {
      key: 'no_empty_shell',
      title: '禁止空架子产物治理',
      priority: 'P0',
      evidence: '一个个桩打透，别都做空架子',
      triggers: [/空架子/, /桩打透/]
    }
  ];

  for (const p of patterns) {
    if (p.triggers.some(re => re.test(text) || re.test(lower))) {
      tasks.push({
        id: `task-${p.key}`,
        key: p.key,
        title: p.title,
        priority: p.priority,
        source: 'conversation',
        evidence: p.evidence
      });
    }
  }

  return tasks;
}

function upsertTasksIntoTracker(tasks) {
  if (!tasks.length) return { updated: false, inserted: [] };
  let tracker = readTracker();
  const marker = '## Sprint 1: 全系统闭环修复工程（L3架构重构）';
  if (!tracker.includes(marker)) {
    return { updated: false, inserted: [] };
  }

  const sectionTitle = '### CRAS-E / 意图内化 高优先级任务（自动提取）';
  let section = `${sectionTitle}\n\n`;
  const inserted = [];

  for (const task of tasks) {
    if (tracker.includes(task.title)) continue;
    inserted.push(task.title);
    section += `- 🔴 ${task.priority} ${task.title} — 证据：${task.evidence}\n`;
  }

  if (!inserted.length) return { updated: false, inserted: [] };

  if (tracker.includes(sectionTitle)) {
    tracker = tracker.replace(sectionTitle, section.trimEnd() + '\n');
  } else {
    tracker = tracker.replace(marker, `${marker}\n\n${section}`);
  }
  writeTracker(tracker);
  return { updated: true, inserted };
}

function persistTasks(tasks) {
  ensureDir(TASKS_DIR);
  const written = [];
  for (const task of tasks) {
    const file = path.join(TASKS_DIR, `${slugify(task.key)}.json`);
    const payload = {
      ...task,
      status: 'open',
      created_at: nowIso(),
      owner: 'main/unknown',
      acceptance: [
        '必须有代码/规则/测试/文档至少两类硬产物',
        '必须能被失忆后复用',
        '禁止只停留在报告或口头承诺'
      ]
    };
    fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8');
    written.push(file);
  }
  return written;
}

function emitSignals(tasks, message) {
  const emitted = [];
  for (const task of tasks) {
    const signal = {
      id: `sig_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: 'system.evolution.opportunity_detected',
      timestamp: nowIso(),
      task,
      raw_message: message
    };
    appendJsonl(SIGNALS_FILE, signal);
    bus.emit('system.evolution.opportunity_detected', signal, 'cras-e-capture', {
      layer: 'META',
      priority: task.priority,
      confidence: 0.96
    });
    emitted.push(signal.id);
  }
  return emitted;
}

function writeStatus(summary) {
  ensureDir(STATUS_DIR);
  const out = path.join(STATUS_DIR, 'latest-capture.json');
  fs.writeFileSync(out, JSON.stringify(summary, null, 2), 'utf8');
  return out;
}

function main() {
  const message = process.argv.slice(2).join(' ').trim();
  if (!message) {
    console.error('Usage: node scripts/cras-e-capture.js "<message>"');
    process.exit(1);
  }

  const tasks = classifyMessage(message);
  const tracker = upsertTasksIntoTracker(tasks);
  const files = persistTasks(tasks);
  const emitted = emitSignals(tasks, message);
  const statusFile = writeStatus({
    timestamp: nowIso(),
    taskCount: tasks.length,
    tracker,
    files,
    emitted
  });

  console.log(JSON.stringify({
    ok: true,
    tasks,
    tracker,
    files,
    emitted,
    statusFile
  }, null, 2));
}

main();
