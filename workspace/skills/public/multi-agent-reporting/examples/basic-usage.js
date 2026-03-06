#!/usr/bin/env node

/**
 * multi-agent-reporting — Basic Usage Examples
 *
 * Run:  node examples/basic-usage.js
 */

'use strict';

const { formatReport, validateReport, generateTemplate, computeStats } = require('../index.js');

// ── Sample task data ────────────────────────────────────────────────────────

const tasks = [
  {
    agentId: 'coder-1',
    model: 'claude-sonnet-4-20250514',
    thinking: 'high',
    task: 'Implement user authentication module',
    status: 'completed',
    duration: '4m 12s',
    commit: 'a3f8c21'
  },
  {
    agentId: 'coder-2',
    model: 'gpt-4o-2024-08-06',
    task: 'Build REST API endpoints',
    status: 'running',
    duration: '2m 35s'
  },
  {
    agentId: 'coder-3',
    model: 'claude-opus-4-20250514',
    thinking: 'medium',
    task: 'Design database schema',
    status: 'completed',
    duration: '6m 01s',
    commit: 'b7d4e19'
  },
  {
    agentId: 'coder-4',
    model: 'gemini-2.5-pro-preview-06-05',
    task: 'Write integration tests',
    status: 'failed',
    duration: '1m 48s',
    error: 'Test runner timeout on CI'
  },
  {
    agentId: 'coder-5',
    model: 'deepseek-r1-0528',
    task: 'Implement rate limiter middleware',
    status: 'blocked',
    error: 'Waiting for API endpoint definitions from coder-2'
  }
];

// ── Example 1: Table format (default) ───────────────────────────────────────

console.log('═══════════════════════════════════════════════════');
console.log('  Example 1: Table Format (default)');
console.log('═══════════════════════════════════════════════════\n');
console.log(formatReport(tasks));

// ── Example 2: List format ──────────────────────────────────────────────────

console.log('\n═══════════════════════════════════════════════════');
console.log('  Example 2: List Format');
console.log('═══════════════════════════════════════════════════\n');
console.log(formatReport(tasks, { outputFormat: 'list' }));

// ── Example 3: Compact format ───────────────────────────────────────────────

console.log('\n═══════════════════════════════════════════════════');
console.log('  Example 3: Compact Format');
console.log('═══════════════════════════════════════════════════\n');
console.log(formatReport(tasks, { outputFormat: 'compact' }));

// ── Example 4: Validation ───────────────────────────────────────────────────

console.log('\n═══════════════════════════════════════════════════');
console.log('  Example 4: Validation');
console.log('═══════════════════════════════════════════════════\n');

const badTasks = [
  { agentId: 'agent-1', model: 'claude', task: 'Do thing', status: 'completed' },
  { agentId: 'agent-2', model: 'gpt-4o-2024-08-06', task: 'Other thing', status: 'failed' },
  { agentId: '', model: 'gemini-2.5-pro-preview-06-05', task: '', status: 'running' }
];

const result = validateReport(badTasks);
console.log(result.markdown);
console.log('\nProgrammatic result:');
console.log(`  valid: ${result.valid}`);
console.log(`  passed: ${result.passedEntries}/${result.totalEntries}`);

// ── Example 5: Template generation ──────────────────────────────────────────

console.log('\n═══════════════════════════════════════════════════');
console.log('  Example 5: Template Generation');
console.log('═══════════════════════════════════════════════════\n');

const planned = [
  { agentId: 'frontend-agent', task: 'Build React dashboard', model: 'claude-sonnet-4-20250514' },
  { agentId: 'backend-agent', task: 'Implement GraphQL resolvers' },
  { agentId: 'devops-agent', task: 'Set up CI/CD pipeline', model: 'gpt-4o-2024-08-06' }
];

console.log(generateTemplate(planned));

// ── Example 6: Raw statistics ───────────────────────────────────────────────

console.log('\n═══════════════════════════════════════════════════');
console.log('  Example 6: Raw Statistics');
console.log('═══════════════════════════════════════════════════\n');

const stats = computeStats(tasks);
console.log(JSON.stringify(stats, null, 2));

// ── Example 7: Custom config ────────────────────────────────────────────────

console.log('\n═══════════════════════════════════════════════════');
console.log('  Example 7: Custom Status Icons & Title');
console.log('═══════════════════════════════════════════════════\n');

console.log(formatReport(tasks, {
  title: 'Sprint 42 Agent Report',
  statusIcons: {
    completed: '🟢',
    running: '🟡',
    failed: '🔴',
    blocked: '⚪',
    pending: '🔵'
  },
  showNextSteps: false
}));
