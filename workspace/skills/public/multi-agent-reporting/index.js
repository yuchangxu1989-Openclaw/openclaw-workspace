/**
 * multi-agent-reporting v3.0.0
 *
 * Pure reporting skill — renders multi-agent status into:
 *   1. Plain text (Markdown) live board
 *   2. Feishu interactive card JSON
 *
 * Design rules:
 *   - Main table: ONLY active (running) tasks
 *   - 0 active? Show completed + risks + decisions (never empty)
 *   - Title: precise concurrency state, not max capacity
 *   - Agent name: full persona name (displayName)
 *   - Headers: # / Agent / 任务 / 模型 / 状态 / 用时
 *   - No "下一步" column
 *   - Narrow columns, short model names
 *   - Minimal text, ultra-short conclusions
 *   - Separate from dispatch — this is ONLY rendering
 *
 * Zero dependencies. Pure Node.js (≥14).
 */

'use strict';

const path = require('path');
const defaultCfg = require(path.join(__dirname, 'config.json'));

// ─── Status helpers ─────────────────────────────────────────────────────────

const STATUS_META = defaultCfg.statusMeta;

function norm(s) {
  return (s || 'pending').toLowerCase().replace(/[^a-z_]/g, '_');
}

function meta(s) {
  return STATUS_META[norm(s)] || { icon: '❓', label: s, short: String(s).slice(0, 4) };
}

function esc(s) {
  return String(s || '—').replace(/\|/g, '\\|');
}

// ─── Model name shortening ─────────────────────────────────────────────────
// Goal: as narrow as possible while keeping the distinctive part.
//   claude-sonnet-4-20250514       → sonnet-4
//   claude-opus-4-20250514         → opus-4
//   gpt-4o-2024-08-06              → gpt-4o
//   gemini-2.5-pro-preview-06-05   → gem-2.5-pro
//   boom-writer/gpt-5.4            → gpt-5.4
//   deepseek-r1                    → deepseek-r1

function shortModel(model) {
  if (!model) return '—';
  let m = model;
  // Remove router/provider prefix (e.g. "boom-writer/gpt-5.4")
  if (m.includes('/')) m = m.split('/').pop();
  // Remove preview + date suffixes
  m = m.replace(/-preview-\d{2,4}[-/]\d{2}([-/]\d{2})?$/, '');
  // Remove date suffixes: -YYYYMMDD or -YYYY-MM-DD
  m = m.replace(/-\d{4}-\d{2}-\d{2}$/, '');
  m = m.replace(/-\d{8}$/, '');
  // Remove trailing -preview
  m = m.replace(/-preview$/, '');
  // Shorten known family prefixes
  m = m.replace(/^claude-/, '');
  m = m.replace(/^gemini-/, 'gem-');
  return m;
}

// ─── Agent name (prefer full persona name) ──────────────────────────────────

function agentName(t) {
  return t.displayName || t.agentName || t.agentId || '—';
}

// ─── Model display (with optional thinking level) ───────────────────────────

function modelDisplay(t, opts) {
  let m = shortModel(t.model);
  if (opts && opts.showThinking && t.thinking && t.thinking !== 'none') {
    m += `(${t.thinking})`;
  }
  return m;
}

// ─── Classify tasks into zones ──────────────────────────────────────────────

function classify(tasks) {
  const result = { active: [], completed: [], blocked: [], decisions: [], queued: [], other: [] };
  for (const t of (tasks || [])) {
    const s = norm(t.status);
    switch (s) {
      case 'running':        result.active.push(t); break;
      case 'completed':      result.completed.push(t); break;
      case 'blocked':
      case 'failed':         result.blocked.push(t); break;
      case 'needs_decision': result.decisions.push(t); break;
      case 'pending':
      case 'queued':
      case 'waiting':        result.queued.push(t); break;
      default:               result.other.push(t);
    }
  }
  return result;
}

// ─── Compute stats ──────────────────────────────────────────────────────────

function computeStats(tasks) {
  const c = classify(tasks);
  return {
    total: (tasks || []).length,
    active: c.active.length,
    completed: c.completed.length,
    blocked: c.blocked.length,
    decisions: c.decisions.length,
    queued: c.queued.length,
    other: c.other.length
  };
}

// ─── Title generation ───────────────────────────────────────────────────────
// Precise concurrency state. Never write max capacity.
//   3 active          → "🔄 3 Agent 并行执行中"
//   0 active, 5 done  → "⏸️ 0 活跃 · ✅5完成"
//   all done          → "✅ 6 项全部完成"
//   0 total           → "📋 暂无任务"
//   mixed risks       → "🔄 2 Agent 并行 · ⚠️1风险"

function generateTitle(stats, opts) {
  if (opts && opts.title) return opts.title;
  if (stats.total === 0) return '📋 暂无任务';
  if (stats.completed === stats.total) return `✅ ${stats.total} 项全部完成`;

  const parts = [];
  if (stats.active > 0) {
    parts.push(`🔄 ${stats.active} Agent 并行执行中`);
  } else {
    parts.push('⏸️ 0 活跃');
  }
  if (stats.blocked > 0) parts.push(`⚠️${stats.blocked}风险`);
  if (stats.decisions > 0) parts.push(`⚖️${stats.decisions}待决`);
  if (stats.active === 0 && stats.completed > 0) parts.push(`✅${stats.completed}完成`);

  return parts.join(' · ');
}

// ─── Card header color ──────────────────────────────────────────────────────

function cardColor(stats) {
  const colors = defaultCfg.cardColors;
  if (stats.blocked > 0 || stats.decisions > 0) return colors.risk;
  if (stats.active > 0) return colors.active;
  if (stats.completed === stats.total && stats.total > 0) return colors.done;
  return colors.idle;
}

// ═══════════════════════════════════════════════════════════════════════════
// TEXT RENDERER (Markdown)
// ═══════════════════════════════════════════════════════════════════════════

function renderText(tasks, opts) {
  opts = { ...defaultCfg, ...opts };
  if (!Array.isArray(tasks) || tasks.length === 0) return '_暂无任务数据。_';

  const stats = computeStats(tasks);
  const c = classify(tasks);
  const title = generateTitle(stats, opts);
  const lines = [];

  lines.push(`## ${title}`, '');

  // ── Main table: active tasks only ──────────────────────────────────────
  if (c.active.length > 0) {
    lines.push('| # | Agent | 任务 | 模型 | 状态 | 用时 |');
    lines.push('|---|-------|------|------|------|------|');
    c.active.forEach((t, i) => {
      const m = meta(t.status);
      lines.push(
        `| ${i + 1} | ${esc(agentName(t))} | ${esc(t.task)} | ${esc(modelDisplay(t, opts))} | ${m.icon}${m.short} | ${esc(t.duration)} |`
      );
    });
    lines.push('');
  }

  // ── 0 active: show completed as table ──────────────────────────────────
  if (c.active.length === 0 && c.completed.length > 0) {
    const max = opts.maxCompletedTable || 10;
    const show = c.completed.slice(0, max);
    lines.push(`### ✅ 新完成 (${c.completed.length})`, '');
    lines.push('| # | Agent | 任务 | 模型 | 用时 |');
    lines.push('|---|-------|------|------|------|');
    show.forEach((t, i) => {
      lines.push(
        `| ${i + 1} | ${esc(agentName(t))} | ${esc(t.task)} | ${esc(modelDisplay(t, opts))} | ${esc(t.duration)} |`
      );
    });
    if (c.completed.length > max) lines.push(`_…另有 ${c.completed.length - max} 项_`);
    lines.push('');
  }

  // ── Active > 0: completed as compact list ──────────────────────────────
  if (c.active.length > 0 && c.completed.length > 0) {
    const max = opts.maxCompletedInline || 5;
    const show = c.completed.slice(0, max);
    lines.push(`**✅ 新完成 (${c.completed.length})**`);
    for (const t of show) {
      lines.push(`- ${agentName(t)}「${t.task}」${t.duration || ''}`);
    }
    if (c.completed.length > max) lines.push(`- _…另有 ${c.completed.length - max} 项_`);
    lines.push('');
  }

  // ── Risks (blocked + failed) ───────────────────────────────────────────
  if (c.blocked.length > 0) {
    lines.push(`**⚠️ 关键风险 (${c.blocked.length})**`);
    for (const t of c.blocked) {
      const reason = t.blocker || t.error || '原因待查';
      const m = meta(t.status);
      lines.push(`- ${m.icon} ${agentName(t)}「${t.task}」${reason}`);
    }
    lines.push('');
  }

  // ── Decisions ──────────────────────────────────────────────────────────
  if (c.decisions.length > 0) {
    lines.push(`**⚖️ 待决策 (${c.decisions.length})**`);
    for (const t of c.decisions) {
      const owner = t.decisionOwner ? ` → @${t.decisionOwner}` : '';
      lines.push(`- ${agentName(t)}「${t.task}」${t.decision || ''}${owner}`);
    }
    lines.push('');
  }

  // ── Queued (optional) ──────────────────────────────────────────────────
  if (c.queued.length > 0 && opts.showQueued) {
    lines.push(`**⏳ 排队 (${c.queued.length})**`);
    for (const t of c.queued) {
      lines.push(`- ${agentName(t)}「${t.task}」`);
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

// ═══════════════════════════════════════════════════════════════════════════
// FEISHU CARD RENDERER
// ═══════════════════════════════════════════════════════════════════════════

function renderCard(tasks, opts) {
  opts = { ...defaultCfg, ...opts };
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return {
      config: { wide_screen_mode: true },
      header: { title: { tag: 'plain_text', content: '📋 暂无任务' }, template: 'grey' },
      elements: [{ tag: 'div', text: { tag: 'lark_md', content: '当前没有任务数据。' } }]
    };
  }

  const stats = computeStats(tasks);
  const c = classify(tasks);
  const title = generateTitle(stats, opts);
  const color = cardColor(stats);
  const elements = [];

  // ── Summary counts ─────────────────────────────────────────────────────
  const countParts = [];
  if (stats.active > 0)    countParts.push(`🔄执行 **${stats.active}**`);
  if (stats.completed > 0) countParts.push(`✅完成 **${stats.completed}**`);
  if (stats.blocked > 0)   countParts.push(`⚠️风险 **${stats.blocked}**`);
  if (stats.decisions > 0) countParts.push(`⚖️待决 **${stats.decisions}**`);
  if (stats.queued > 0)    countParts.push(`⏳排队 **${stats.queued}**`);
  if (countParts.length > 0) {
    elements.push({ tag: 'div', text: { tag: 'lark_md', content: countParts.join(' · ') } });
  }

  // ── Active tasks ───────────────────────────────────────────────────────
  if (c.active.length > 0) {
    elements.push({ tag: 'hr' });
    const taskLines = c.active.map((t, i) => {
      const m = meta(t.status);
      return `**#${i + 1}** ${agentName(t)} · ${t.task} · \`${modelDisplay(t, opts)}\` · ${m.icon}${m.short} · ${t.duration || '—'}`;
    });
    elements.push({ tag: 'div', text: { tag: 'lark_md', content: taskLines.join('\n') } });
  }

  // ── Completed ──────────────────────────────────────────────────────────
  if (c.completed.length > 0) {
    elements.push({ tag: 'hr' });
    const max = opts.maxCompletedInCard || 5;
    const show = c.completed.slice(0, max);
    const cl = [`**✅ 新完成 (${c.completed.length})**`];
    for (const t of show) {
      cl.push(`${agentName(t)}「${t.task}」${t.duration || ''}`);
    }
    if (c.completed.length > max) cl.push(`…另有 ${c.completed.length - max} 项`);
    elements.push({ tag: 'div', text: { tag: 'lark_md', content: cl.join('\n') } });
  }

  // ── Risks ──────────────────────────────────────────────────────────────
  if (c.blocked.length > 0) {
    elements.push({ tag: 'hr' });
    const rl = [`**⚠️ 关键风险 (${c.blocked.length})**`];
    for (const t of c.blocked) {
      const reason = t.blocker || t.error || '原因待查';
      const m = meta(t.status);
      rl.push(`${m.icon} ${agentName(t)}「${t.task}」${reason}`);
    }
    elements.push({ tag: 'div', text: { tag: 'lark_md', content: rl.join('\n') } });
  }

  // ── Decisions ──────────────────────────────────────────────────────────
  if (c.decisions.length > 0) {
    elements.push({ tag: 'hr' });
    const dl = [`**⚖️ 待决策 (${c.decisions.length})**`];
    for (const t of c.decisions) {
      const owner = t.decisionOwner ? ` → @${t.decisionOwner}` : '';
      dl.push(`${agentName(t)}「${t.task}」${t.decision || ''}${owner}`);
    }
    elements.push({ tag: 'div', text: { tag: 'lark_md', content: dl.join('\n') } });
  }

  return {
    config: { wide_screen_mode: true },
    header: { title: { tag: 'plain_text', content: title }, template: color },
    elements
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN ENTRY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Render a multi-agent status report.
 *
 * @param {Array<object>} tasks  - Task entries (see SKILL.md for schema)
 * @param {object} [opts]        - Override config options
 * @returns {{ text: string, card: object, title: string, stats: object }}
 */
function renderReport(tasks, opts) {
  const stats = computeStats(tasks || []);
  const title = generateTitle(stats, opts);
  return {
    text: renderText(tasks, opts),
    card: renderCard(tasks, opts),
    title,
    stats
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  renderReport,
  renderText,
  renderCard,
  computeStats,
  classify,
  generateTitle,
  shortModel,
  agentName,
  // Testing internals
  _meta: meta,
  _norm: norm,
  _cardColor: cardColor,
  _modelDisplay: modelDisplay
};
