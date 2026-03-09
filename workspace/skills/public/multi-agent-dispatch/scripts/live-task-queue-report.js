#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { renderReport } = require('../skills/public/multi-agent-reporting');
const { DispatchEngine } = require('../skills/public/multi-agent-dispatch/dispatch-engine');
const { ReportTrigger } = require('../skills/public/multi-agent-reporting/report-trigger');
const { readPending } = require('../skills/public/multi-agent-dispatch/dispatch-bridge');
const { touchReportCounter } = require('./report-counter');

const WORKSPACE = path.resolve(__dirname, '..');
const OUT_DIR = path.join(WORKSPACE, 'reports', 'task-queue');
const SNAPSHOT_FILE = path.join(OUT_DIR, 'live-task-queue-report.json');
const MESSAGE_QUEUE = path.join(OUT_DIR, 'live-task-queue-message.txt');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function summarizeDelivery(tasks) {
  const summary = {
    total: tasks.length,
    pending: 0,
    acked: 0,
    spawned: 0,
    delivered: 0,
    failed: 0,
  };

  for (const task of tasks) {
    const state = task.delivery?.state || 'pending';
    if (Object.prototype.hasOwnProperty.call(summary, state)) summary[state]++;
  }

  return summary;
}

function buildDeliveryElements(deliverySummary, tasks) {
  const failing = tasks.filter(t => t.delivery?.state === 'failed').slice(0, 5);
  const elements = [
    { tag: 'hr' },
    { tag: 'markdown', content: `**送达链**：pending ${deliverySummary.pending} / acked ${deliverySummary.acked} / spawned ${deliverySummary.spawned} / delivered ${deliverySummary.delivered} / failed ${deliverySummary.failed}` },
  ];

  if (failing.length > 0) {
    elements.push({ tag: 'markdown', content: `**送达失败**\n${failing.map(t => `- ${t.title || t.taskId}: ${t.delivery?.error || 'unknown error'}`).join('\n')}` });
  }

  return elements;
}

function mergeCard(report, pendingState) {
  const tasks = Array.isArray(pendingState?.tasks) ? pendingState.tasks : [];
  const deliverySummary = summarizeDelivery(tasks);
  const card = report.card && typeof report.card === 'object'
    ? JSON.parse(JSON.stringify(report.card))
    : { config: { wide_screen_mode: true }, header: { template: 'blue', title: { tag: 'plain_text', content: report.title || '🔄 进行中的任务队列' } }, elements: [] };

  card.elements = Array.isArray(card.elements) ? card.elements : [];
  card.elements.push(...buildDeliveryElements(deliverySummary, tasks));

  return {
    ...report,
    generatedAt: new Date().toISOString(),
    delivery: {
      summary: deliverySummary,
      tasks,
    },
    card,
  };
}

function seedEngine(engine) {
  const tasks = [
    { title: 'CRAS-E持续进化中枢改造', agentId: 'analyst', model: 'boom-analyst/gpt-5.4', priority: 'high' },
    { title: '每轮对话意图洞察强制化', agentId: 'coder', model: 'boom-coder/gpt-5.4', priority: 'high' },
    { title: '失忆后可持续进化保障', agentId: 'researcher', model: 'boom-researcher/gpt-5.4', priority: 'high' },
    { title: '任务队列卡片送达链固化', agentId: 'writer', model: 'boom-writer/gpt-5.4', priority: 'critical' },
    { title: 'Day2五大gap closure收口', agentId: 'reviewer', model: 'boom-reviewer/gpt-5.4', priority: 'high' },
    { title: '阶段性全局进展汇报接入', agentId: 'scout', model: 'boom-scout/gpt-5.4', priority: 'normal' },
    { title: '主会话真实发送路径复用', agentId: 'engineer', model: 'boom-engineer/gpt-5.4', priority: 'critical' },
    { title: '假发送链清理与替换', agentId: 'auditor', model: 'boom-auditor/gpt-5.4', priority: 'normal' }
  ];
  engine.enqueueBatch(tasks);
  for (const task of engine.allTasks()) {
    if (task.status === 'queued' || task.status === 'spawning') {
      engine.markRunning(task.taskId, { sessionKey: `live-${task.taskId}` });
    }
  }

  const running = engine.allTasks().filter(t => t.status === 'running');
  if (running[0]) engine.markDone(running[0].taskId, { duration: '6m' });
  if (running[1]) engine.markFailed(running[1].taskId, { error: '主会话真实卡片送达链尚未完全固化', duration: '8m' });
  if (running[2]) engine.heartbeat(running[2].taskId, { duration: '5m', note: '持续推进中' });
}

function main() {
  ensureDir(OUT_DIR);
  const engine = new DispatchEngine({ maxSlots: 18 });
  engine.reset();
  const reports = [];
  const trigger = new ReportTrigger(engine, {
    renderOpts: { showQueued: true, title: '🔄 进行中的任务队列' },
    globalProgressInterval: 3,  // 每3次汇报插入阶段性全局进展总结
    onReport: (report) => reports.push(report)
  });

  seedEngine(engine);

  const latest = reports[reports.length - 1] || renderReport([], { title: '🔄 进行中的任务队列' });
  const merged = mergeCard(latest, readPending());

  // Persist report counter for cross-invocation tracking
  touchReportCounter({
    source: 'live-task-queue-report',
    event: latest.event || 'seed',
    title: latest.title,
    stats: latest.stats,
  });

  fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(merged, null, 2), 'utf8');
  fs.writeFileSync(MESSAGE_QUEUE, merged.text, 'utf8');
  console.log(JSON.stringify({
    ok: true,
    snapshot: SNAPSHOT_FILE,
    message: MESSAGE_QUEUE,
    title: merged.title,
    delivery: merged.delivery.summary,
    reportCount: trigger.reportCount,
    hasGlobalProgress: !!latest.globalProgress,
  }, null, 2));
  trigger.detach();
}

main();
