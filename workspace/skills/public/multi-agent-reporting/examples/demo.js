#!/usr/bin/env node

/**
 * multi-agent-reporting v3 — Demo
 * Run: node examples/demo.js
 */

'use strict';

const { renderReport, renderText, renderCard } = require('../index.js');

// ── Scenario 1: Mixed active tasks ────────────────────────────

const scenario1 = [
  { agentId: 'writer', displayName: '创作大师', model: 'claude-opus-4-20250514', task: '写技术文档', status: 'running', duration: '3m12s', thinking: 'high' },
  { agentId: 'researcher', displayName: '研究员', model: 'gpt-4o-2024-08-06', task: '调研竞品API', status: 'running', duration: '1m45s' },
  { agentId: 'analyst', displayName: '分析师', model: 'gemini-2.5-pro-preview-06-05', task: '数据分析', status: 'running', duration: '2m03s' },
  { agentId: 'architect', displayName: '架构师', model: 'claude-sonnet-4-20250514', task: '系统设计', status: 'completed', duration: '5m20s' },
  { agentId: 'tester', displayName: '测试专家', model: 'claude-haiku-3-5-20241022', task: '单元测试', status: 'completed', duration: '2m10s' },
  { agentId: 'dbadmin', displayName: 'DBA专家', model: 'deepseek-r1', task: 'DB迁移', status: 'blocked', blocker: 'schema lock 未释放' },
  { agentId: 'pm', displayName: '产品经理', model: 'gpt-4o-2024-08-06', task: '选认证方案', status: 'needs_decision', decision: 'Auth0 vs Cognito', decisionOwner: 'tech-lead' },
];

console.log('═══════════════════════════════════════');
console.log('  场景1: 3 Agent 并行 + 完成 + 风险 + 决策');
console.log('═══════════════════════════════════════\n');
console.log(renderText(scenario1));
console.log('\n--- Feishu Card JSON ---');
console.log(JSON.stringify(renderCard(scenario1), null, 2));

// ── Scenario 2: All completed ──────────────────────────────────

const scenario2 = [
  { agentId: 'a', displayName: '创作大师', model: 'claude-opus-4-20250514', task: '写文档', status: 'completed', duration: '4m' },
  { agentId: 'b', displayName: '研究员', model: 'gpt-4o-2024-08-06', task: '调研', status: 'completed', duration: '3m' },
  { agentId: 'c', displayName: '分析师', model: 'gemini-2.5-pro-preview-06-05', task: '分析', status: 'completed', duration: '5m' },
];

console.log('\n\n═══════════════════════════════════════');
console.log('  场景2: 全部完成');
console.log('═══════════════════════════════════════\n');
console.log(renderText(scenario2));

// ── Scenario 3: 0 active with risks ────────────────────────────

const scenario3 = [
  { agentId: 'a', displayName: '架构师', model: 'claude-sonnet-4-20250514', task: '系统设计', status: 'completed', duration: '5m' },
  { agentId: 'b', displayName: 'DBA专家', model: 'deepseek-r1', task: 'DB迁移', status: 'blocked', blocker: 'schema lock' },
  { agentId: 'c', displayName: '产品经理', model: 'gpt-4o-2024-08-06', task: '选方案', status: 'needs_decision', decision: 'Redis vs Memcached' },
];

console.log('\n\n═══════════════════════════════════════');
console.log('  场景3: 0活跃 + 完成 + 风险 + 决策');
console.log('═══════════════════════════════════════\n');
console.log(renderText(scenario3));

// ── Scenario 4: renderReport unified ────────────────────────────

console.log('\n\n═══════════════════════════════════════');
console.log('  场景4: renderReport 统一入口');
console.log('═══════════════════════════════════════\n');
const result = renderReport(scenario1);
console.log('Title:', result.title);
console.log('Stats:', JSON.stringify(result.stats));
console.log('\nText output:');
console.log(result.text);
