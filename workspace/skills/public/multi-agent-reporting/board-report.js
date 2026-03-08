'use strict';

/**
 * board-report.js — ISC-REPORT-SUBAGENT-BOARD-001 standard format renderer.
 * 
 * Reads from task-board.json (persistent) and renders:
 * - Real-time board view
 * - History report
 * - Summary report
 */

const fs = require('fs');
const path = require('path');

function readJson(file, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return typeof fallback === 'function' ? fallback() : JSON.parse(JSON.stringify(fallback)); }
}

function pureModel(model) {
  if (!model) return '—';
  let m = String(model);
  if (m.includes('/')) m = m.split('/').pop();
  return m;
}

function fmtTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const STATUS_ICON = {
  running: '🔄', spawning: '⏳', queued: '⏳', done: '✅', completed: '✅',
  failed: '❌', cancelled: '🚫', blocked: '🚧', timeout: '⏰',
};

/**
 * Render ISC-REPORT-SUBAGENT-BOARD-001 format.
 * @param {object} board - Task board snapshot (from task-board.json or engine.getTaskBoard())
 * @param {object} opts - { highlights, risks, decisions, historyLimit }
 */
function renderBoardReport(board, opts = {}) {
  const lines = [];
  const s = board.summary || {};
  const updatedAt = board.updatedAt || new Date().toISOString();

  lines.push('═══ SUBAGENT TASK BOARD ═══');
  lines.push('');
  lines.push(`Board: ${board.boardId || '—'} | Updated: ${fmtTime(updatedAt)}`);
  lines.push(`Slots: ${s.occupied || 0}/${s.maxSlots || 19} occupied | ${s.queued || 0} queued`);
  lines.push(`Registered: ${s.totalRegistered || 0} | Done: ${s.totalCompleted || 0} | Failed: ${s.totalFailed || 0}`);
  lines.push('');

  // Active
  lines.push('── ACTIVE ──────────────────');
  const active = board.active || [];
  if (active.length === 0) {
    lines.push('  (none)');
  } else {
    active.forEach((t, i) => {
      const icon = STATUS_ICON[t.status] || '❓';
      lines.push(`  #${i + 1}  ${icon} [${t.status}]  ${t.title || '—'}  ${pureModel(t.model)}  ${fmtTime(t.runningAt || t.queuedAt)}`);
    });
  }
  lines.push('');

  // Queued
  lines.push('── QUEUED ──────────────────');
  const queued = board.queued || [];
  if (queued.length === 0) {
    lines.push('  (none)');
  } else {
    queued.forEach((t, i) => {
      lines.push(`  #${i + 1}  ⏳ [queued]  ${t.title || '—'}  ${pureModel(t.model)}  ${t.priority || 'normal'}`);
    });
  }
  lines.push('');

  // Summary stats
  lines.push('── SUMMARY ─────────────────');
  lines.push(`  done: ${s.totalCompleted || 0} | failed: ${s.totalFailed || 0} | cancelled: ${s.totalCancelled || 0}`);
  lines.push(`  Total registered: ${s.totalRegistered || 0}`);
  lines.push('');

  // Recent history
  const historyLimit = opts.historyLimit || 10;
  const history = (board.history || []).slice(0, historyLimit);
  if (history.length > 0) {
    lines.push('── RECENT HISTORY ──────────');
    history.forEach((t) => {
      const icon = STATUS_ICON[t.status] || '❓';
      lines.push(`  ${icon} ${t.title || '—'}  ${pureModel(t.model)}  ${t.duration || '—'}  ${fmtTime(t.completedAt)}`);
    });
    lines.push('');
  }

  // Highlights/risks/decisions
  if (opts.highlights && opts.highlights.length) {
    lines.push('── HIGHLIGHTS ──────────────');
    opts.highlights.forEach(h => lines.push(`  - ${h}`));
    lines.push('');
  }
  if (opts.risks && opts.risks.length) {
    lines.push('── RISKS ───────────────────');
    opts.risks.forEach(r => lines.push(`  - ${r}`));
    lines.push('');
  }
  if (opts.decisions && opts.decisions.length) {
    lines.push('── DECISIONS ───────────────');
    opts.decisions.forEach(d => lines.push(`  - ${d}`));
    lines.push('');
  }

  // Batches
  const batches = board.batches || {};
  const activeBatches = Object.values(batches).filter(b => b.status !== 'completed');
  if (activeBatches.length > 0) {
    lines.push('── BATCHES ─────────────────');
    activeBatches.forEach(b => {
      lines.push(`  📦 ${b.label}  ${b.completedCount || 0}/${b.totalCount || 0}  [${b.status}]`);
    });
    lines.push('');
  }

  lines.push('═══ END BOARD ═══');

  return lines.join('\n');
}

/**
 * Render history-only report for a time range.
 */
function renderHistoryReport(history, opts = {}) {
  const lines = [];
  lines.push('═══ TASK HISTORY REPORT ═══');
  lines.push('');

  if (opts.since) lines.push(`Since: ${opts.since}`);
  if (opts.until) lines.push(`Until: ${opts.until}`);
  lines.push(`Total: ${history.length} tasks`);
  lines.push('');

  const done = history.filter(t => t.status === 'done' || t.status === 'completed');
  const failed = history.filter(t => t.status === 'failed');
  const other = history.filter(t => !['done', 'completed', 'failed'].includes(t.status));

  lines.push(`done: ${done.length} | failed: ${failed.length} | other: ${other.length}`);
  lines.push('');

  lines.push('| # | 任务 | 模型 | 状态 | 耗时 | 完成时间 |');
  lines.push('|---|---|---|---|---|---|');
  history.forEach((t, i) => {
    const icon = STATUS_ICON[t.status] || '❓';
    lines.push(`| ${i + 1} | ${t.title || '—'} | ${pureModel(t.model)} | ${icon} ${t.status} | ${t.duration || '—'} | ${fmtTime(t.completedAt)} |`);
  });

  lines.push('');
  lines.push('═══ END HISTORY ═══');
  return lines.join('\n');
}

/**
 * Render auto-summary report.
 */
function renderSummaryReport(summary) {
  const lines = [];
  lines.push('═══ AUTO SUMMARY ═══');
  lines.push('');
  lines.push(`ID: ${summary.summaryId} | Triggered: ${fmtTime(summary.triggeredAt)} | Trigger: ${summary.trigger}`);
  lines.push(`Since last: ${fmtTime(summary.sinceLast)}`);
  lines.push('');

  const st = summary.stats || {};
  lines.push(`Active: ${st.currentActive || 0} | Queued: ${st.currentQueued || 0}`);
  lines.push(`Recent done: ${st.recentDone || 0} | Recent failed: ${st.recentFailed || 0}`);
  lines.push(`Total registered: ${st.totalRegistered || 0} | Total completed: ${st.totalCompleted || 0}`);
  lines.push('');

  const recent = summary.recentCompletions || [];
  if (recent.length > 0) {
    lines.push('Recent completions:');
    recent.forEach(t => {
      const icon = STATUS_ICON[t.status] || '❓';
      lines.push(`  ${icon} ${t.title || '—'}  ${t.duration || '—'}  ${fmtTime(t.completedAt)}`);
    });
  }

  lines.push('');
  lines.push('═══ END SUMMARY ═══');
  return lines.join('\n');
}

/**
 * Load task board from default file and render board report.
 */
function renderBoardFromFile(boardFile, opts = {}) {
  const board = readJson(boardFile);
  return renderBoardReport(board, opts);
}

module.exports = {
  renderBoardReport,
  renderHistoryReport,
  renderSummaryReport,
  renderBoardFromFile,
};
