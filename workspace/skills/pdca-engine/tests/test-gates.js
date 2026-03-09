#!/usr/bin/env node
'use strict';

/**
 * test-gates.js — 8个门禁各2个测试（通过+拦截）
 */

const gates = require('../gates');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; console.log(`  ✅ ${msg}`); }
  else { failed++; console.error(`  ❌ FAIL: ${msg}`); }
}

console.log('=== test-gates.js ===\n');

// ─── planEntryGate ───
console.log('planEntryGate:');
{
  const r = gates.planEntryGate({ source: 'user_instruction' }, 'block');
  assert(r.passed === true, 'PASS: 合法来源 user_instruction');
}
{
  const r = gates.planEntryGate({ source: 'hacker_injection' }, 'block');
  assert(r.passed === false, 'BLOCK: 非法来源 hacker_injection');
  assert(r.violations.length > 0, 'BLOCK: 有violation信息');
}

// ─── planExitGate ───
console.log('\nplanExitGate:');
{
  const r = gates.planExitGate({
    business_goal: '重写PDCA引擎实现状态机管理',
    deadline: '2026-03-10',
    priority: 'P0',
    acceptance_criteria: ['所有测试通过'],
    expected_artifacts: ['skills/pdca-engine/state-machine.js'],
  }, 'block');
  assert(r.passed === true, 'PASS: 四要素完整');
}
{
  const r = gates.planExitGate({}, 'block');
  assert(r.passed === false, 'BLOCK: 四要素全缺');
  assert(r.violations.length >= 4, `BLOCK: 至少4个violation (got ${r.violations.length})`);
}

// ─── doEntryGate ───
console.log('\ndoEntryGate:');
{
  const r = gates.doEntryGate({
    gates: { plan_exit: { passed: true } },
    executor_agent: 'coder',
  }, 'block');
  assert(r.passed === true, 'PASS: plan准出已通过 + 执行者已分配');
}
{
  const r = gates.doEntryGate({}, 'block');
  assert(r.passed === false, 'BLOCK: plan准出未通过 + 无执行者');
  assert(r.violations.length >= 2, `BLOCK: 至少2个violation (got ${r.violations.length})`);
}

// ─── doExitGate ───
console.log('\ndoExitGate:');
{
  // 创建临时文件用于测试
  const fs = require('fs');
  const path = require('path');
  const WORKSPACE = process.env.OPENCLAW_WORKSPACE || '/root/.openclaw/workspace';
  const testFile = path.join(WORKSPACE, 'logs', '_test_artifact_doExitGate.tmp');
  fs.mkdirSync(path.dirname(testFile), { recursive: true });
  fs.writeFileSync(testFile, 'x'.repeat(300), 'utf8');

  const r = gates.doExitGate({
    actual_artifacts: ['logs/_test_artifact_doExitGate.tmp'],
  }, 'block');
  assert(r.passed === true, 'PASS: 交付物存在');

  fs.unlinkSync(testFile);
}
{
  const r = gates.doExitGate({}, 'block');
  assert(r.passed === false, 'BLOCK: 无交付物');
}

// ─── checkEntryGate ───
console.log('\ncheckEntryGate:');
{
  const r = gates.checkEntryGate({
    actual_artifacts: ['some/file.js'],
  }, 'block');
  assert(r.passed === true, 'PASS: 有交付物');
}
{
  const r = gates.checkEntryGate({}, 'block');
  assert(r.passed === false, 'BLOCK: 无交付物');
}

// ─── checkExitGate ───
console.log('\ncheckExitGate:');
{
  const r = gates.checkExitGate({
    executor_agent: 'coder',
    evaluator_agent: 'reviewer',
    eval_report_path: 'reports/eval.md',
    eval_verdict: 'pass',
  }, 'block');
  // 注意：eval_report_path的文件不一定存在，但角色分离是通过的
  // checkExitGate检查文件存在性时会fail，但角色分离本身是通过的
  // 这里我们只验证角色分离不会block
  assert(r.violations.every(v => !v.startsWith('ROLE_SEPARATION:')), 'PASS: 角色分离验证通过');
}
{
  const r = gates.checkExitGate({
    executor_agent: 'coder',
    evaluator_agent: 'coder',  // 自检！
    eval_report_path: 'reports/eval.md',
    eval_verdict: 'pass',
  }, 'block');
  assert(r.passed === false, 'BLOCK: 自检违反角色分离');
  assert(r.violations.some(v => v.includes('ROLE_SEPARATION')), 'BLOCK: 角色分离violation');
}

// ─── actEntryGate ───
console.log('\nactEntryGate:');
{
  const r = gates.actEntryGate({
    eval_verdict: 'fail',
    issues: [{ id: 'issue-1', description: '有问题' }],
  }, 'block');
  assert(r.passed === true, 'PASS: Check发现问题 + 有问题清单');
}
{
  const r = gates.actEntryGate({
    eval_verdict: 'pass',
  }, 'block');
  assert(r.passed === false, 'BLOCK: Check通过不需要Act');
}

// ─── actExitGate ───
console.log('\nactExitGate:');
{
  const r = gates.actExitGate({
    improvements: [{
      id: 'imp-1', description: '增加门禁检查',
      code_change_path: 'skills/pdca-engine/gates.js',
      verified: true,
    }],
    failure_count: 0,
  }, 'block');
  assert(r.passed === true, 'PASS: 改进已落地+验证');
}
{
  const r = gates.actExitGate({}, 'block');
  assert(r.passed === false, 'BLOCK: 无改进措施');
}

// ─── 汇总 ───
console.log(`\n=== 结果: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
