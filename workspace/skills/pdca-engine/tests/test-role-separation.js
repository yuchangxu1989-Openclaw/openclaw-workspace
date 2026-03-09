#!/usr/bin/env node
'use strict';

/**
 * test-role-separation.js — 角色分离专项测试
 *
 * - 同agent拦截
 * - 不同agent通过
 * - 未指定拦截
 * - ROLE_SEPARATION_MAP 映射测试
 * - badcase记录验证
 */

const fs = require('fs');
const path = require('path');
const gates = require('../gates');
const { transition, STATE_FILE } = require('../state-machine');
const { EVENTS_FILE } = require('../event-emitter');

const WORKSPACE = process.env.OPENCLAW_WORKSPACE || '/root/.openclaw/workspace';
const BADCASES_DIR = path.join(WORKSPACE, 'memory', 'badcases');

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

// ─── 1. isRoleSeparationValid 函数测试 ───
console.log('isRoleSeparationValid:');
{
  assert(gates.isRoleSeparationValid('coder', 'reviewer') === true, 'coder→reviewer: 合法');
  assert(gates.isRoleSeparationValid('coder', 'analyst') === true, 'coder→analyst: 合法');
  assert(gates.isRoleSeparationValid('coder', 'coder') === false, 'coder→coder: 自检非法');
  assert(gates.isRoleSeparationValid('coder', 'writer') === false, 'coder→writer: 不在映射表');
  assert(gates.isRoleSeparationValid('coder', 'scout') === false, 'coder→scout: 不在映射表');

  assert(gates.isRoleSeparationValid('writer', 'reviewer') === true, 'writer→reviewer: 合法');
  assert(gates.isRoleSeparationValid('writer', 'analyst') === true, 'writer→analyst: 合法');
  assert(gates.isRoleSeparationValid('writer', 'writer') === false, 'writer→writer: 自检非法');

  assert(gates.isRoleSeparationValid('researcher', 'analyst') === true, 'researcher→analyst: 合法');
  assert(gates.isRoleSeparationValid('researcher', 'reviewer') === true, 'researcher→reviewer: 合法');
  assert(gates.isRoleSeparationValid('researcher', 'researcher') === false, 'researcher→researcher: 自检非法');

  assert(gates.isRoleSeparationValid('scout', 'analyst') === true, 'scout→analyst: 合法');
  assert(gates.isRoleSeparationValid('scout', 'reviewer') === true, 'scout→reviewer: 合法');
  assert(gates.isRoleSeparationValid('scout', 'scout') === false, 'scout→scout: 自检非法');

  // 未知角色：只要不同就行
  assert(gates.isRoleSeparationValid('custom_role', 'reviewer') === true, 'unknown→reviewer: 只要不同就行');
  assert(gates.isRoleSeparationValid('custom_role', 'custom_role') === false, 'unknown→unknown: 自检非法');
}

// ─── 2. ROLE_SEPARATION_MAP 常量验证 ───
console.log('\nROLE_SEPARATION_MAP:');
{
  assert(Array.isArray(gates.ROLE_SEPARATION_MAP['coder']), 'coder映射存在');
  assert(gates.ROLE_SEPARATION_MAP['coder'].includes('reviewer'), 'coder可由reviewer评测');
  assert(gates.ROLE_SEPARATION_MAP['coder'].includes('analyst'), 'coder可由analyst评测');
  assert(!gates.ROLE_SEPARATION_MAP['coder'].includes('writer'), 'coder不可由writer评测');
}

// ─── 3. 状态机层面同agent拦截 ───
console.log('\n状态机硬拦截 - 同agent:');
cleanState();
{
  const task = {
    actual_artifacts: ['file.js'],
    executor_agent: 'coder',
    evaluator_agent: 'coder',
  };
  const r = transition('role-sep-test-1', 'do', 'check', task);
  assert(r.allowed === false, '同agent: 拦截');
  assert(r.badcase === true, '同agent: badcase=true');
  assert(r.violation === 'ISC-EVAL-ROLE-SEPARATION-001', '同agent: 违规规则');
  assert(r.gateResults.length === 0, '同agent: 不进gate函数（硬拦截在gate之前）');
}

// ─── 4. 状态机层面不同agent通过 ───
console.log('\n状态机 - 不同agent通过:');
{
  // 创建临时交付物
  const artifactPath = path.join(WORKSPACE, 'logs', '_test_rs_artifact.tmp');
  fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
  fs.writeFileSync(artifactPath, 'x'.repeat(300), 'utf8');

  const task = {
    actual_artifacts: ['logs/_test_rs_artifact.tmp'],
    executor_agent: 'coder',
    evaluator_agent: 'analyst',
  };
  const r = transition('role-sep-test-2', 'do', 'check', task);
  assert(r.allowed === true, 'coder→analyst: 通过');

  fs.unlinkSync(artifactPath);
}

// ─── 5. 状态机层面未指定evaluator拦截 ───
console.log('\n状态机硬拦截 - 未指定evaluator:');
{
  const task = {
    actual_artifacts: ['file.js'],
    executor_agent: 'coder',
    // evaluator_agent 未指定
  };
  const r = transition('role-sep-test-3', 'do', 'check', task);
  assert(r.allowed === false, '未指定evaluator: 拦截');
  assert(r.violation === 'ISC-EVAL-ROLE-SEPARATION-001', '未指定evaluator: 违规规则');
  assert(r.gateResults.length === 0, '未指定evaluator: 不进gate函数');
}

// ─── 6. 状态机层面非法映射拦截 ───
console.log('\n状态机硬拦截 - 非法映射:');
{
  const task = {
    actual_artifacts: ['file.js'],
    executor_agent: 'coder',
    evaluator_agent: 'writer',  // 不在coder的合法评测者列表
  };
  const r = transition('role-sep-test-4', 'do', 'check', task);
  assert(r.allowed === false, 'coder→writer: 拦截');
  assert(r.badcase === true, 'coder→writer: badcase=true');
}

// ─── 7. checkExitGate 二次防御 ───
console.log('\ncheckExitGate 角色分离二次防御:');
{
  // 自检
  const r1 = gates.checkExitGate({
    executor_agent: 'coder',
    evaluator_agent: 'coder',
    eval_report_path: 'reports/eval.md',
    eval_verdict: 'pass',
  }, 'block');
  assert(r1.passed === false, 'checkExitGate 自检: block');
  assert(r1.violations.some(v => v.includes('ROLE_SEPARATION')), 'checkExitGate 自检: ROLE_SEPARATION violation');

  // 未指定
  const r2 = gates.checkExitGate({
    executor_agent: 'coder',
    eval_report_path: 'reports/eval.md',
    eval_verdict: 'pass',
  }, 'block');
  assert(r2.passed === false, 'checkExitGate 无evaluator: block');

  // 合法
  const r3 = gates.checkExitGate({
    executor_agent: 'coder',
    evaluator_agent: 'reviewer',
    eval_report_path: 'reports/eval.md',
    eval_verdict: 'pass',
  }, 'block');
  assert(!r3.violations.some(v => v.startsWith('ROLE_SEPARATION:')), 'checkExitGate coder→reviewer: 角色分离通过');
}

// ─── 8. 角色分离永远是block模式（无视warn参数） ───
console.log('\n角色分离永远block（无视mode参数）:');
{
  const r = gates.checkExitGate({
    executor_agent: 'coder',
    evaluator_agent: 'coder',
    eval_report_path: 'reports/eval.md',
    eval_verdict: 'pass',
  }, 'warn');  // 即使传warn，角色分离也应该block
  assert(r.passed === false, '角色分离在warn模式下仍然block');
}

// ─── 9. 事件验证 ───
console.log('\n角色分离违规事件写入:');
{
  const events = fs.readFileSync(EVENTS_FILE, 'utf8').trim().split('\n');
  const badcaseEvents = events.filter(line => {
    try {
      const e = JSON.parse(line);
      return e.type === 'pdca.badcase.role_separation_violation';
    } catch { return false; }
  });
  assert(badcaseEvents.length > 0, `events.jsonl 有 ${badcaseEvents.length} 条角色分离违规事件`);
}

// ─── 10. 多角色映射矩阵 ───
console.log('\n完整映射矩阵:');
{
  const testCases = [
    ['coder', 'reviewer', true],
    ['coder', 'analyst', true],
    ['writer', 'reviewer', true],
    ['writer', 'analyst', true],
    ['researcher', 'analyst', true],
    ['researcher', 'reviewer', true],
    ['scout', 'analyst', true],
    ['scout', 'reviewer', true],
    // 非法
    ['coder', 'coder', false],
    ['coder', 'writer', false],
    ['coder', 'scout', false],
    ['writer', 'writer', false],
    ['writer', 'coder', false],
    ['researcher', 'researcher', false],
    ['scout', 'scout', false],
  ];

  for (const [exec, eval_, expected] of testCases) {
    const result = gates.isRoleSeparationValid(exec, eval_);
    assert(result === expected, `${exec}→${eval_}: ${expected ? '合法' : '非法'}`);
  }
}

cleanState();

console.log(`\n=== 结果: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
