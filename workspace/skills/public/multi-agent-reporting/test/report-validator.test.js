#!/usr/bin/env node

/**
 * multi-agent-reporting — Acceptance Tests
 *
 * Run:  node test/report-validator.test.js
 *
 * Zero dependencies — uses Node.js built-in assert.
 */

'use strict';

const assert = require('assert');
const { formatReport, validateReport, generateTemplate, computeStats } = require('../index.js');

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    failures.push({ name, error: e.message });
    console.log(`  ❌ ${name}`);
    console.log(`     ${e.message}`);
  }
}

// ── Test data ───────────────────────────────────────────────────────────────

const goodTasks = [
  {
    agentId: 'agent-1',
    model: 'claude-sonnet-4-20250514',
    task: 'Implement auth',
    status: 'completed',
    duration: '3m 42s',
    commit: 'a1b2c3d',
    thinking: 'high'
  },
  {
    agentId: 'agent-2',
    model: 'gpt-4o-2024-08-06',
    task: 'Build API',
    status: 'running',
    duration: '1m 20s'
  },
  {
    agentId: 'agent-3',
    model: 'gemini-2.5-pro-preview-06-05',
    task: 'Write tests',
    status: 'failed',
    error: 'Timeout in test runner'
  }
];

// ── computeStats ────────────────────────────────────────────────────────────

console.log('\n📊 computeStats');

test('counts statuses correctly', () => {
  const s = computeStats(goodTasks);
  assert.strictEqual(s.total, 3);
  assert.strictEqual(s.completed, 1);
  assert.strictEqual(s.running, 1);
  assert.strictEqual(s.failed, 1);
  assert.strictEqual(s.blocked, 0);
});

test('computes completion rate', () => {
  const s = computeStats(goodTasks);
  assert.strictEqual(s.completionRate, '33.3%');
});

test('computes coverage rate (completed + running)', () => {
  const s = computeStats(goodTasks);
  assert.strictEqual(s.coverageRate, '66.7%');
});

test('all completed → 100% rates', () => {
  const tasks = [
    { agentId: 'a', model: 'claude-sonnet-4-20250514', task: 'x', status: 'completed', commit: '123' },
    { agentId: 'b', model: 'gpt-4o-2024-08-06', task: 'y', status: 'completed', commit: '456' }
  ];
  const s = computeStats(tasks);
  assert.strictEqual(s.completionRate, '100.0%');
  assert.strictEqual(s.coverageRate, '100.0%');
});

test('tracks per-agent stats', () => {
  const s = computeStats(goodTasks);
  assert.strictEqual(s.byAgent['agent-1'].total, 1);
  assert.strictEqual(s.byAgent['agent-1'].completed, 1);
});

test('tracks per-model stats', () => {
  const s = computeStats(goodTasks);
  assert.ok(s.byModel['claude-sonnet-4-20250514']);
  assert.strictEqual(s.byModel['claude-sonnet-4-20250514'].completed, 1);
});

test('handles empty array', () => {
  const s = computeStats([]);
  assert.strictEqual(s.total, 0);
  assert.strictEqual(s.completionRate, '0.0%');
});

test('handles unknown statuses', () => {
  const s = computeStats([{ agentId: 'a', model: 'm', task: 't', status: 'custom-thing' }]);
  assert.strictEqual(s.other, 1);
});

// ── validateReport ──────────────────────────────────────────────────────────

console.log('\n🔍 validateReport');

test('good data passes validation', () => {
  const r = validateReport(goodTasks);
  assert.strictEqual(r.valid, true);
  assert.strictEqual(r.issues.length, 0);
});

test('detects missing required fields', () => {
  const tasks = [{ agentId: 'a', task: 'x', status: 'running' }]; // missing model
  const r = validateReport(tasks);
  assert.strictEqual(r.valid, false);
  assert.ok(r.issues.some(i => i.field === 'model' && i.severity === 'error'));
});

test('rejects short model names (blacklisted)', () => {
  const tasks = [{ agentId: 'a', model: 'claude', task: 'x', status: 'running' }];
  const r = validateReport(tasks);
  assert.ok(r.issues.some(i => i.field === 'model' && i.message.includes('short name')));
});

test('warns on short model names (not blacklisted)', () => {
  const tasks = [{ agentId: 'a', model: 'mymodel', task: 'x', status: 'running' }];
  const r = validateReport(tasks);
  assert.ok(r.issues.some(i => i.field === 'model' && i.severity === 'warning'));
});

test('completed without commit → warning', () => {
  const tasks = [{ agentId: 'a', model: 'claude-sonnet-4-20250514', task: 'x', status: 'completed' }];
  const r = validateReport(tasks);
  assert.ok(r.issues.some(i => i.field === 'commit' && i.severity === 'warning'));
});

test('failed without error → error', () => {
  const tasks = [{ agentId: 'a', model: 'claude-sonnet-4-20250514', task: 'x', status: 'failed' }];
  const r = validateReport(tasks);
  assert.ok(r.issues.some(i => i.field === 'error' && i.severity === 'error'));
});

test('validation output includes markdown', () => {
  const tasks = [{ agentId: 'a', model: 'claude', task: 'x', status: 'failed' }];
  const r = validateReport(tasks);
  assert.ok(r.markdown.includes('Validation Report'));
  assert.ok(r.markdown.includes('error'));
});

test('non-array input returns error', () => {
  const r = validateReport('not an array');
  assert.strictEqual(r.valid, false);
  assert.ok(r.markdown.includes('not an array'));
});

test('custom required fields', () => {
  const tasks = [{ agentId: 'a', model: 'claude-sonnet-4-20250514', task: 'x', status: 'running' }];
  const r = validateReport(tasks, { requiredFields: ['agentId', 'model', 'task', 'status', 'duration'] });
  assert.strictEqual(r.valid, false);
  assert.ok(r.issues.some(i => i.field === 'duration'));
});

test('disable commit check', () => {
  const tasks = [{ agentId: 'a', model: 'claude-sonnet-4-20250514', task: 'x', status: 'completed' }];
  const r = validateReport(tasks, { validation: { requireCommitOnComplete: false } });
  assert.ok(!r.issues.some(i => i.field === 'commit'));
});

// ── formatReport ────────────────────────────────────────────────────────────

console.log('\n📝 formatReport');

// v2: default is dashboard — check dashboard output
test('default dashboard format contains section headers', () => {
  const report = formatReport(goodTasks);
  assert.ok(report.includes('Overview') || report.includes('Running') || report.includes('Completed'));
});

test('dashboard contains agent data', () => {
  const report = formatReport(goodTasks);
  assert.ok(report.includes('agent-1'));
  assert.ok(report.includes('a1b2c3d'));
});

test('dashboard includes summary (Overview section)', () => {
  const report = formatReport(goodTasks);
  assert.ok(report.includes('Overview') || report.includes('complete'));
  assert.ok(report.includes('Coverage:'));
});

test('dashboard includes next actions', () => {
  const report = formatReport(goodTasks);
  assert.ok(report.includes('Next Actions') || report.includes('Next Steps'));
});

// Legacy table format explicitly
test('table format contains headers', () => {
  const report = formatReport(goodTasks, { outputFormat: 'table' });
  assert.ok(report.includes('Agent'));
  assert.ok(report.includes('Model'));
  assert.ok(report.includes('Status'));
});

test('table format contains task data', () => {
  const report = formatReport(goodTasks, { outputFormat: 'table' });
  assert.ok(report.includes('agent-1'));
  assert.ok(report.includes('claude-sonnet-4-20250514(high)'));
  assert.ok(report.includes('a1b2c3d'));
});

test('table format includes summary', () => {
  const report = formatReport(goodTasks, { outputFormat: 'table' });
  assert.ok(report.includes('Summary'));
  assert.ok(report.includes('Completion:'));
  assert.ok(report.includes('Coverage:'));
});

test('table format includes next steps', () => {
  const report = formatReport(goodTasks, { outputFormat: 'table' });
  assert.ok(report.includes('Next Steps'));
});

test('list format works', () => {
  const report = formatReport(goodTasks, { outputFormat: 'list' });
  assert.ok(report.includes('1.'));
  assert.ok(report.includes('2.'));
});

test('compact format works', () => {
  const report = formatReport(goodTasks, { outputFormat: 'compact' });
  assert.ok(report.includes('```'));
  assert.ok(report.includes('agent-1/claude-sonnet-4-20250514(high)'));
});

test('empty array returns placeholder', () => {
  const report = formatReport([]);
  assert.ok(report.includes('No task data'));
});

test('custom title', () => {
  const report = formatReport(goodTasks, { title: 'Sprint 42 Report' });
  assert.ok(report.includes('Sprint 42 Report'));
});

test('custom status icons (dashboard)', () => {
  const report = formatReport(goodTasks, { statusIcons: { completed: '🟢', running: '🟡', failed: '🔴' } });
  // Dashboard shows completed section; icon appears in completed table or Next Actions
  assert.ok(report.includes('🟢') || report.includes('🟡') || report.includes('🔴'));
});

test('disable summary', () => {
  const report = formatReport(goodTasks, { outputFormat: 'table', showSummary: false });
  assert.ok(!report.includes('### Summary'));
});

test('disable next steps', () => {
  const report = formatReport(goodTasks, { outputFormat: 'table', showNextSteps: false });
  assert.ok(!report.includes('### Next Steps'));
});

test('thinking level hidden when disabled', () => {
  const report = formatReport(goodTasks, { showThinking: false });
  assert.ok(!report.includes('(high)'));
});

// ── generateTemplate ────────────────────────────────────────────────────────

console.log('\n📋 generateTemplate');

test('generates template from task list', () => {
  const planned = [
    { agentId: 'fe', task: 'Build frontend', model: 'claude-sonnet-4-20250514' },
    { agentId: 'be', task: 'Build backend' }
  ];
  // Force table format so we can assert on specific cell content
  const template = generateTemplate(planned, { outputFormat: 'table' });
  assert.ok(template.includes('Template'));
  assert.ok(template.includes('fe'));
  assert.ok(template.includes('Build frontend'));
  assert.ok(template.includes('pending') || template.includes('⏳'));
});

test('template uses default pending status', () => {
  // Use table format to get simple table with status column
  const t = generateTemplate([{ agentId: 'a', task: 'x' }], { outputFormat: 'table' });
  assert.ok(t.includes('pending') || t.includes('⏳'));
});

test('template respects outputFormat', () => {
  const t = generateTemplate([{ agentId: 'a', task: 'x' }], { outputFormat: 'list' });
  assert.ok(t.includes('1.'));
});

test('empty task list returns placeholder', () => {
  const t = generateTemplate([]);
  assert.ok(t.includes('No tasks'));
});

test('template does not include next steps', () => {
  const t = generateTemplate([{ agentId: 'a', task: 'x' }]);
  assert.ok(!t.includes('### Next Steps'));
});

// ── Edge cases ──────────────────────────────────────────────────────────────

console.log('\n🧪 Edge Cases');

test('handles tasks with pipe characters in names', () => {
  const tasks = [{ agentId: 'a|b', model: 'claude-sonnet-4-20250514', task: 'x | y', status: 'running' }];
  const report = formatReport(tasks);
  assert.ok(report.includes('a\\|b'));
  assert.ok(report.includes('x \\| y'));
});

test('handles missing optional fields gracefully', () => {
  const tasks = [{ agentId: 'a', model: 'claude-sonnet-4-20250514', task: 'x', status: 'running' }];
  const report = formatReport(tasks);
  assert.ok(report.includes('—')); // duration/commit show as —
});

test('all blocked tasks suggest investigation', () => {
  const tasks = [
    { agentId: 'a', model: 'claude-sonnet-4-20250514', task: 'x', status: 'blocked', error: 'Dep missing' }
  ];
  const report = formatReport(tasks);
  assert.ok(report.includes('blocked'));
  assert.ok(report.includes('Dep missing'));
});

test('all completed → celebration message', () => {
  const tasks = [
    { agentId: 'a', model: 'claude-sonnet-4-20250514', task: 'x', status: 'completed', commit: '123' },
    { agentId: 'b', model: 'gpt-4o-2024-08-06', task: 'y', status: 'completed', commit: '456' }
  ];
  const report = formatReport(tasks);
  assert.ok(report.includes('🎉'));
});

// ── Summary ─────────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(50));
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('═'.repeat(50));

if (failures.length > 0) {
  console.log('\nFailures:');
  for (const f of failures) {
    console.log(`  - ${f.name}: ${f.error}`);
  }
}

process.exit(failed > 0 ? 1 : 0);
