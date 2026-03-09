#!/usr/bin/env node
'use strict';

/**
 * test-state-machine.js — 状态转换测试
 * - 正常流 init→plan→do→check→done
 * - 角色分离拦截 do→check
 * - 非法转换
 */

const fs = require('fs');
const path = require('path');
const { transition, getTaskState, STATE_FILE } = require('../state-machine');
const { EVENTS_FILE } = require('../event-emitter');

const WORKSPACE = process.env.OPENCLAW_WORKSPACE || '/root/.openclaw/workspace';

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; console.log(`  ✅ ${msg}`); }
  else { failed++; console.error(`  ❌ FAIL: ${msg}`); }
}

function cleanState() {
  try { fs.unlinkSync(STATE_FILE); } catch {}
}

// 备份events.jsonl，测试后恢复
const eventsBackup = fs.existsSync(EVENTS_FILE) ? fs.readFileSync(EVENTS_FILE, 'utf8') : '';

console.log('=== test-state-machine.js ===\n');

// ─── 正常流：init→plan ───
console.log('正常流 init→plan:');
cleanState();
{
  const task = { source: 'user_instruction' };
  const r = transition('test-task-1', 'init', 'plan', task);
  assert(r.allowed === true, 'init→plan 允许');

  const state = getTaskState('test-task-1');
  assert(state !== null, '状态已持久化');
  assert(state.phase === 'plan', '状态为 plan');
}

// ─── 正常流：plan→do ───
console.log('\n正常流 plan→do:');
{
  // 创建临时文件用于artifact测试
  const artifactPath = path.join(WORKSPACE, 'logs', '_test_sm_artifact.tmp');
  fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
  fs.writeFileSync(artifactPath, 'x'.repeat(300), 'utf8');

  const task = {
    business_goal: '重写PDCA引擎实现真正的状态机管理流程',
    deadline: '2026-03-10',
    priority: 'P0',
    acceptance_criteria: ['测试通过'],
    expected_artifacts: ['logs/_test_sm_artifact.tmp'],
    gates: { plan_exit: { passed: true } },
    executor_agent: 'coder',
  };
  const r = transition('test-task-1', 'plan', 'do', task);
  assert(r.allowed === true, 'plan→do 允许');

  fs.unlinkSync(artifactPath);
}

// ─── 角色分离拦截：do→check 同agent ───
console.log('\n角色分离拦截 do→check (同agent):');
{
  const task = {
    actual_artifacts: ['some/file.js'],
    executor_agent: 'coder',
    evaluator_agent: 'coder',  // 自检！
  };
  const r = transition('test-task-2', 'do', 'check', task);
  assert(r.allowed === false, 'do→check 自检被拦截');
  assert(r.badcase === true, 'badcase=true');
  assert(r.violation === 'ISC-EVAL-ROLE-SEPARATION-001', '违规规则正确');
}

// ─── 角色分离拦截：do→check 无evaluator ───
console.log('\n角色分离拦截 do→check (无evaluator):');
{
  const task = {
    actual_artifacts: ['some/file.js'],
    executor_agent: 'coder',
    // evaluator_agent 缺失
  };
  const r = transition('test-task-3', 'do', 'check', task);
  assert(r.allowed === false, 'do→check 无evaluator被拦截');
  assert(r.violation === 'ISC-EVAL-ROLE-SEPARATION-001', '违规规则正确');
}

// ─── 角色分离拦截：do→check 非法映射 ───
console.log('\n角色分离拦截 do→check (非法映射):');
{
  const task = {
    actual_artifacts: ['some/file.js'],
    executor_agent: 'coder',
    evaluator_agent: 'writer',  // writer不在coder的合法评测者列表中
  };
  const r = transition('test-task-4', 'do', 'check', task);
  assert(r.allowed === false, 'do→check 非法映射被拦截');
  assert(r.badcase === true, 'badcase=true');
}

// ─── 正常流：do→check (合法角色) ───
console.log('\n正常流 do→check (合法角色):');
{
  // 创建临时交付物文件
  const artifactPath = path.join(WORKSPACE, 'logs', '_test_sm_do_check.tmp');
  fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
  fs.writeFileSync(artifactPath, 'x'.repeat(300), 'utf8');

  const task = {
    actual_artifacts: ['logs/_test_sm_do_check.tmp'],
    executor_agent: 'coder',
    evaluator_agent: 'reviewer',  // 合法
  };
  const r = transition('test-task-5', 'do', 'check', task);
  assert(r.allowed === true, 'do→check coder→reviewer 允许');

  fs.unlinkSync(artifactPath);
}

// ─── 非法转换：init→do ───
console.log('\n非法转换 init→do:');
{
  const task = {};
  const r = transition('test-task-6', 'init', 'do', task);
  assert(r.allowed === false, 'init→do 被拒绝');
  assert(r.reason.includes('非法状态转换'), '原因含"非法状态转换"');
}

// ─── 非法转换：plan→check ───
console.log('\n非法转换 plan→check:');
{
  const task = {};
  const r = transition('test-task-7', 'plan', 'check', task);
  assert(r.allowed === false, 'plan→check 被拒绝');
}

// ─── 非法转换：done→plan ───
console.log('\n非法转换 done→plan:');
{
  const task = {};
  const r = transition('test-task-8', 'done', 'plan', task);
  assert(r.allowed === false, 'done→plan 被拒绝');
}

// ─── 检查事件写入 ───
console.log('\n事件总线写入:');
{
  const events = fs.readFileSync(EVENTS_FILE, 'utf8').trim().split('\n');
  const pdcaEvents = events.filter(line => {
    try { const e = JSON.parse(line); return e.source === 'pdca-engine'; } catch { return false; }
  });
  assert(pdcaEvents.length > 0, `事件总线有 ${pdcaEvents.length} 条PDCA事件`);

  // 检查角色分离badcase事件
  const badcaseEvents = pdcaEvents.filter(line => {
    const e = JSON.parse(line);
    return e.type === 'pdca.badcase.role_separation_violation';
  });
  assert(badcaseEvents.length > 0, `角色分离违规事件有 ${badcaseEvents.length} 条`);
}

// 清理测试状态
cleanState();

// 恢复events.jsonl（不要留太多测试事件）
// 注意：不恢复，让测试事件留在那里作为验证

console.log(`\n=== 结果: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
