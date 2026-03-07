/**
 * multi-agent-reporting v3.1.0
 *
 * Stable reporting skill.
 * Output contract:
 *   1. Prefix: 当前 active 总数：X
 *   2. Main table: 任务 / 模型 / 状态
 *   3. Suffix: done / timeout / blocked 汇总
 *   4. Optional sections: 关键进展 / 风险 / 待决策项
 */

'use strict';

function normalizeStatus(status) {
  const s = String(status || '').toLowerCase();
  if (['running', 'active', 'in_progress'].includes(s)) return 'active';
  if (['completed', 'complete', 'done', 'success'].includes(s)) return 'done';
  if (['blocked', 'failed', 'fail', 'error'].includes(s)) return 'blocked';
  if (['timeout', 'timed_out'].includes(s)) return 'timeout';
  return s || 'unknown';
}

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

function computeStats(tasks) {
  const stats = {
    total: 0,
    active: 0,
    done: 0,
    timeout: 0,
    blocked: 0,
    completed: 0,
    decisions: 0,
    queued: 0,
    other: 0
  };

  for (const task of (tasks || [])) {
    stats.total += 1;
    const status = normalizeStatus(task.status);
    if (status === 'active') stats.active += 1;
    else if (status === 'done') {
      stats.done += 1;
      stats.completed += 1;
    }
    else if (status === 'timeout') stats.timeout += 1;
    else if (status === 'blocked') stats.blocked += 1;
    else if (status === 'needs_decision') stats.decisions += 1;
    else if (status === 'queued' || status === 'pending' || status === 'waiting') stats.queued += 1;
    else stats.other += 1;
  }

  return stats;
}

function generateTitle(stats, opts = {}) {
  return opts.title || `当前 active 总数：${stats.active}`;
}

function renderText(tasks, opts = {}) {
  const stats = computeStats(tasks || []);
  const lines = [];

  lines.push(`当前 active 总数：${stats.active}`, '');
  lines.push('| 任务 | 模型 | 状态 |');
  lines.push('|---|---|---|');

  for (const task of (tasks || [])) {
    lines.push(`| ${esc(task.task || '—')} | ${esc(pureModel(task.model))} | ${esc(normalizeStatus(task.status))} |`);
  }

  if (!tasks || tasks.length === 0) {
    lines.push('| — | — | — |');
  }

  lines.push('', `- done：${stats.done}`, `- timeout：${stats.timeout}`, `- blocked：${stats.blocked}`);

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

function renderCard(tasks, opts = {}) {
  const stats = computeStats(tasks || []);
  const elements = [];
  const rows = (tasks || []).map((task) => `- ${task.task || '—'} ｜ ${pureModel(task.model)} ｜ ${normalizeStatus(task.status)}`);

  elements.push({ tag: 'div', text: { tag: 'lark_md', content: `当前 active 总数：**${stats.active}**` } });
  elements.push({ tag: 'hr' });
  elements.push({ tag: 'div', text: { tag: 'lark_md', content: rows.length ? rows.join('\n') : '- — ｜ — ｜ —' } });
  elements.push({ tag: 'hr' });
  elements.push({ tag: 'div', text: { tag: 'lark_md', content: `done：**${stats.done}** · timeout：**${stats.timeout}** · blocked：**${stats.blocked}**` } });

  if (opts.highlights && opts.highlights.length) {
    elements.push({ tag: 'hr' });
    elements.push({ tag: 'div', text: { tag: 'lark_md', content: `**关键进展**\n${opts.highlights.map((x) => `- ${x}`).join('\n')}` } });
  }
  if (opts.risks && opts.risks.length) {
    elements.push({ tag: 'hr' });
    elements.push({ tag: 'div', text: { tag: 'lark_md', content: `**风险**\n${opts.risks.map((x) => `- ${x}`).join('\n')}` } });
  }
  if (opts.decisions && opts.decisions.length) {
    elements.push({ tag: 'hr' });
    elements.push({ tag: 'div', text: { tag: 'lark_md', content: `**待决策项**\n${opts.decisions.map((x) => `- ${x}`).join('\n')}` } });
  }

  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: generateTitle(stats, opts) },
      template: stats.blocked > 0 ? 'orange' : (stats.active > 0 ? 'blue' : 'grey')
    },
    elements
  };
}

function renderReport(tasks, opts = {}) {
  const stats = computeStats(tasks || []);
  return {
    text: renderText(tasks, opts),
    card: renderCard(tasks, opts),
    title: generateTitle(stats, opts),
    stats
  };
}

module.exports = {
  renderReport,
  renderText,
  renderCard,
  computeStats,
  generateTitle,
  pureModel,
  normalizeStatus
};
