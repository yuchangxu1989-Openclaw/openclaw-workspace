#!/usr/bin/env node
'use strict';

/**
 * test-role-separation.js — 角色分离专项测试
 *
 * 铁令：Check阶段evaluator只能是analyst（质量分析师），唯一选项
 */

const fs = require('fs');
const path = require('path');
const gates = require('../gates');
const { transition, STATE_FILE } = require('../state-machine');
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

console.log('=== test-role-separation.js ===\n');

// ─── 1. CHECK_EVALUATOR_ROLE 常量 ───
console.log('CHECK_EVALUATOR_ROLE:');
{
  assert(gates.CHECK_EVALUATOR_ROLE === 'analyst', 'CHECK_EVALUATOR_ROLE === analyst');
}

// ─── 2. isRoleSeparationValid — analyst唯一合法 ───
console.log('\nisRoleSeparationValid（铁令：只有analyst合法）:');
{
  // analyst合法
  assert(gates.isRoleSeparationValid('coder', 'analyst') === true, 'coder→analyst: 合法');
  assert(gates.isRoleSeparationValid('writer', 'analyst') === true, 'writer→analyst: 合法');
  assert(gates.isRoleSeparationValid('researcher', 'analyst') === true, 'researcher→analyst: 合法');
  assert(gates.isRoleSeparationValid('scout', 'analyst') === true, 'scout→analyst: 合法');
  assert(gates.isRoleSeparationValid('custom_role', 'analyst') === true, 'unknown→analyst: 合法');

  // reviewer不再合法（铁令）
  assert(gates.isRoleSeparationValid('coder', 'reviewer') === false, 'coder→reviewer: 不合法（铁令）');
  assert(gates.isRoleSeparationValid('writer', 'reviewer') === false, 'writer→reviewer: 不合法（铁令）');
  assert(gates.isRoleSeparationValid('researcher', 'reviewer') === false, 'researcher→reviewer: 不合法（铁令）');

  // 自检永远非法
  assert(gates.isRoleSeparationValid('coder', 'coder') === false, 'coder→coder: 自检非法');
  assert(gates.isRoleSeparationValid('analyst', 'analyst') === false, 'analyst→analyst: 自检非法');
  assert(gates.isRoleSeparationValid('writer', 'writer') === false, 'writer→writer: 自检非法');

  // 其他非analyst角色不合法
  assert(gates.isRoleSeparationValid('coder', 'writer') === false, 'coder→writer: 不合法');
  assert(gates.isRoleSeparationValid('coder', 'scout') === false, 'coder→scout: 不合法');
  assert(gates.isRoleSeparationValid('coder', 'coder') === false, 'coder→coder: 不合法');
}

// ─── 3. ROLE_SEPARATION_MAP 铁令验证 ───
console.log('\nROLE_SEPARATION_MAP（铁令：全部只有analyst）:');
{
  for (const role of ['coder', 'writer', 'researcher', 'scout']) {
    const allowed = gates.ROLE_SEPARATION_MAP[role];
    assert(Array.isArray(allowed), `${role}映射存在`);
    assert(allowed.length === 1, `${role}映射只有1个选项`);
    assert(allowed[0] === 'analyst', `${role}映射 === ['analyst']`);
  }
}

// ─── 4. 状态机：同agent拦截 ───
console.log('\n状态机硬拦截 - 同agent:');
cleanState();
{
  const task = {
    actual_artifacts: ['file.js'],
    executor_agent: 'coder',
    evaluator_agent: 'coder',
  };
  const r = transition('rs-test-1', 'do', 'check', task);
  assert(r.allowed === false, '同agent: 拦截');
  assert(r.badcase === true, '同agent: badcase=true');
  assert(r.violation === 'ISC-EVAL-ROLE-SEPARATION-001', '同agent: 违规规则');
  assert(r.gateResults.length === 0, '同agent: 不进gate函数（硬拦截在gate之前）');
}

// ─── 5. 状态机：analyst通过 ───
console.log('\n状态机 - analyst通过:');
{
  const artifactPath = path.join(WORKSPACE, 'logs', '_test_rs_artifact.tmp');
  fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
  fs.writeFileSync(artifactPath, 'x'.repeat(300), 'utf8');

  const task = {
    actual_artifacts: ['logs/_test_rs_artifact.tmp'],
    executor_agent: 'coder',
    evaluator_agent: 'analyst',
  };
  const r = transition('rs-test-2', 'do', 'check', task);
  assert(r.allowed === true, 'coder→analyst: 通过');

  fs.unlinkSync(artifactPath);
}

// ─── 6. 状态机：reviewer被拦截（铁令） ───
console.log('\n状态机硬拦截 - reviewer（铁令：只有analyst）:');
{
  const task = {
    actual_artifacts: ['file.js'],
    executor_agent: 'coder',
    evaluator_agent: 'reviewer',
  };
  const r = transition('rs-test-3', 'do', 'check', task);
  assert(r.allowed === false, 'coder→reviewer: 拦截');
  assert(r.badcase === true, 'reviewer: badcase=true');
  assert(r.reason.includes('analyst'), 'reason提到analyst');
}

// ─── 7. 状态机：未指定evaluator ───
console.log('\n状态机硬拦截 - 未指定evaluator:');
{
  const task = {
    actual_artifacts: ['file.js'],
    executor_agent: 'coder',
  };
  const r = transition('rs-test-4', 'do', 'check', task);
  assert(r.allowed === false, '未指定evaluator: 拦截');
  assert(r.violation === 'ISC-EVAL-ROLE-SEPARATION-001', '违规规则');
  assert(r.gateResults.length === 0, '不进gate函数');
}

// ─── 8. 状态机：writer/scout等都被拦截 ───
console.log('\n状态机硬拦截 - 非analyst角色:');
{
  for (const badEval of ['writer', 'scout', 'researcher', 'manager']) {
    const task = {
      actual_artifacts: ['file.js'],
      executor_agent: 'coder',
      evaluator_agent: badEval,
    };
    const r = transition(`rs-test-bad-${badEval}`, 'do', 'check', task);
    assert(r.allowed === false, `coder→${badEval}: 拦截`);
    assert(r.badcase === true, `coder→${badEval}: badcase=true`);
  }
}

// ─── 9. checkExitGate 二次防御 ───
console.log('\ncheckExitGate 二次防御:');
{
  // 自检 → block
  const r1 = gates.checkExitGate({
    executor_agent: 'coder', evaluator_agent: 'coder',
    eval_report_path: 'r.md', eval_verdict: 'pass',
  }, 'block');
  assert(r1.passed === false, 'checkExitGate 自检: block');

  // reviewer → block（铁令）
  const r2 = gates.checkExitGate({
    executor_agent: 'coder', evaluator_agent: 'reviewer',
    eval_report_path: 'r.md', eval_verdict: 'pass',
  }, 'block');
  assert(r2.passed === false, 'checkExitGate reviewer: block');

  // analyst → 角色分离通过
  const r3 = gates.checkExitGate({
    executor_agent: 'coder', evaluator_agent: 'analyst',
    eval_report_path: 'r.md', eval_verdict: 'pass',
  }, 'block');
  assert(!r3.violations.some(v => v.startsWith('ROLE_SEPARATION:')), 'checkExitGate analyst: 角色分离通过');

  // 无evaluator → block
  const r4 = gates.checkExitGate({
    executor_agent: 'coder',
    eval_report_path: 'r.md', eval_verdict: 'pass',
  }, 'block');
  assert(r4.passed === false, 'checkExitGate 无evaluator: block');
}

// ─── 10. 角色分离永远block（无视warn） ───
console.log('\n角色分离永远block:');
{
  const r = gates.checkExitGate({
    executor_agent: 'coder', evaluator_agent: 'coder',
    eval_report_path: 'r.md', eval_verdict: 'pass',
  }, 'warn');
  assert(r.passed === false, '自检在warn模式下仍然block');
}

// ─── 11. 事件验证 ───
console.log('\n事件验证:');
{
  const events = fs.readFileSync(EVENTS_FILE, 'utf8').trim().split('\n');
  const badcaseEvents = events.filter(line => {
    try { const e = JSON.parse(line); return e.type === 'pdca.badcase.role_separation_violation'; }
    catch { return false; }
  });
  assert(badcaseEvents.length > 0, `events.jsonl 有 ${badcaseEvents.length} 条角色分离违规事件`);
}

// ─── 12. 完整映射矩阵 ───
console.log('\n完整映射矩阵:');
{
  const testCases = [
    // [executor, evaluator, expected]
    ['coder', 'analyst', true],
    ['writer', 'analyst', true],
    ['researcher', 'analyst', true],
    ['scout', 'analyst', true],
    ['custom', 'analyst', true],
    // 全部非analyst → false
    ['coder', 'coder', false],
    ['coder', 'reviewer', false],
    ['coder', 'writer', false],
    ['coder', 'scout', false],
    ['writer', 'writer', false],
    ['writer', 'reviewer', false],
    ['writer', 'coder', false],
    ['researcher', 'researcher', false],
    ['researcher', 'reviewer', false],
    ['scout', 'scout', false],
    ['analyst', 'analyst', false],  // 自检也不行
  ];

  for (const [exec, eval_, expected] of testCases) {
    const result = gates.isRoleSeparationValid(exec, eval_);
    assert(result === expected, `${exec}→${eval_}: ${expected ? '合法' : '非法'}`);
  }
}

cleanState();

console.log(`\n=== 结果: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
