/**
 * multi-agent-reporting v4.0.0
 *
 * Dashboard contract (updated):
 *   1. TOP SUMMARY: Agent并行总数 X (= occupied keys = 1 agent / 1 task / 1 key)
 *      + occupied/free/queued breakdown + abnormal (blocked/timeout) count
 *   2. MAIN LIST: active → queued → blocked first; newest tasks first within each group
 *   3. DONE: moves to footer summary only; hidden from real-time view/stats after 10 min
 *      (preserved in history); shown as compact footer line, not in main table
 *   4. OUTPUT: both text (markdown table) and card (Feishu interactive card) + html dashboard
 */

'use strict';

const DONE_REALTIME_TTL_MS = 10 * 60 * 1000; // 10 minutes

// ── Status normalisation ─────────────────────────────────────────────────────

function normalizeStatus(status) {
  const s = String(status || '').toLowerCase();
  if (['running', 'active', 'in_progress', 'spawning'].includes(s)) return 'active';
  if (['completed', 'complete', 'done', 'success'].includes(s)) return 'done';
  if (['blocked', 'failed', 'fail', 'error'].includes(s)) return 'blocked';
  if (['timeout', 'timed_out'].includes(s)) return 'timeout';
  if (['queued', 'pending', 'waiting', 'spawning'].includes(s)) return 'queued';
  return s || 'unknown';
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function pureModel(model) {
  if (!model) return '—';
  let m = String(model);
  if (m.includes('/')) m = m.split('/').pop();
  m = m.replace(/-preview-\d{2,4}[-/]\d{2}([-/]\d{2})?$/, '');
  m = m.replace(/-\d{4}-\d{2}-\d{2}$/, '');
  m = m.replace(/-\d{8}$/, '');
  m = m.replace(/-preview$/, '');
  return m;
}

function esc(value) {
  return String(value ?? '—').replace(/\|/g, '\\|');
}

function hasRuntimeModelKey(task) {
  const candidates = [
    task && task.modelKey,
    task && task.runtimeModelKey,
    task && task.model_key,
    task && task.runtime_model_key
  ];
  return candidates.some((value) => String(value || '').trim());
}

function isRuntimeActiveTask(task) {
  return normalizeStatus(task && task.status) === 'active' && hasRuntimeModelKey(task);
}

function isUnfinishedStatus(status) {
  return !['done'].includes(normalizeStatus(status));
}

function taskStartAt(task) {
  return task.startedAt || task.runningAt || task.spawningAt || task.queuedAt || task.createdAt || null;
}

function compareTasksByStartTimeDesc(a, b) {
  const ta = taskStartAt(a) || '';
  const tb = taskStartAt(b) || '';
  if (ta !== tb) return tb.localeCompare(ta);
  return String(b.taskId || '').localeCompare(String(a.taskId || ''));
}

function formatTaskStartAt(task) {
  return taskStartAt(task) || '—';
}

function formatIsoToLocalHm(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatTaskTimeCell(task) {
  const startedAt = taskStartAt(task);
  if (startedAt) {
    return formatIsoToLocalHm(startedAt) || startedAt;
  }
  return task.duration || '—';
}

// ── Done TTL filtering ───────────────────────────────────────────────────────

/**
 * Returns true if a done task is still within the 10-minute real-time window.
 * Tasks without a finishedAt/completedAt time are kept in real-time view.
 */
function isDoneRecentEnough(task, nowMs) {
  const ns = normalizeStatus(task.status);
  if (ns !== 'done') return true; // not done, keep
  const finishedAt = task.finishedAt || task.completedAt || task.runningAt || null;
  if (!finishedAt) return true; // no timestamp, keep conservatively
  const finishedMs = new Date(finishedAt).getTime();
  if (Number.isNaN(finishedMs)) return true;
  return (nowMs - finishedMs) <= DONE_REALTIME_TTL_MS;
}

// ── Priority ordering ─────────────────────────────────────────────────────────

const STATUS_ORDER = { active: 0, queued: 1, blocked: 2, timeout: 3, done: 4, unknown: 5 };

function statusOrder(status) {
  return STATUS_ORDER[normalizeStatus(status)] ?? 5;
}

function compareTasksForDashboard(a, b) {
  // 1. status group (active > queued > blocked > timeout > done)
  const sa = statusOrder(a.status);
  const sb = statusOrder(b.status);
  if (sa !== sb) return sa - sb;
  // 2. within same group: newest first
  return compareTasksByStartTimeDesc(a, b);
}

// ── Stats ─────────────────────────────────────────────────────────────────────

function computeStats(tasks, opts = {}) {
  const nowMs = opts.nowMs || Date.now();
  const list = Array.isArray(tasks) ? tasks : [];
  const stats = {
    total: 0,
    active: 0,
    done: 0,
    timeout: 0,
    blocked: 0,
    completed: 0,
    decisions: 0,
    queued: 0,
    other: 0,
    // v4 additions
    occupied: 0,   // = active (1 key = 1 agent = 1 task)
    free: 0,       // = maxSlots - occupied (passed via opts)
    queueDepth: 0, // tasks in queued state
    abnormal: 0,   // blocked + timeout
    doneRecentCount: 0,    // done and within 10 min
    doneExpiredCount: 0,   // done but older than 10 min (hidden from RT view)
  };

  for (const task of list) {
    stats.total += 1;
    const status = normalizeStatus(task.status);
    if (status === 'active') {
      stats.active += 1;
      stats.occupied += 1;
    } else if (status === 'done') {
      stats.done += 1;
      stats.completed += 1;
      if (isDoneRecentEnough(task, nowMs)) {
        stats.doneRecentCount += 1;
      } else {
        stats.doneExpiredCount += 1;
      }
    } else if (status === 'timeout') {
      stats.timeout += 1;
      stats.abnormal += 1;
    } else if (status === 'blocked') {
      stats.blocked += 1;
      stats.abnormal += 1;
    } else if (status === 'needs_decision') {
      stats.decisions += 1;
    } else if (status === 'queued' || status === 'pending' || status === 'waiting' || status === 'spawning') {
      stats.queued += 1;
      stats.queueDepth += 1;
    } else {
      stats.other += 1;
    }
  }

  const maxSlots = opts.maxSlots || 19;
  stats.free = Math.max(0, maxSlots - stats.occupied);

  return stats;
}

// ── Title ─────────────────────────────────────────────────────────────────────

function generateTitle(stats, opts = {}) {
  if (opts.title) return opts.title;
  const occupied = stats.occupied !== undefined ? stats.occupied : stats.active;
  const free = stats.free !== undefined ? stats.free : 0;
  const queued = stats.queued || stats.queueDepth || 0;
  const abnormal = stats.abnormal || (stats.blocked + stats.timeout) || 0;
  // Compose: "X Agent 并行 | 占用X 空闲X 排队X | 异常X"
  let title = `Agent并行总数：${occupied}`;
  const parts = [];
  parts.push(`占用${occupied}`);
  if (free > 0) parts.push(`空闲${free}`);
  if (queued > 0) parts.push(`排队${queued}`);
  if (abnormal > 0) parts.push(`⚠️ 异常${abnormal}`);
  if (parts.length > 0) title += ` (${parts.join(' / ')})`;
  return title;
}

// ── Task selection ────────────────────────────────────────────────────────────

/**
 * Returns the real-time visible task list:
 * - active / queued / blocked / timeout: always shown
 * - done: only within 10-minute TTL window
 * - sorted: active first → queued → blocked → timeout → done (newest first in each group)
 */
function selectVisibleTasks(tasks, opts = {}) {
  const nowMs = opts.nowMs || Date.now();
  const list = Array.isArray(tasks) ? tasks : [];

  const visible = list.filter((task) => {
    const ns = normalizeStatus(task.status);
    if (ns === 'done') return isDoneRecentEnough(task, nowMs);
    return true; // active, queued, blocked, timeout always shown
  });

  return [...visible].sort(compareTasksForDashboard);
}

/**
 * Returns only done tasks outside the 10-min window (hidden from real-time, shown in history footer).
 */
function selectExpiredDoneTasks(tasks, opts = {}) {
  const nowMs = opts.nowMs || Date.now();
  const list = Array.isArray(tasks) ? tasks : [];
  return list
    .filter((t) => normalizeStatus(t.status) === 'done' && !isDoneRecentEnough(t, nowMs))
    .sort(compareTasksByStartTimeDesc);
}

function selectRuntimeActiveTasks(tasks) {
  const list = Array.isArray(tasks) ? tasks : [];
  return list.filter(isRuntimeActiveTask).sort(compareTasksByStartTimeDesc);
}

// ── Board snapshot ────────────────────────────────────────────────────────────

function buildRuntimeSnapshot(tasks, opts = {}) {
  const visibleTasks = selectVisibleTasks(tasks, opts);
  const expiredDone = selectExpiredDoneTasks(tasks, opts);
  const runtimeActiveTasks = selectRuntimeActiveTasks(tasks);
  const stats = computeStats(tasks, opts); // stats over all tasks
  // override occupied with confirmed runtime active count
  stats.active = runtimeActiveTasks.length;
  stats.occupied = runtimeActiveTasks.length;
  return { visibleTasks, expiredDone, runtimeActiveTasks, stats };
}

// ── Text renderer ─────────────────────────────────────────────────────────────

function renderText(tasks, opts = {}) {
  const { visibleTasks, expiredDone, stats } = buildRuntimeSnapshot(tasks, opts);
  const lines = [];

  // ── Header: parallel total + breakdown ──
  lines.push(generateTitle(stats, opts), '');

  // ── Main table: active → queued → blocked → timeout → recent done ──
  lines.push('| # | 任务 | 模型 | 状态 | 时间 |');
  lines.push('|---|---|---|---|---|');

  const mainTasks = visibleTasks.filter((t) => normalizeStatus(t.status) !== 'done');
  const recentDone = visibleTasks.filter((t) => normalizeStatus(t.status) === 'done');

  // Active / queued / blocked first
  if (mainTasks.length === 0 && recentDone.length === 0) {
    lines.push('| — | — | — | — | — |');
  } else {
    let idx = 1;
    for (const task of mainTasks) {
      lines.push(`| ${idx++} | ${esc(task.task || task.title || '—')} | ${esc(pureModel(task.model))} | ${esc(normalizeStatus(task.status))} | ${esc(formatTaskTimeCell(task))} |`);
    }
    // Recent done (within 10 min) appended at bottom of table, dimmed
    for (const task of recentDone) {
      lines.push(`| ${idx++} | ${esc(task.task || task.title || '—')} | ${esc(pureModel(task.model))} | done ✅ | ${esc(formatTaskTimeCell(task))} |`);
    }
  }

  // ── Footer summary ──
  const footerParts = [
    `done: ${stats.done}`,
    `timeout: ${stats.timeout}`,
    `blocked: ${stats.blocked}`,
  ];
  if (stats.abnormal > 0) footerParts.push(`⚠️ 异常: ${stats.abnormal}`);
  if (expiredDone.length > 0) footerParts.push(`隐藏已完成: ${expiredDone.length}`);

  lines.push('');
  lines.push(`── 汇总 ── ${footerParts.join(' · ')}`);

  if (opts.highlights && opts.highlights.length) {
    lines.push('', '关键进展');
    for (const item of opts.highlights) lines.push(`- ${item}`);
  }

  if (opts.risks && opts.risks.length) {
    lines.push('', '风险');
    for (const item of opts.risks) lines.push(`- ${item}`);
  }

  if (opts.decisions && opts.decisions.length) {
    lines.push('', '待决策项');
    for (const item of opts.decisions) lines.push(`- ${item}`);
  }

  return lines.join('\n');
}

// ── Card renderer (Feishu interactive card) ───────────────────────────────────

function renderCard(tasks, opts = {}) {
  const { visibleTasks, expiredDone, stats } = buildRuntimeSnapshot(tasks, opts);

  const elements = [];

  // Header summary line
  elements.push({
    tag: 'div',
    text: {
      tag: 'lark_md',
      content: `**${generateTitle(stats, opts)}**`
    }
  });
  elements.push({ tag: 'hr' });

  // Main task list (active / queued / blocked first, then recent done)
  const mainTasks = visibleTasks.filter((t) => normalizeStatus(t.status) !== 'done');
  const recentDone = visibleTasks.filter((t) => normalizeStatus(t.status) === 'done');

  const STATUS_ICON = {
    active: '🔄',
    queued: '⏳',
    blocked: '🚧',
    timeout: '⏰',
    done: '✅',
  };

  const rows = [
    ...mainTasks.map((task) => {
      const icon = STATUS_ICON[normalizeStatus(task.status)] || '❓';
      return `${icon} **${task.task || task.title || '—'}** ｜ ${pureModel(task.model)} ｜ ${normalizeStatus(task.status)} ｜ ${formatTaskTimeCell(task)}`;
    }),
    ...recentDone.map((task) => {
      return `✅ ~~${task.task || task.title || '—'}~~ ｜ ${pureModel(task.model)} ｜ done ｜ ${formatTaskTimeCell(task)}`;
    }),
  ];

  elements.push({
    tag: 'div',
    text: {
      tag: 'lark_md',
      content: rows.length ? rows.join('\n') : '— 暂无进行中任务 —'
    }
  });

  elements.push({ tag: 'hr' });

  // Footer summary
  const footerLine = `done: **${stats.done}** · timeout: **${stats.timeout}** · blocked: **${stats.blocked}**` +
    (stats.abnormal > 0 ? ` · ⚠️ 异常: **${stats.abnormal}**` : '') +
    (expiredDone.length > 0 ? ` · 历史隐藏: **${expiredDone.length}**` : '');
  elements.push({
    tag: 'div',
    text: { tag: 'lark_md', content: footerLine }
  });

  if (opts.highlights && opts.highlights.length) {
    elements.push({ tag: 'hr' });
    elements.push({
      tag: 'div',
      text: { tag: 'lark_md', content: `**关键进展**\n${opts.highlights.map((x) => `- ${x}`).join('\n')}` }
    });
  }
  if (opts.risks && opts.risks.length) {
    elements.push({ tag: 'hr' });
    elements.push({
      tag: 'div',
      text: { tag: 'lark_md', content: `**风险**\n${opts.risks.map((x) => `- ${x}`).join('\n')}` }
    });
  }
  if (opts.decisions && opts.decisions.length) {
    elements.push({ tag: 'hr' });
    elements.push({
      tag: 'div',
      text: { tag: 'lark_md', content: `**待决策项**\n${opts.decisions.map((x) => `- ${x}`).join('\n')}` }
    });
  }

  const headerColor = stats.abnormal > 0 ? 'orange' : (stats.occupied > 0 ? 'blue' : 'grey');

  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: generateTitle(stats, opts) },
      template: headerColor,
    },
    elements
  };
}

// ── Full report ───────────────────────────────────────────────────────────────

function renderReport(tasks, opts = {}) {
  const { visibleTasks, expiredDone, runtimeActiveTasks, stats } = buildRuntimeSnapshot(tasks, opts);
  return {
    text: renderText(tasks, opts),
    card: renderCard(tasks, opts),
    title: generateTitle(stats, opts),
    stats,
    tasks: visibleTasks,
    expiredDone,
    runtimeActiveTasks
  };
}

// ── HTML dashboard renderer ───────────────────────────────────────────────────

/**
 * Renders a self-contained HTML dashboard (dark theme, screenshot-friendly).
 * Accepts the live-board.json structure directly OR a task array.
 */
function renderHtmlDashboard(input, opts = {}) {
  const nowMs = opts.nowMs || Date.now();
  const title = opts.title || 'Agent 实时看板';

  // Support both liveBoard JSON shape and plain task array
  let spawning = [], running = [], queued = [], recentFinished = [];
  let maxSlots = 19, occupiedCount = 0, freeCount = 19;
  let summaryText = '';

  if (Array.isArray(input)) {
    const snap = buildRuntimeSnapshot(input, { ...opts, nowMs });
    running = snap.visibleTasks.filter((t) => normalizeStatus(t.status) === 'active');
    queued = snap.visibleTasks.filter((t) => normalizeStatus(t.status) === 'queued');
    const blocked = snap.visibleTasks.filter((t) => ['blocked', 'timeout'].includes(normalizeStatus(t.status)));
    recentFinished = snap.visibleTasks.filter((t) => normalizeStatus(t.status) === 'done');
    occupiedCount = snap.stats.occupied;
    freeCount = snap.stats.free;
    maxSlots = occupiedCount + freeCount;
    summaryText = generateTitle(snap.stats, opts);
  } else if (input && typeof input === 'object') {
    // liveBoard shape
    spawning = Array.isArray(input.spawning) ? input.spawning : [];
    running = Array.isArray(input.running) ? input.running : [];
    queued = Array.isArray(input.queued) ? input.queued : [];
    recentFinished = Array.isArray(input.recentFinished) ? input.recentFinished : [];
    const s = input.summary || {};
    maxSlots = s.maxSlots || input.maxSlots || 19;
    occupiedCount = s.occupiedModelKeyCount || s.busySlots || (spawning.length + running.length);
    freeCount = s.freeSlots || Math.max(0, maxSlots - occupiedCount);
    // Filter expired done from recentFinished
    recentFinished = recentFinished.filter((t) => isDoneRecentEnough(t, nowMs));
    summaryText = `Agent并行总数：${occupiedCount} (占用${occupiedCount} / 空闲${freeCount} / 排队${queued.length})`;
  }

  const updatedAt = opts.updatedAt || new Date(nowMs).toISOString();

  function escH(s) {
    return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function statusBadge(status) {
    const ns = normalizeStatus(status);
    const map = { active: ['🔄', '#1d4ed8'], queued: ['⏳', '#b45309'], blocked: ['🚧', '#b91c1c'], timeout: ['⏰', '#9f1239'], done: ['✅', '#166534'] };
    const [icon, color] = map[ns] || ['❓', '#374151'];
    return `<span class="badge" style="background:${color}">${icon} ${escH(status)}</span>`;
  }

  function taskCard(task, dimmed = false) {
    const title = escH(task.title || task.task || '—');
    const model = escH(pureModel(task.model));
    const time = escH(formatTaskTimeCell(task));
    const prio = escH(task.priority || '');
    const opacity = dimmed ? 'opacity:0.55;' : '';
    return `<div class="tcard" style="${opacity}">
      <div class="tcard-title">${title}</div>
      <div class="tcard-meta">${statusBadge(task.status)} <span class="model">${model}</span> <span class="time">${time}</span>${prio ? ` <span class="prio">${prio}</span>` : ''}</div>
    </div>`;
  }

  function section(label, tasks, colorClass, dimmed = false) {
    const body = tasks.length
      ? tasks.map((t) => taskCard(t, dimmed)).join('')
      : '<div class="empty">暂无</div>';
    return `<section class="col">
      <div class="col-head ${colorClass}">${escH(label)} <span class="count">${tasks.length}</span></div>
      <div class="col-body">${body}</div>
    </section>`;
  }

  // Utilisation bar
  const utilPct = maxSlots > 0 ? Math.round((occupiedCount / maxSlots) * 100) : 0;

  const allActive = [...spawning, ...running].sort(compareTasksByStartTimeDesc);
  const allQueued = [...queued].sort(compareTasksByStartTimeDesc);
  const allBlocked = []; // extract from running if needed — shown inline
  const allDone = [...recentFinished].sort(compareTasksByStartTimeDesc);

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escH(title)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
           background: #0b1020; color: #e5e7eb; min-height: 100vh; padding: 24px 20px; }
    .wrap { max-width: 1600px; margin: 0 auto; }
    /* Header */
    .header { display: flex; justify-content: space-between; align-items: flex-start;
               margin-bottom: 20px; gap: 16px; flex-wrap: wrap; }
    .header-title { font-size: 20px; font-weight: 700; color: #f9fafb; }
    .header-sub { font-size: 13px; color: #9ca3af; margin-top: 4px; }
    .header-ts { font-size: 12px; color: #6b7280; text-align: right; }
    /* Stat pills */
    .stat-row { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 20px; }
    .stat-pill { padding: 6px 14px; border-radius: 999px; font-size: 13px; font-weight: 600;
                 border: 1px solid rgba(255,255,255,0.1); }
    .pill-blue  { background: #1e3a5f; color: #93c5fd; }
    .pill-green { background: #14532d; color: #86efac; }
    .pill-amber { background: #451a03; color: #fcd34d; }
    .pill-red   { background: #450a0a; color: #fca5a5; }
    .pill-grey  { background: #1f2937; color: #9ca3af; }
    /* Utilisation bar */
    .util-bar-wrap { margin-bottom: 20px; }
    .util-bar-label { font-size: 12px; color: #9ca3af; margin-bottom: 5px; }
    .util-bar-track { height: 8px; background: #1f2937; border-radius: 4px; overflow: hidden; }
    .util-bar-fill  { height: 100%; border-radius: 4px;
                      background: linear-gradient(90deg, #2563eb, #7c3aed); transition: width 0.4s; }
    /* Grid */
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; }
    .col { background: #111827; border: 1px solid #1f2937; border-radius: 16px; overflow: hidden;
           box-shadow: 0 8px 24px rgba(0,0,0,0.3); }
    .col-head { padding: 14px 16px; font-weight: 700; font-size: 14px;
                display: flex; justify-content: space-between; align-items: center; }
    .count { background: rgba(0,0,0,0.3); padding: 2px 8px; border-radius: 999px; font-size: 12px; }
    .blue  { background: #1e40af; }
    .amber { background: #92400e; }
    .red   { background: #991b1b; }
    .green { background: #166534; }
    .grey  { background: #374151; }
    .col-body { padding: 12px; display: flex; flex-direction: column; gap: 8px; min-height: 240px; }
    /* Task card */
    .tcard { background: #0f172a; border: 1px solid #1e293b; border-radius: 10px; padding: 10px 12px; }
    .tcard-title { font-size: 13px; font-weight: 600; color: #f1f5f9; margin-bottom: 5px;
                   line-height: 1.4; word-break: break-all; }
    .tcard-meta { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
    .badge { font-size: 11px; padding: 2px 7px; border-radius: 999px; font-weight: 600; }
    .model { font-size: 11px; color: #60a5fa; font-family: monospace; }
    .time  { font-size: 11px; color: #6b7280; }
    .prio  { font-size: 11px; color: #fbbf24; }
    .empty { color: #4b5563; font-size: 13px; padding: 8px 0; }
    /* Footer */
    .footer { margin-top: 20px; font-size: 12px; color: #4b5563; text-align: center; }
    /* Screenshot optimise */
    @media print {
      body { background: #fff; color: #111; }
      .col { border: 1px solid #d1d5db; box-shadow: none; }
    }
  </style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <div>
      <div class="header-title">🤖 ${escH(title)}</div>
      <div class="header-sub">${escH(summaryText)}</div>
    </div>
    <div class="header-ts">更新: ${escH(updatedAt)}</div>
  </div>

  <div class="stat-row">
    <div class="stat-pill