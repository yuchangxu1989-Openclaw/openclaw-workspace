#!/usr/bin/env node

/**
 * multi-agent-reporting v3.0.0 — Tests
 * Run: node test/reporting.test.js
 * Zero dependencies.
 */

'use strict';

const assert = require('assert');
const {
  renderReport, renderText, renderCard,
  computeStats, classify, generateTitle,
  shortModel, agentName,
  _meta, _norm, _cardColor, _modelDisplay
} = require('../index.js');

let passed = 0, failed = 0;
const failures = [];

function test(name, fn) {
  try { fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e) { failed++; failures.push({ name, error: e.message }); console.log(`  ❌ ${name}\n     ${e.message}`); }
}

// ═══════════════════════════════════════════════════════════════
// Test data
// ═══════════════════════════════════════════════════════════════

const mixedTasks = [
  { agentId: 'writer', displayName: '创作大师', model: 'claude-opus-4-20250514', task: '写技术文档', status: 'running', duration: '3m12s', thinking: 'high' },
  { agentId: 'researcher', displayName: '研究员', model: 'gpt-4o-2024-08-06', task: '调研竞品API', status: 'running', duration: '1m45s' },
  { agentId: 'architect', displayName: '架构师', model: 'claude-sonnet-4-20250514', task: '系统设计', status: 'completed', duration: '5m20s' },
  { agentId: 'dbadmin', displayName: 'DBA专家', model: 'gemini-2.5-pro-preview-06-05', task: 'DB迁移', status: 'blocked', blocker: 'schema lock' },
  { agentId: 'pm', displayName: '产品经理', model: 'gpt-4o-2024-08-06', task: '选认证方案', status: 'needs_decision', decision: 'Auth0 vs Cognito', decisionOwner: 'tech-lead' },
  { agentId: 'tester', displayName: '测试专家', model: 'claude-haiku-3-5-20241022', task: '写单元测试', status: 'pending' },
];

const allCompleted = [
  { agentId: 'a', displayName: 'Alice', model: 'claude-sonnet-4-20250514', task: 'Task A', status: 'completed', duration: '2m' },
  { agentId: 'b', displayName: 'Bob', model: 'gpt-4o-2024-08-06', task: 'Task B', status: 'completed', duration: '3m' },
];

const zeroActive = [
  { agentId: 'a', displayName: 'Alice', model: 'claude-sonnet-4-20250514', task: 'Done task', status: 'completed', duration: '2m' },
  { agentId: 'b', displayName: 'Bob', model: 'gpt-4o-2024-08-06', task: 'Blocked task', status: 'blocked', blocker: 'Missing dep' },
  { agentId: 'c', displayName: 'Carol', model: 'gemini-2.5-pro-preview-06-05', task: 'Decision task', status: 'needs_decision', decision: 'Which DB?' },
];

// ═══════════════════════════════════════════════════════════════
// shortModel
// ═══════════════════════════════════════════════════════════════

console.log('\n🔤 shortModel');

test('claude-sonnet-4-20250514 → sonnet-4', () => {
  assert.strictEqual(shortModel('claude-sonnet-4-20250514'), 'sonnet-4');
});

test('claude-opus-4-20250514 → opus-4', () => {
  assert.strictEqual(shortModel('claude-opus-4-20250514'), 'opus-4');
});

test('gpt-4o-2024-08-06 → gpt-4o', () => {
  assert.strictEqual(shortModel('gpt-4o-2024-08-06'), 'gpt-4o');
});

test('gemini-2.5-pro-preview-06-05 → gem-2.5-pro', () => {
  assert.strictEqual(shortModel('gemini-2.5-pro-preview-06-05'), 'gem-2.5-pro');
});

test('boom-writer/gpt-5.4 → gpt-5.4', () => {
  assert.strictEqual(shortModel('boom-writer/gpt-5.4'), 'gpt-5.4');
});

test('deepseek-r1 → deepseek-r1', () => {
  assert.strictEqual(shortModel('deepseek-r1'), 'deepseek-r1');
});

test('o4-mini → o4-mini', () => {
  assert.strictEqual(shortModel('o4-mini'), 'o4-mini');
});

test('null → —', () => {
  assert.strictEqual(shortModel(null), '—');
});

test('claude-haiku-3-5-20241022 → haiku-3-5', () => {
  assert.strictEqual(shortModel('claude-haiku-3-5-20241022'), 'haiku-3-5');
});

// ═══════════════════════════════════════════════════════════════
// agentName
// ═══════════════════════════════════════════════════════════════

console.log('\n👤 agentName');

test('prefers displayName', () => {
  assert.strictEqual(agentName({ displayName: '创作大师', agentId: 'writer' }), '创作大师');
});

test('falls back to agentName field', () => {
  assert.strictEqual(agentName({ agentName: 'Writer', agentId: 'w' }), 'Writer');
});

test('falls back to agentId', () => {
  assert.strictEqual(agentName({ agentId: 'writer' }), 'writer');
});

test('returns — for empty', () => {
  assert.strictEqual(agentName({}), '—');
});

// ═══════════════════════════════════════════════════════════════
// classify
// ═══════════════════════════════════════════════════════════════

console.log('\n📂 classify');

test('correctly classifies mixed tasks', () => {
  const c = classify(mixedTasks);
  assert.strictEqual(c.active.length, 2);
  assert.strictEqual(c.completed.length, 1);
  assert.strictEqual(c.blocked.length, 1);
  assert.strictEqual(c.decisions.length, 1);
  assert.strictEqual(c.queued.length, 1);
});

test('handles empty array', () => {
  const c = classify([]);
  assert.strictEqual(c.active.length, 0);
  assert.strictEqual(c.completed.length, 0);
});

test('handles null', () => {
  const c = classify(null);
  assert.strictEqual(c.active.length, 0);
});

test('failed goes to blocked zone', () => {
  const c = classify([{ status: 'failed' }]);
  assert.strictEqual(c.blocked.length, 1);
});

test('unknown status goes to other', () => {
  const c = classify([{ status: 'custom_thing' }]);
  assert.strictEqual(c.other.length, 1);
});

// ═══════════════════════════════════════════════════════════════
// computeStats
// ═══════════════════════════════════════════════════════════════

console.log('\n📊 computeStats');

test('counts correctly', () => {
  const s = computeStats(mixedTasks);
  assert.strictEqual(s.total, 6);
  assert.strictEqual(s.active, 2);
  assert.strictEqual(s.completed, 1);
  assert.strictEqual(s.blocked, 1);
  assert.strictEqual(s.decisions, 1);
  assert.strictEqual(s.queued, 1);
});

test('empty array → all zeros', () => {
  const s = computeStats([]);
  assert.strictEqual(s.total, 0);
  assert.strictEqual(s.active, 0);
});

// ═══════════════════════════════════════════════════════════════
// generateTitle
// ═══════════════════════════════════════════════════════════════

console.log('\n📌 generateTitle');

test('active tasks → 并行执行中', () => {
  const t = generateTitle({ total: 6, active: 2, completed: 1, blocked: 1, decisions: 1, queued: 1 });
  assert.ok(t.includes('2 Agent 并行执行中'));
  assert.ok(t.includes('⚠️'));
  assert.ok(t.includes('⚖️'));
});

test('0 active → shows 0 活跃 + completed count', () => {
  const t = generateTitle({ total: 3, active: 0, completed: 2, blocked: 1, decisions: 0, queued: 0 });
  assert.ok(t.includes('0 活跃'));
  assert.ok(t.includes('✅2完成'));
});

test('all completed → 全部完成', () => {
  const t = generateTitle({ total: 3, active: 0, completed: 3, blocked: 0, decisions: 0, queued: 0 });
  assert.ok(t.includes('全部完成'));
  assert.ok(t.includes('3'));
});

test('0 total → 暂无任务', () => {
  const t = generateTitle({ total: 0, active: 0, completed: 0, blocked: 0, decisions: 0, queued: 0 });
  assert.ok(t.includes('暂无任务'));
});

test('custom title overrides', () => {
  const t = generateTitle({ total: 5, active: 3 }, { title: 'My Board' });
  assert.strictEqual(t, 'My Board');
});

test('does NOT contain concurrency limit', () => {
  const t = generateTitle({ total: 6, active: 2, completed: 1, blocked: 1, decisions: 1, queued: 1 });
  assert.ok(!t.includes('/'));  // No "2/5" or "2/8" pattern
});

// ═══════════════════════════════════════════════════════════════
// renderText
// ═══════════════════════════════════════════════════════════════

console.log('\n📝 renderText');

test('active tasks render as main table', () => {
  const text = renderText(mixedTasks);
  assert.ok(text.includes('| # | Agent | 任务 | 模型 | 状态 | 用时 |'));
  assert.ok(text.includes('创作大师'));
  assert.ok(text.includes('研究员'));
  assert.ok(text.includes('opus-4'));
  assert.ok(text.includes('🔄执行'));
});

test('no "下一步" column', () => {
  const text = renderText(mixedTasks);
  assert.ok(!text.includes('下一步'));
  assert.ok(!text.includes('Next'));
});

test('completed shown as compact list when active > 0', () => {
  const text = renderText(mixedTasks);
  assert.ok(text.includes('✅ 新完成'));
  assert.ok(text.includes('架构师「系统设计」'));
});

test('risks shown', () => {
  const text = renderText(mixedTasks);
  assert.ok(text.includes('⚠️ 关键风险'));
  assert.ok(text.includes('schema lock'));
});

test('decisions shown', () => {
  const text = renderText(mixedTasks);
  assert.ok(text.includes('⚖️ 待决策'));
  assert.ok(text.includes('Auth0 vs Cognito'));
  assert.ok(text.includes('@tech-lead'));
});

test('0 active → completed as table, not empty', () => {
  const text = renderText(zeroActive);
  assert.ok(text.includes('⏸️ 0 活跃'));
  assert.ok(text.includes('### ✅ 新完成'));
  assert.ok(text.includes('| # | Agent | 任务 | 模型 | 用时 |'));
  assert.ok(text.includes('Alice'));
});

test('0 active → still shows risks and decisions', () => {
  const text = renderText(zeroActive);
  assert.ok(text.includes('⚠️ 关键风险'));
  assert.ok(text.includes('Missing dep'));
  assert.ok(text.includes('⚖️ 待决策'));
  assert.ok(text.includes('Which DB?'));
});

test('all completed → celebration title', () => {
  const text = renderText(allCompleted);
  assert.ok(text.includes('全部完成'));
});

test('empty → placeholder', () => {
  const text = renderText([]);
  assert.ok(text.includes('暂无任务'));
});

test('null → placeholder', () => {
  const text = renderText(null);
  assert.ok(text.includes('暂无任务'));
});

test('pipe chars in names are escaped', () => {
  const tasks = [{ agentId: 'a|b', displayName: 'X|Y', model: 'claude-sonnet-4-20250514', task: 'do|this', status: 'running', duration: '1m' }];
  const text = renderText(tasks);
  assert.ok(text.includes('X\\|Y'));
  assert.ok(text.includes('do\\|this'));
});

test('model names are shortened', () => {
  const text = renderText(mixedTasks);
  assert.ok(text.includes('opus-4'));
  assert.ok(text.includes('gpt-4o'));
  assert.ok(!text.includes('claude-opus-4-20250514'));
  assert.ok(!text.includes('gpt-4o-2024-08-06'));
});

test('uses displayName over agentId', () => {
  const text = renderText(mixedTasks);
  assert.ok(text.includes('创作大师'));
  assert.ok(!text.includes('| writer |'));  // agentId should not appear in table
});

test('queued not shown by default', () => {
  const text = renderText(mixedTasks);
  assert.ok(!text.includes('排队'));
});

test('queued shown when showQueued=true', () => {
  const text = renderText(mixedTasks, { showQueued: true });
  assert.ok(text.includes('⏳ 排队'));
  assert.ok(text.includes('测试专家'));
});

test('showThinking adds thinking level', () => {
  const text = renderText(mixedTasks, { showThinking: true });
  assert.ok(text.includes('opus-4(high)'));
});

test('showThinking=false hides thinking level', () => {
  const text = renderText(mixedTasks, { showThinking: false });
  assert.ok(!text.includes('(high)'));
});

// ═══════════════════════════════════════════════════════════════
// renderCard
// ═══════════════════════════════════════════════════════════════

console.log('\n🎴 renderCard');

test('card has header with title', () => {
  const card = renderCard(mixedTasks);
  assert.ok(card.header);
  assert.ok(card.header.title.content.includes('2 Agent 并行执行中'));
});

test('card color is orange when risks exist', () => {
  const card = renderCard(mixedTasks);
  assert.strictEqual(card.header.template, 'orange');
});

test('card color is blue for active-only', () => {
  const tasks = [{ agentId: 'a', displayName: 'A', model: 'm-1234', task: 't', status: 'running', duration: '1m' }];
  const card = renderCard(tasks);
  assert.strictEqual(card.header.template, 'blue');
});

test('card color is green when all completed', () => {
  const card = renderCard(allCompleted);
  assert.strictEqual(card.header.template, 'green');
});

test('card color is grey for empty', () => {
  const card = renderCard([]);
  assert.strictEqual(card.header.template, 'grey');
});

test('card has elements array', () => {
  const card = renderCard(mixedTasks);
  assert.ok(Array.isArray(card.elements));
  assert.ok(card.elements.length > 0);
});

test('card elements contain agent names', () => {
  const card = renderCard(mixedTasks);
  const content = card.elements.map(e => e.text ? e.text.content : '').join('\n');
  assert.ok(content.includes('创作大师'));
  assert.ok(content.includes('研究员'));
});

test('card includes completed section', () => {
  const card = renderCard(mixedTasks);
  const content = card.elements.map(e => e.text ? e.text.content : '').join('\n');
  assert.ok(content.includes('新完成'));
  assert.ok(content.includes('架构师'));
});

test('card includes risk section', () => {
  const card = renderCard(mixedTasks);
  const content = card.elements.map(e => e.text ? e.text.content : '').join('\n');
  assert.ok(content.includes('关键风险'));
  assert.ok(content.includes('schema lock'));
});

test('card includes decision section', () => {
  const card = renderCard(mixedTasks);
  const content = card.elements.map(e => e.text ? e.text.content : '').join('\n');
  assert.ok(content.includes('待决策'));
  assert.ok(content.includes('Auth0 vs Cognito'));
});

test('card wide_screen_mode enabled', () => {
  const card = renderCard(mixedTasks);
  assert.strictEqual(card.config.wide_screen_mode, true);
});

test('0 active card still has content', () => {
  const card = renderCard(zeroActive);
  assert.ok(card.elements.length > 0);
  const content = card.elements.map(e => e.text ? e.text.content : '').join('\n');
  assert.ok(content.includes('新完成'));
});

// ═══════════════════════════════════════════════════════════════
// renderReport (unified)
// ═══════════════════════════════════════════════════════════════

console.log('\n🎯 renderReport');

test('returns text, card, title, stats', () => {
  const r = renderReport(mixedTasks);
  assert.ok(typeof r.text === 'string');
  assert.ok(typeof r.card === 'object');
  assert.ok(typeof r.title === 'string');
  assert.ok(typeof r.stats === 'object');
});

test('text and card are consistent', () => {
  const r = renderReport(mixedTasks);
  assert.ok(r.text.includes('创作大师'));
  const cardContent = r.card.elements.map(e => e.text ? e.text.content : '').join('\n');
  assert.ok(cardContent.includes('创作大师'));
});

test('handles null input', () => {
  const r = renderReport(null);
  assert.ok(r.text.includes('暂无'));
  assert.strictEqual(r.stats.total, 0);
});

// ═══════════════════════════════════════════════════════════════
// Edge cases
// ═══════════════════════════════════════════════════════════════

console.log('\n🧪 Edge Cases');

test('single running task', () => {
  const tasks = [{ agentId: 'solo', displayName: '独行侠', model: 'claude-sonnet-4-20250514', task: '独立任务', status: 'running', duration: '1m' }];
  const text = renderText(tasks);
  assert.ok(text.includes('1 Agent 并行执行中'));
  assert.ok(text.includes('独行侠'));
  assert.ok(!text.includes('新完成'));
  assert.ok(!text.includes('关键风险'));
});

test('only blocked tasks → 0 active with risks', () => {
  const tasks = [{ agentId: 'b', displayName: '阻塞者', model: 'm-1234', task: '被阻塞', status: 'blocked', blocker: '依赖缺失' }];
  const text = renderText(tasks);
  assert.ok(text.includes('0 活跃'));
  assert.ok(text.includes('⚠️ 关键风险'));
  assert.ok(text.includes('依赖缺失'));
});

test('only decisions → 0 active with decisions', () => {
  const tasks = [{ agentId: 'd', displayName: '决策者', model: 'm-1234', task: '需决策', status: 'needs_decision', decision: '选A还是B' }];
  const text = renderText(tasks);
  assert.ok(text.includes('0 活跃'));
  assert.ok(text.includes('⚖️ 待决策'));
  assert.ok(text.includes('选A还是B'));
});

test('many completed truncated with inline limit', () => {
  const tasks = [];
  for (let i = 0; i < 8; i++) {
    tasks.push({ agentId: `a${i}`, displayName: `Agent${i}`, model: 'm-1234', task: `Task${i}`, status: 'completed', duration: '1m' });
  }
  tasks.push({ agentId: 'active', displayName: '活跃者', model: 'm-1234', task: '活跃任务', status: 'running', duration: '2m' });
  const text = renderText(tasks, { maxCompletedInline: 3 });
  assert.ok(text.includes('另有 5 项'));
});

test('failed task shows error in risk section', () => {
  const tasks = [
    { agentId: 'f', displayName: '失败者', model: 'm-1234', task: '失败任务', status: 'failed', error: 'OOM killed' },
    { agentId: 'r', displayName: '跑步者', model: 'm-1234', task: '正在跑', status: 'running', duration: '1m' },
  ];
  const text = renderText(tasks);
  assert.ok(text.includes('OOM killed'));
  assert.ok(text.includes('❌'));
});

// ═══════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════

console.log('\n' + '═'.repeat(50));
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('═'.repeat(50));

if (failures.length > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f.name}: ${f.error}`);
}

process.exit(failed > 0 ? 1 : 0);
