/**
 * multi-agent-reporting v1.0.0
 *
 * Standardized reporting protocol for multi-agent orchestration.
 * Framework-agnostic. Zero dependencies. Pure Node.js (≥14).
 *
 * Exports: formatReport, validateReport, generateTemplate, computeStats
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

// ─── Statistics ─────────────────────────────────────────────────────────────

/**
 * Compute summary statistics from an array of task entries.
 *
 * @param {Array<object>} tasks
 * @param {object} [options]
 * @returns {object} stats
 */
function computeStats(tasks, options) {
  const c = cfg(options);
  const statuses = ['completed', 'running', 'failed', 'blocked', 'pending'];
  const counts = {};
  for (const s of statuses) counts[s] = 0;
  counts.other = 0;

  const byAgent = {};
  const byModel = {};

  for (const t of tasks) {
    const s = (t.status || 'pending').toLowerCase();
    if (statuses.includes(s)) {
      counts[s]++;
    } else {
      counts.other++;
    }

    // per agent
    const aid = t.agentId || '(unknown)';
    if (!byAgent[aid]) byAgent[aid] = { total: 0, completed: 0, running: 0, failed: 0, blocked: 0, pending: 0 };
    byAgent[aid].total++;
    if (byAgent[aid][s] !== undefined) byAgent[aid][s]++;

    // per model
    const mid = t.model || '(unknown)';
    if (!byModel[mid]) byModel[mid] = { total: 0, completed: 0, running: 0, failed: 0, blocked: 0, pending: 0 };
    byModel[mid].total++;
    if (byModel[mid][s] !== undefined) byModel[mid][s]++;
  }

  const total = tasks.length || 1; // avoid div-by-zero
  const completionRate = ((counts.completed / total) * 100).toFixed(1) + '%';
  const coverageRate = (((counts.completed + counts.running) / total) * 100).toFixed(1) + '%';

  return {
    total: tasks.length,
    ...counts,
    completionRate,
    coverageRate,
    byAgent,
    byModel
  };
}

// ─── Next Steps ─────────────────────────────────────────────────────────────

function suggestNextSteps(tasks, stats, c) {
  const steps = [];

  // blocked tasks
  const blocked = tasks.filter(t => (t.status || '').toLowerCase() === 'blocked');
  for (const t of blocked) {
    steps.push(`⏸️ **${t.agentId}**: _${t.task}_ — blocked${t.error ? ': ' + t.error : ', investigate dependency'}`);
  }

  // failed tasks
  const failed = tasks.filter(t => (t.status || '').toLowerCase() === 'failed');
  for (const t of failed) {
    steps.push(`❌ **${t.agentId}**: _${t.task}_ — failed${t.error ? ': ' + t.error + ' → retry or fix' : ', needs investigation'}`);
  }

  // running tasks
  const running = tasks.filter(t => (t.status || '').toLowerCase() === 'running');
  for (const t of running) {
    steps.push(`🔄 **${t.agentId}**: _${t.task}_ — still running, monitor for completion`);
  }

  // pending tasks
  const pending = tasks.filter(t => (t.status || '').toLowerCase() === 'pending');
  if (pending.length > 0) {
    steps.push(`⏳ **${pending.length}** task(s) pending — ready to dispatch`);
  }

  // all done
  if (stats.completed === stats.total && stats.total > 0) {
    steps.push('🎉 All tasks completed — ready for integration / merge');
  }

  return steps;
}

// ─── Formatters ─────────────────────────────────────────────────────────────

function formatTable(tasks, c) {
  const icons = c.statusIcons || {};
  const show = c.showThinking !== false;

  const headers = ['Agent', 'Model', 'Task', 'Status', 'Duration', 'Commit'];
  const rows = tasks.map(t => [
    escMd(t.agentId),
    escMd(modelDisplay(t, show)),
    escMd(t.task),
    `${statusIcon((t.status || '').toLowerCase(), icons)} ${escMd(t.status)}`,
    escMd(t.duration),
    escMd(t.commit)
  ]);

  // compute column widths
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
    const icon = statusIcon((t.status || '').toLowerCase(), icons);
    const model = modelDisplay(t, show);
    let line = `${i + 1}. ${icon} **${t.agentId}** / ${model} — _${t.task}_`;
    line += `\n   Status: ${t.status}`;
    if (t.duration) line += ` | Duration: ${t.duration}`;
    if (t.commit) line += ` | Commit: \`${t.commit}\``;
    if (t.error) line += `\n   Error: ${t.error}`;
    return line;
  }).join('\n');
}

function formatCompact(tasks, c) {
  const icons = c.statusIcons || {};
  const show = c.showThinking !== false;

  return tasks.map(t => {
    const icon = statusIcon((t.status || '').toLowerCase(), icons);
    const model = modelDisplay(t, show);
    const parts = [
      `${icon} ${t.agentId}/${model}`,
      t.task,
      t.status
    ];
    if (t.duration) parts.push(t.duration);
    if (t.commit) parts.push(t.commit);
    if (t.error) parts.push(`err:${t.error}`);
    return parts.join(' | ');
  }).join('\n');
}

// ─── Format Report ──────────────────────────────────────────────────────────

/**
 * Format an array of task entries into a Markdown report.
 *
 * @param {Array<object>} tasks - Array of TaskEntry objects
 * @param {object} [options] - Override any config.json defaults
 * @returns {string} Markdown report
 */
function formatReport(tasks, options) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return '_No task data to report._';
  }

  const c = cfg(options);
  const fmt = (c.outputFormat || 'table').toLowerCase();
  const lines = [];

  // Title
  if (c.title) {
    lines.push(`## ${c.title}`, '');
  }

  // Body
  if (fmt === 'list') {
    lines.push(formatList(tasks, c));
  } else if (fmt === 'compact') {
    lines.push('```');
    lines.push(formatCompact(tasks, c));
    lines.push('```');
  } else {
    lines.push(formatTable(tasks, c));
  }

  // Summary
  const stats = computeStats(tasks, options);
  if (c.showSummary !== false) {
    lines.push('', '### Summary');
    lines.push(
      `- **Total:** ${stats.total} | ` +
      `**Completed:** ${stats.completed} | ` +
      `**Running:** ${stats.running} | ` +
      `**Failed:** ${stats.failed} | ` +
      `**Blocked:** ${stats.blocked}`
    );
    lines.push(
      `- **Completion:** ${stats.completionRate} | **Coverage:** ${stats.coverageRate}`
    );
  }

  // Next steps
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

/**
 * Validate task entries for completeness and correctness.
 *
 * @param {Array<object>} tasks
 * @param {object} [options]
 * @returns {object} ValidationResult
 */
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

    // Required fields
    for (const f of required) {
      if (t[f] === undefined || t[f] === null || t[f] === '') {
        issues.push({ index: i, agentId: aid, field: f, message: `Missing required field: ${f}`, severity: 'error' });
      }
    }

    // Full model name check
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

    // Completed tasks must have commit
    const status = (t.status || '').toLowerCase();
    if (v.requireCommitOnComplete !== false && status === 'completed') {
      if (!t.commit || String(t.commit).trim() === '') {
        issues.push({
          index: i, agentId: aid, field: 'commit',
          message: 'Completed task is missing a commit hash',
          severity: 'warning'
        });
      }
    }

    // Failed tasks must have error
    if (v.requireErrorOnFail !== false && status === 'failed') {
      if (!t.error || String(t.error).trim() === '') {
        issues.push({
          index: i, agentId: aid, field: 'error',
          message: 'Failed task is missing an error reason',
          severity: 'error'
        });
      }
    }
  }

  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warnCount = issues.filter(i => i.severity === 'warning').length;
  const failedEntries = new Set(issues.filter(i => i.severity === 'error').map(i => i.index)).size;

  // Build markdown report
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

/**
 * Generate a pre-filled report template from a planned task list.
 *
 * @param {Array<{agentId: string, task: string, model?: string}>} taskList
 * @param {object} [options]
 * @returns {string} Markdown template
 */
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
    error: t.error || ''
  }));

  return formatReport(tasks, {
    ...c,
    title: c.title ? `${c.title} — Template` : 'Report Template',
    showNextSteps: false
  });
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  formatReport,
  validateReport,
  generateTemplate,
  computeStats,

  // Expose internals for advanced use
  _suggestNextSteps: suggestNextSteps,
  _formatTable: formatTable,
  _formatList: formatList,
  _formatCompact: formatCompact,
  _defaultConfig: defaultConfig
};
