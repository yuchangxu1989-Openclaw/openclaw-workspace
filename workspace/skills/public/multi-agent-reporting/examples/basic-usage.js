#!/usr/bin/env node

/**
 * multi-agent-reporting v2 — Dashboard example
 *
 * Run:  node examples/basic-usage.js
 */

'use strict';

const { formatReport, formatDashboard, validateReport, computeStats, generateTemplate } = require('../index.js');

// ── Sample tasks covering all status zones ───────────────────────────────────

const tasks = [
  {
    agentId: 'auth-agent',
    model: 'claude-sonnet-4-20250514',
    task: 'Implement JWT auth module',
    status: 'completed',
    duration: '3m 42s',
    commit: 'a1b2c3d',
    thinking: 'high',
    artifact: 'PR #42'
  },
  {
    agentId: 'api-agent',
    model: 'gpt-4o-2024-08-06',
    task: 'Design REST API schema',
    status: 'running',
    duration: '1m 20s',
    nextAction: 'Open PR for review',
    nextOwner: 'tech-lead',
    nextETA: '20m'
  },
  {
    agentId: 'db-agent',
    model: 'gemini-2.5-pro-preview-06-05',
    task: 'DB schema migration',
    status: 'blocked',
    blocker: 'Schema lock held by dev-env — wait for nightly reset'
  },
  {
    agentId: 'infra-agent',
    model: 'claude-sonnet-4-20250514',
    task: 'Choose auth provider',
    status: 'needs_decision',
    decision: 'Auth0 vs Cognito',
    decisionOwner: 'tech-lead',
    nextETA: '1h'
  },
  {
    agentId: 'test-agent',
    model: 'gpt-4o-2024-08-06',
    task: 'Write integration tests',
    status: 'failed',
    error: 'Timeout in test runner (jest --runInBand)'
  },
  {
    agentId: 'docs-agent',
    model: 'claude-haiku-3-5-20241022',
    task: 'Generate API docs',
    status: 'pending'
  }
];

// ── 1. Full dashboard (new default) ──────────────────────────────────────────

console.log('\n══════════════════════════════════════');
console.log('  DASHBOARD (default outputFormat)');
console.log('══════════════════════════════════════\n');
console.log(formatReport(tasks));

// ── 2. Dashboard — no model breakdown ────────────────────────────────────────

console.log('\n══════════════════════════════════════');
console.log('  DASHBOARD — minimal');
console.log('══════════════════════════════════════\n');
console.log(formatDashboard(tasks, {
  showModelBreakdown: false,
  showNextHop: false
}));

// ── 3. Legacy table format ────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════');
console.log('  LEGACY TABLE (outputFormat: table)');
console.log('══════════════════════════════════════\n');
console.log(formatReport(tasks, { outputFormat: 'table' }));

// ── 4. List format (Discord / WhatsApp) ──────────────────────────────────────

console.log('\n══════════════════════════════════════');
console.log('  LIST FORMAT');
console.log('══════════════════════════════════════\n');
console.log(formatReport(tasks, { outputFormat: 'list' }));

// ── 5. Compact format (CI logs) ───────────────────────────────────────────────

console.log('\n══════════════════════════════════════');
console.log('  COMPACT FORMAT');
console.log('══════════════════════════════════════\n');
console.log(formatReport(tasks, { outputFormat: 'compact' }));

// ── 6. Validation ─────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════');
console.log('  VALIDATION');
console.log('══════════════════════════════════════\n');
const result = validateReport(tasks);
console.log(result.markdown);

// ── 7. Stats ──────────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════');
console.log('  RAW STATS');
console.log('══════════════════════════════════════\n');
const stats = computeStats(tasks);
console.log(JSON.stringify(stats, null, 2));

// ── 8. Template ───────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════');
console.log('  TEMPLATE (pre-filled from plan)');
console.log('══════════════════════════════════════\n');
const template = generateTemplate([
  { agentId: 'fe', task: 'Build frontend', model: 'claude-sonnet-4-20250514' },
  { agentId: 'be', task: 'Build backend', model: 'gpt-4o-2024-08-06' },
  { agentId: 'qa', task: 'QA & testing' }
]);
console.log(template);
