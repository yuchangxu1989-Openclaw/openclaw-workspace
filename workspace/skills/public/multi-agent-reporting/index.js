/**
 * multi-agent-reporting v2.0.0
 *
 * Dispatch-board style reporting for multi-agent orchestration.
 * Replaces verbal status updates with a structured scheduler view:
 *   Overview · Running · Completed · Blocked · Needs Decision · Next Actions · Model Breakdown
 *
 * Framework-agnostic. Zero dependencies. Pure Node.js (≥14).
 *
 * Exports: formatReport, formatDashboard, validateReport, generateTemplate, computeStats
 */

'use strict';

const path = require('path');
const defaultConfig = require(path.join(__dirname, 'config.json'));

// ─── Helpers ────────────────────────────────────────────────────────────────

function merge(defaults, overrides) {
  if (!overrides) return { ...defaults };
  const out = { ...defaults };
  for (const k of Object.keys(overrides)) {
    if (
      overrides[k] !== null &&
      typeof overrides[k] === 'object' &&
      !Array.isArray(overrides[k]) &&
      typeof defaults[k] === 'object' &&
      !Array.isArray(defaults[k])
    ) {
      out[k] = merge(defaults[k], overrides[k]);
    } else {
      out[k] = overrides[k];
    }
  }
  return out;
}

function cfg(options) {
  return merge(defaultConfig, options);
}

function statusIcon(status, icons) {
  return icons[status] || '❓';
}

function modelDisplay(entry, showThinking) {
  let display = entry.model || '(unknown)';
  if (showThinking && entry.thinking && entry.thinking !== 'none') {
    display += `(${entry.thinking})`;
  }
  return display;
}

function escMd(s) {
  return String(s || '—').replace(/\|/g, '\\|');
}

function pad(s, len) {
  const str = String(s);
  return str + ' '.repeat(Math.max(0, len - str.length));
}

function shortModel(model) {
  if (!model) return '(unknown)';
  // e.g. claude-sonnet-4-20250514 → claude-sonnet-4
  // e.g. gpt-4o-2024-08-06       → gpt-4o
  const m = model.replace(/-\d{4}-\d{2}-\d{2}$/, '').replace(/-\d{8}$/, '');
  return m;
}

function normalizeStatus(s) {
  return (s || 'pending').toLowerCase().replace(/[^a-z_]/g, '_');
}

// ─── Statistics ─────────────────────────────────────────────────────────────

/**
 * Compute summary statistics from an array of task entries.
 */
function computeStats(tasks, options) {
  const c = cfg(options);
  const icons = c.statusIcons || {};
  const statuses = ['completed', 'running', 'failed', 'blocked', 'pending', 'needs_decision', 'waiting', 'cancelled'];
  const counts = {};
  for (const s of statuses) counts[s] = 0;
  counts.other = 0;

  const byAgent = {};
  const byModel = {};

  for (const t of tasks) {
    const s = normalizeStatus(t.status);
    if (counts[s] !== undefined) {
      counts[s]++;
    } else {
      counts.other++;
    }

    // per agent
    const aid = t.agentId || '(unknown)';
    if (!byAgent[aid]) byAgent[aid] = { total: 0, completed: 0, running: 0, failed: 0, blocked: 0, pending: 0, needs_decision: 0, waiting: 0, cancelled: 0 };
    byAgent[aid].total++;
    if (byAgent[aid][s] !== undefined) byAgent[aid][s]++;

    // per model (shortened for readability)
    const mid = t.model || '(unknown)';
    if (!byModel[mid]) byModel[mid] = { total: 0, completed: 0, running: 0, failed: 0, blocked: 0, pending: 0, needs_decision: 0, waiting: 0, cancelled: 0 };
    byModel[mid].total++;
    if (byModel[mid][s] !== undefined) byModel[mid][s]++;
  }

  const total = tasks.length || 1; // avoid div-by-zero
  const completionRate = ((counts.completed / total) * 100).toFixed(1) + '%';
  const activeCount = counts.completed + counts.running;
  const coverageRate = ((activeCount / total) * 100).toFixed(1) + '%';
  const blockedRate = (((counts.blocked + counts.failed + counts.needs_decision) / total) * 100).toFixed(1) + '%';

  return {
    total: tasks.length,
    ...counts,
    completionRate,
    coverageRate,
    blockedRate,
    byAgent,
    byModel
  };
}

// ─── Group tasks by status zone ──────────────────────────────────────────────

function groupByZone(tasks, c) {
  const groups = c.statusGroups || {};
  const zones = {
    running: [],
    completed: [],
    blocked: [],
    needsDecision: [],
    other: []
  };

  const runningStatuses = groups.running || ['running'];
  const completedStatuses = groups.completed || ['completed'];
  const blockedStatuses = groups.blocked || ['blocked', 'failed'];
  const decisionStatuses = groups.needsDecision || ['needs_decision'];

  for (const t of tasks) {
    const s = normalizeStatus(t.status);
    if (runningStatuses.includes(s)) zones.running.push(t);
    else if (completedStatuses.includes(s)) zones.completed.push(t);
    else if (decisionStatuses.includes(s)) zones.needsDecision.push(t);
    else if (blockedStatuses.includes(s)) zones.blocked.push(t);
    else zones.other.push(t);
  }

  return zones;
}

// ─── Next Steps ─────────────────────────────────────────────────────────────

function suggestNextSteps(tasks, stats, c) {
  const steps = [];

  const blocked = tasks.filter(t => ['blocked', 'failed'].includes(normalizeStatus(t.status)));
  for (const t of blocked) {
    const reason = t.blocker || t.error;
    steps.push(`⏸️ **${t.agentId}**: _${t.task}_ — blocked${reason ? ': ' + reason : ', investigate dependency'}`);
  }

  const decisions = tasks.filter(t => normalizeStatus(t.status) === 'needs_decision');
  for (const t of decisions) {
    const owner = t.decisionOwner ? ` → cc @${t.decisionOwner}` : '';
    steps.push(`⚖️ **${t.agentId}**: _${t.task}_ — awaiting decision${t.decision ? ': ' + t.decision : ''}${owner}`);
  }

  const failed = tasks.filter(t => normalizeStatus(t.status) === 'failed');
  for (const t of failed) {
    steps.push(`❌ **${t.agentId}**: _${t.task}_ — failed${t.error ? ': ' + t.error + ' → retry or fix' : ', needs investigation'}`);
  }

  const running = tasks.filter(t => normalizeStatus(t.status) === 'running');
  for (const t of running) {
    const next = t.nextAction ? ` | next: ${t.nextAction}` : '';
    steps.push(`🔄 **${t.agentId}**: _${t.task}_ — running${next}`);
  }

  const pending = tasks.filter(t => normalizeStatus(t.status) === 'pending');
  if (pending.length > 0) {
    const list = pending.map(t => t.agentId || '?').join(', ');
    steps.push(`⏳ **${pending.length}** task(s) pending — dispatch: ${list}`);
  }

  if (stats.completed === stats.total && stats.total > 0) {
    steps.push('🎉 All tasks completed — ready for integration / merge');
  }

  return steps;
}

// ─── Dashboard renderer ──────────────────────────────────────────────────────

/**
 * Render a full dispatch-board style dashboard.
 *
 * Sections:
 *   1. Overview bar (progress + counts)
 *   2. Running     (inline status per task + model)
 *   3. Completed   (compact table with artifact/commit)
 *   4. Blocked     (blocker reason)
 *   5. Needs Decision (decision question + owner)
 *   6. Model Breakdown (per-model workload)
 *   7. Next Actions (per-task next hop)
 *
 * @param {Array<object>} tasks
 * @param {object} [options]
 * @returns {string}
 */
function formatDashboard(tasks, options) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return '_No task data to report._';
  }

  const c = cfg(options);
  const icons = c.statusIcons || {};
  const showThinking = c.showThinking !== false;
  const titles = c.sectionTitles || {};
  const stats = computeStats(tasks, options);
  const zones = groupByZone(tasks, c);
  const lines = [];

  // ── Title ──────────────────────────────────────────────────────────────────
  const title = c.title || 'Multi-Agent Progress Report';
  lines.push(`## ${title}`, '');

  // ── 1. Overview bar ────────────────────────────────────────────────────────
  if (c.showSummary !== false) {
    lines.push(`### ${titles.overview || 'Overview'}`);

    // Progress bar (20 chars wide)
    const total = stats.total || 1;
    const doneWidth = Math.round((stats.completed / total) * 20);
    const runWidth = Math.round((stats.running / total) * 20);
    const blockedWidth = Math.round(((stats.blocked + stats.failed + stats.needs_decision) / total) * 20);
    const pendingWidth = Math.max(0, 20 - doneWidth - runWidth - blockedWidth);
    const bar =
      '█'.repeat(doneWidth) +
      '▓'.repeat(runWidth) +
      '░'.repeat(blockedWidth) +
      '·'.repeat(pendingWidth);

    lines.push(`\`${bar}\` ${stats.completionRate} complete`);
    lines.push('');

    // Counts table
    const countRow = [
      `✅ Done: **${stats.completed}**`,
      `🔄 Running: **${stats.running}**`,
      `⏸️ Blocked: **${stats.blocked + stats.failed}**`,
      `⚖️ Decision: **${stats.needs_decision}**`,
      `⏳ Pending: **${stats.pending}**`,
    ].join(' · ');
    lines.push(countRow, '');
    lines.push(`Coverage: ${stats.coverageRate} · Blocked/Stalled: ${stats.blockedRate}`, '');
  }

  // ── 2. Running ─────────────────────────────────────────────────────────────
  if (c.showStatusSections !== false && zones.running.length > 0) {
    lines.push(`### ${titles.running || 'Running'} (${zones.running.length})`);
    lines.push('');
    lines.push('| Agent | Model | Task | Duration | Next Action |');
    lines.push('|-------|-------|------|----------|-------------|');
    for (const t of zones.running) {
      const model = escMd(modelDisplay(t, showThinking));
      const dur = escMd(t.duration);
      const next = escMd(t.nextAction);
      lines.push(`| ${escMd(t.agentId)} | ${model} | ${escMd(t.task)} | ${dur} | ${next} |`);
    }
    lines.push('');
  }

  // ── 3. Completed ───────────────────────────────────────────────────────────
  if (c.showStatusSections !== false && zones.completed.length > 0) {
    lines.push(`### ${titles.completed || 'Completed'} (${zones.completed.length})`);
    lines.push('');
    lines.push('| Agent | Model | Task | Duration | Commit / Artifact |');
    lines.push('|-------|-------|------|----------|-------------------|');
    for (const t of zones.completed) {
      const model = escMd(modelDisplay(t, showThinking));
      const artifact = t.artifact ? escMd(t.artifact) : escMd(t.commit);
      lines.push(`| ${escMd(t.agentId)} | ${model} | ${escMd(t.task)} | ${escMd(t.duration)} | ${artifact} |`);
    }
    lines.push('');
  }

  // ── 4. Blocked ─────────────────────────────────────────────────────────────
  if (c.showStatusSections !== false && zones.blocked.length > 0) {
    lines.push(`### ${titles.blocked || 'Blocked / Failed'} (${zones.blocked.length})`);
    lines.push('');
    lines.push('| Agent | Model | Task | Status | Blocker / Error |');
    lines.push('|-------|-------|------|--------|-----------------|');
    for (const t of zones.blocked) {
      const model = escMd(modelDisplay(t, showThinking));
      const icon = statusIcon(normalizeStatus(t.status), icons);
      const reason = escMd(t.blocker || t.error);
      lines.push(`| ${escMd(t.agentId)} | ${model} | ${escMd(t.task)} | ${icon} ${escMd(t.status)} | ${reason} |`);
    }
    lines.push('');
  }

  // ── 5. Needs Decision ──────────────────────────────────────────────────────
  if (c.showDecisions !== false && zones.needsDecision.length > 0) {
    lines.push(`### ${titles.needsDecision || 'Needs Decision'} (${zones.needsDecision.length})`);
    lines.push('');
    lines.push('| Agent | Task | Decision Required | Owner | ETA |');
    lines.push('|-------|------|-------------------|-------|-----|');
    for (const t of zones.needsDecision) {
      const decision = escMd(t.decision);
      const owner = escMd(t.decisionOwner);
      const eta = escMd(t.nextETA);
      lines.push(`| ${escMd(t.agentId)} | ${escMd(t.task)} | ${decision} | ${owner} | ${eta} |`);
    }
    lines.push('');
  }

  // ── 6. Model Breakdown ─────────────────────────────────────────────────────
  if (c.showModelBreakdown !== false) {
    const modelKeys = Object.keys(stats.byModel);
    if (modelKeys.length > 0) {
      lines.push(`### ${titles.modelBreakdown || 'Model Breakdown'}`);
      lines.push('');
      lines.push('| Model | Tasks | Done | Running | Blocked | Pending |');
      lines.push('|-------|-------|------|---------|---------|---------|');
      for (const m of modelKeys) {
        const ms = stats.byModel[m];
        const blockedCount = (ms.blocked || 0) + (ms.failed || 0);
        lines.push(`| ${escMd(shortModel(m))} | ${ms.total} | ${ms.completed} | ${ms.running} | ${blockedCount} | ${ms.pending} |`);
      }
      lines.push('');
    }
  }

  // ── 7. Next Actions ────────────────────────────────────────────────────────
  if (c.showNextHop !== false || c.showNextSteps !== false) {
    const allSteps = suggestNextSteps(tasks, stats, c);
    if (allSteps.length > 0) {
      lines.push(`### ${titles.nextActions || 'Next Actions'}`);
      for (const s of allSteps) lines.push(`- ${s}`);
      lines.push('');
    }

    // Per-task next hop (if nextAction field is populated)
    const withNextHop = tasks.filter(t => t.nextAction && normalizeStatus(t.status) !== 'completed');
    if (c.showNextHop !== false && withNextHop.length > 0) {
      lines.push(`### ${titles.nextActions || 'Per-Task Next Hop'} (detail)`);
      lines.push('');
      lines.push('| Agent | Task | Next Action | Owner | ETA |');
      lines.push('|-------|------|-------------|-------|-----|');
      for (const t of withNextHop) {
        lines.push(`| ${escMd(t.agentId)} | ${escMd(t.task)} | ${escMd(t.nextAction)} | ${escMd(t.nextOwner)} | ${escMd(t.nextETA)} |`);
      }
      lines.push('');
    }
  }

  return lines.join('\n').trimEnd();
}

// ─── Formatters (legacy table / list / compact) ──────────────────────────────

function formatTable(tasks, c) {
  const icons = c.statusIcons || {};
  const show = c.showThinking !== false;

  const headers = ['Agent', 'Model', 'Task', 'Status', 'Duration', 'Commit'];
  const rows = tasks.map(t => [
    escMd(t.agentId),
    escMd(modelDisplay(t, show)),
    escMd(t.task),
    `${statusIcon(normalizeStatus(t.status), icons)} ${escMd(t.status)}`,
    escMd(t.duration),
    escMd(t.commit)
  ]);

  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map(r => String(r[i]).length))
  );

  const headerLine = '| ' + headers.map((h, i) => pad(h, widths[i])).join(' | ') + ' |';
  const sepLine = '|' + widths.map(w => '-'.repeat(w + 2)).join('|') + '|';
  const dataLines = rows.map(r =>
    '| ' + r.map((cell, i) => pad(cell, widths[i])).join(' | ') + ' |'
  );

  return [headerLine, sepLine, ...dataLines].join('\n');
}

function formatList(tasks, c) {
  const icons = c.statusIcons || {};
  const show = c.showThinking !== false;

  return tasks.map((t, i) => {
    const icon = statusIcon(normalizeStatus(t.status), icons);
    const model = modelDisplay(t, show);
    let line = `${i + 1}. ${icon} **${t.agentId}** / ${model} — _${t.task}_`;
    line += `\n   Status: ${t.status}`;
    if (t.duration) line += ` | Duration: ${t.duration}`;
    if (t.commit) line += ` | Commit: \`${t.commit}\``;
    if (t.nextAction) line += `\n   → ${t.nextAction}`;
    if (t.error) line += `\n   Error: ${t.error}`;
    return line;
  }).join('\n');
}

function formatCompact(tasks, c) {
  const icons = c.statusIcons || {};
  const show = c.showThinking !== false;

  return tasks.map(t => {
    const icon = statusIcon(normalizeStatus(t.status), icons);
    const model = modelDisplay(t, show);
    const parts = [
      `${icon} ${t.agentId}/${model}`,
      t.task,
      t.status
    ];
    if (t.duration) parts.push(t.duration);
    if (t.commit) parts.push(t.commit);
    if (t.nextAction) parts.push(`next:${t.nextAction}`);
    if (t.error) parts.push(`err:${t.error}`);
    return parts.join(' | ');
  }).join('\n');
}

// ─── Format Report (unified entry point) ────────────────────────────────────

/**
 * Format an array of task entries into a Markdown report.
 *
 * When outputFormat is "dashboard" (default for v2), renders the full
 * dispatch-board view. Other formats: "table", "list", "compact".
 *
 * @param {Array<object>} tasks
 * @param {object} [options]
 * @returns {string}
 */
function formatReport(tasks, options) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return '_No task data to report._';
  }

  const c = cfg(options);
  const fmt = (c.outputFormat || 'dashboard').toLowerCase();

  // Dashboard is the new default
  if (fmt === 'dashboard') {
    return formatDashboard(tasks, options);
  }

  const lines = [];

  if (c.title) {
    lines.push(`## ${c.title}`, '');
  }

  if (fmt === 'list') {
    lines.push(formatList(tasks, c));
  } else if (fmt === 'compact') {
    lines.push('```');
    lines.push(formatCompact(tasks, c));
    lines.push('```');
  } else {
    // table (legacy default)
    lines.push(formatTable(tasks, c));
  }

  const stats = computeStats(tasks, options);

  if (c.showSummary !== false) {
    lines.push('', '### Summary');
    lines.push(
      `- **Total:** ${stats.total} | ` +
      `**Completed:** ${stats.completed} | ` +
      `**Running:** ${stats.running} | ` +
      `**Failed:** ${stats.failed} | ` +
      `**Blocked:** ${stats.blocked} | ` +
      `**Decision:** ${stats.needs_decision}`
    );
    lines.push(
      `- **Completion:** ${stats.completionRate} | **Coverage:** ${stats.coverageRate} | **Blocked:** ${stats.blockedRate}`
    );
  }

  if (c.showNextSteps !== false) {
    const steps = suggestNextSteps(tasks, stats, c);
    if (steps.length > 0) {
      lines.push('', '### Next Steps');
      for (const s of steps) lines.push(`- ${s}`);
    }
  }

  return lines.join('\n');
}

// ─── Validate Report ────────────────────────────────────────────────────────

function validateReport(tasks, options) {
  if (!Array.isArray(tasks)) {
    return {
      valid: false,
      totalEntries: 0,
      passedEntries: 0,
      failedEntries: 0,
      issues: [{ index: -1, agentId: '(none)', field: 'tasks', message: 'Input is not an array', severity: 'error' }],
      markdown: '❌ Validation failed: input is not an array.'
    };
  }

  const c = cfg(options);
  const v = c.validation || {};
  const required = c.requiredFields || defaultConfig.requiredFields;
  const issues = [];

  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    const aid = t.agentId || `entry[${i}]`;

    for (const f of required) {
      if (t[f] === undefined || t[f] === null || t[f] === '') {
        issues.push({ index: i, agentId: aid, field: f, message: `Missing required field: ${f}`, severity: 'error' });
      }
    }

    if (v.requireFullModelName !== false && t.model) {
      const m = t.model.toLowerCase().trim();
      const blacklist = v.shortNameBlacklist || [];
      if (blacklist.includes(m)) {
        issues.push({
          index: i, agentId: aid, field: 'model',
          message: `Model "${t.model}" looks like a short name — use full identifier (e.g. "claude-sonnet-4-20250514")`,
          severity: 'error'
        });
      } else if (m.length < (v.modelNameMinLength || 8)) {
        issues.push({
          index: i, agentId: aid, field: 'model',
          message: `Model name "${t.model}" is too short — likely not a full model identifier`,
          severity: 'warning'
        });
      }
    }

    const status = normalizeStatus(t.status);

    if (v.requireCommitOnComplete !== false && status === 'completed') {
      if (!t.commit && !t.artifact) {
        issues.push({
          index: i, agentId: aid, field: 'commit',
          message: 'Completed task is missing a commit hash or artifact',
          severity: 'warning'
        });
      }
    }

    if (v.requireErrorOnFail !== false && status === 'failed') {
      if (!t.error && !t.blocker) {
        issues.push({
          index: i, agentId: aid, field: 'error',
          message: 'Failed task is missing an error reason or blocker description',
          severity: 'error'
        });
      }
    }

    if (v.requireBlockerOnBlocked && status === 'blocked') {
      if (!t.blocker && !t.error) {
        issues.push({
          index: i, agentId: aid, field: 'blocker',
          message: 'Blocked task is missing a blocker description',
          severity: 'warning'
        });
      }
    }

    if (v.requireDecisionOwnerOnNeedsDecision && status === 'needs_decision') {
      if (!t.decisionOwner) {
        issues.push({
          index: i, agentId: aid, field: 'decisionOwner',
          message: 'needs_decision task is missing a decisionOwner',
          severity: 'warning'
        });
      }
    }

    if (v.requireNextActionOnActive && ['running', 'pending'].includes(status)) {
      if (!t.nextAction) {
        issues.push({
          index: i, agentId: aid, field: 'nextAction',
          message: `Active task (${status}) is missing a nextAction`,
          severity: 'warning'
        });
      }
    }
  }

  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warnCount = issues.filter(i => i.severity === 'warning').length;
  const failedEntries = new Set(issues.filter(i => i.severity === 'error').map(i => i.index)).size;

  const mdLines = ['## Validation Report', ''];
  if (issues.length === 0) {
    mdLines.push('✅ All entries passed validation.', '');
  } else {
    mdLines.push(`| # | Agent | Field | Severity | Message |`);
    mdLines.push(`|---|-------|-------|----------|---------|`);
    for (const iss of issues) {
      const sev = iss.severity === 'error' ? '❌ error' : '⚠️ warning';
      mdLines.push(`| ${iss.index} | ${escMd(iss.agentId)} | ${iss.field} | ${sev} | ${escMd(iss.message)} |`);
    }
    mdLines.push('');
  }
  mdLines.push(`**Entries:** ${tasks.length} | **Passed:** ${tasks.length - failedEntries} | **Failed:** ${failedEntries} | **Errors:** ${errorCount} | **Warnings:** ${warnCount}`);

  return {
    valid: errorCount === 0,
    totalEntries: tasks.length,
    passedEntries: tasks.length - failedEntries,
    failedEntries,
    issues,
    markdown: mdLines.join('\n')
  };
}

// ─── Generate Template ──────────────────────────────────────────────────────

function generateTemplate(taskList, options) {
  if (!Array.isArray(taskList) || taskList.length === 0) {
    return '_No tasks provided._';
  }

  const c = cfg(options);
  const defaultStatus = c.defaultStatus || 'pending';

  const tasks = taskList.map(t => ({
    agentId: t.agentId || '(unassigned)',
    model: t.model || '(TBD)',
    task: t.task || '(untitled)',
    status: t.status || defaultStatus,
    duration: t.duration || '',
    commit: t.commit || '',
    thinking: t.thinking || '',
    error: t.error || '',
    blocker: t.blocker || '',
    decision: t.decision || '',
    decisionOwner: t.decisionOwner || '',
    nextAction: t.nextAction || '',
    nextOwner: t.nextOwner || '',
    nextETA: t.nextETA || ''
  }));

  return formatReport(tasks, {
    ...c,
    title: c.title ? `${c.title} — Template` : 'Report Template',
    showNextSteps: false,
    showNextHop: false
  });
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  formatReport,
  formatDashboard,
  validateReport,
  generateTemplate,
  computeStats,

  // Expose internals for advanced use
  _suggestNextSteps: suggestNextSteps,
  _groupByZone: groupByZone,
  _formatTable: formatTable,
  _formatList: formatList,
  _formatCompact: formatCompact,
  _defaultConfig: defaultConfig
};
