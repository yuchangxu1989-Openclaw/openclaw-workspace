/**
 * global-progress.js — Periodic Global Progress Summary Generator
 *
 * Computes a structured snapshot of overall system progress for insertion
 * into periodic reports. Designed to be called by ReportTrigger every N reports.
 *
 * Output: { text, cardElement, data }
 *   - text: Markdown block for text reports
 *   - cardElement: Feishu card element array
 *   - data: structured JSON for programmatic consumption
 */

'use strict';

// ── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULTS = {
  /** Insert a global progress summary every N reports */
  interval: 3,
  /** Maximum number of recently completed tasks to highlight */
  maxRecentCompleted: 5,
  /** Maximum number of risk items to show */
  maxRisks: 5,
  /** Maximum number of decision items to show */
  maxDecisions: 3,
};

// ── Compute progress data from dispatch engine state ─────────────────────────

/**
 * Build global progress data from engine liveBoard + allTasks.
 *
 * @param {object} engineOrSnapshot  — DispatchEngine instance or { liveBoard, allTasks, finished }
 * @returns {object} progress data
 */
function computeGlobalProgress(engineOrSnapshot) {
  let board, allTasks, finished;

  if (typeof engineOrSnapshot.liveBoard === 'function') {
    // It's a DispatchEngine instance
    board = engineOrSnapshot.liveBoard();
    allTasks = engineOrSnapshot.allTasks();
    const state = engineOrSnapshot._load();
    finished = state.finished || [];
  } else {
    // It's a pre-built snapshot
    board = engineOrSnapshot.liveBoard || {};
    allTasks = engineOrSnapshot.allTasks || [];
    finished = engineOrSnapshot.finished || [];
  }

  const summary = board.summary || {};
  const now = new Date().toISOString();

  // Categorize tasks
  const running = allTasks.filter(t => t.status === 'running' || t.status === 'spawning');
  const queued = allTasks.filter(t => t.status === 'queued');
  const done = finished.filter(t => t.status === 'done');
  const failed = finished.filter(t => t.status === 'failed');
  const occupiedKeys = Number.isFinite(summary.trueOccupiedModelKeys)
    ? summary.trueOccupiedModelKeys
    : (Number.isFinite(summary.occupiedModelKeyCount) ? summary.occupiedModelKeyCount : (summary.busySlots || 0));

  // Recent completions (last N)
  const recentCompleted = done.slice(0, DEFAULTS.maxRecentCompleted).map(t => ({
    title: t.title,
    agentId: t.agentId,
    duration: t.duration || '—',
    finishedAt: t.finishedAt,
  }));

  // Active risks
  const activeRisks = failed.slice(0, DEFAULTS.maxRisks).map(t => ({
    title: t.title,
    agentId: t.agentId,
    error: t.error || '原因待查',
  }));

  // Utilisation
  const utilisation = summary.maxSlots
    ? ((occupiedKeys / summary.maxSlots) * 100).toFixed(1) + '%'
    : summary.utilisation || '0.0%';

  return {
    timestamp: now,
    maxSlots: summary.maxSlots || 0,
    busySlots: occupiedKeys,
    acceptedCount: summary.acceptedCount || (running.length + queued.length),
    queuedCount: summary.queuedCount || queued.length,
    ackedCount: summary.ackedCount || 0,
    deliveredCount: summary.deliveredCount || 0,
    trueOccupiedModelKeys: occupiedKeys,
    freeSlots: summary.freeSlots || 0,
    utilisation,
    totalRunning: running.length,
    totalQueued: queued.length,
    totalCompleted: done.length,
    totalFailed: failed.length,
    totalTasks: allTasks.length,
    recentCompleted,
    activeRisks,
    healthVerdict: failed.length === 0
      ? (running.length > 0 ? '🟢 健康运行' : '⚪ 空闲')
      : (failed.length >= 3 ? '🔴 多项失败需介入' : '🟡 存在风险项'),
  };
}

// ── Render progress as Markdown text ─────────────────────────────────────────

function renderProgressText(progress) {
  const lines = [];
  lines.push('---');
  lines.push(`### 📊 阶段性全局进展总结`);
  lines.push('');
  lines.push(`| 指标 | 值 |`);
  lines.push(`|------|-----|`);
  lines.push(`| 系统状态 | ${progress.healthVerdict} |`);
  lines.push(`| 槽位利用率 | ${progress.utilisation} (${progress.busySlots}/${progress.maxSlots}) |`);
  lines.push(`| 执行中 | ${progress.totalRunning} |`);
  lines.push(`| 排队中 | ${progress.totalQueued} |`);
  lines.push(`| 已完成 | ${progress.totalCompleted} |`);
  lines.push(`| 已失败 | ${progress.totalFailed} |`);
  lines.push('');

  if (progress.recentCompleted.length > 0) {
    lines.push(`**近期完成 (${progress.recentCompleted.length})**`);
    for (const t of progress.recentCompleted) {
      lines.push(`- ✅ ${t.title} · ${t.duration}`);
    }
    lines.push('');
  }

  if (progress.activeRisks.length > 0) {
    lines.push(`**活跃风险 (${progress.activeRisks.length})**`);
    for (const r of progress.activeRisks) {
      lines.push(`- ❌ ${r.title}：${r.error}`);
    }
    lines.push('');
  }

  lines.push(`_全局总结每 ${DEFAULTS.interval} 次汇报自动插入_`);
  return lines.join('\n');
}

// ── Render progress as Feishu card elements ──────────────────────────────────

function renderProgressCardElements(progress) {
  const elements = [];

  elements.push({ tag: 'hr' });
  elements.push({
    tag: 'div',
    text: {
      tag: 'lark_md',
      content: `**📊 阶段性全局进展总结**\n${progress.healthVerdict} · 利用率 ${progress.utilisation} · 执行 ${progress.totalRunning} · 排队 ${progress.totalQueued} · 完成 ${progress.totalCompleted} · 失败 ${progress.totalFailed}`
    }
  });

  if (progress.recentCompleted.length > 0) {
    const completedLines = progress.recentCompleted
      .map(t => `✅ ${t.title} · ${t.duration}`)
      .join('\n');
    elements.push({
      tag: 'div',
      text: { tag: 'lark_md', content: `**近期完成**\n${completedLines}` }
    });
  }

  if (progress.activeRisks.length > 0) {
    const riskLines = progress.activeRisks
      .map(r => `❌ ${r.title}：${r.error}`)
      .join('\n');
    elements.push({
      tag: 'div',
      text: { tag: 'lark_md', content: `**活跃风险**\n${riskLines}` }
    });
  }

  return elements;
}

// ── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  DEFAULTS,
  computeGlobalProgress,
  renderProgressText,
  renderProgressCardElements,
};
