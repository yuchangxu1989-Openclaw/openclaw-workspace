#!/usr/bin/env node
'use strict';

/**
 * gates.js — PDCA 8个门禁函数（纯函数，可单元测试）
 *
 * 每个门禁返回 { passed: boolean, violations: string[] }
 * mode 参数：'warn' = 记录但不阻止（passed仍为true），'block' = 阻止
 * 例外：角色分离检查永远是 block 模式，无视 mode 参数
 */

const fs = require('fs');
const path = require('path');

const WORKSPACE = process.env.OPENCLAW_WORKSPACE || '/root/.openclaw/workspace';

// ============================================================
// 🚨 角色分离映射表（ISC-EVAL-ROLE-SEPARATION-001 代码化）
//    Do执行者 → Check允许的评测者列表
//    硬编码常量。改映射 = 改代码 = 需要Code Review。
//
//    🚨 用户铁令：Check环节角色固定为 analyst（质量分析师）。
//    唯一选项。不是reviewer，不是其他。代码层面硬编码。
// ============================================================
const ROLE_SEPARATION_MAP = {
  'coder':      ['analyst'],
  'writer':     ['analyst'],
  'researcher': ['analyst'],
  'scout':      ['analyst'],
};

// 🚨 铁令：Check阶段evaluator只能是analyst
const CHECK_EVALUATOR_ROLE = 'analyst';

function isRoleSeparationValid(executorAgent, evaluatorAgent) {
  // 铁律：自检永远不合法
  if (executorAgent === evaluatorAgent) return false;

  // 铁令：evaluator必须是analyst，唯一选项
  if (evaluatorAgent !== CHECK_EVALUATOR_ROLE) return false;

  return true;
}

// ─── 辅助：构造返回值 ───
function gateResult(violations, mode) {
  if (mode === 'warn' && violations.length > 0) {
    // warn模式：记录violations但不阻止（passed仍为true）
    return { passed: true, violations, mode: 'warn' };
  }
  return { passed: violations.length === 0, violations };
}

// ============================================================
// Plan 准入门禁 — 任务来源合法性
// ============================================================
function planEntryGate(task, mode = 'warn') {
  const violations = [];
  const validSources = ['user_instruction', 'isc_rule_trigger', 'event_driven', 'cron_scheduled', 'completion_followup'];

  if (!task.source || !validSources.includes(task.source)) {
    violations.push(`任务来源 "${task.source || 'undefined'}" 不合法，允许值: ${validSources.join(', ')}`);
  }

  if (task.source === 'isc_rule_trigger' && !task.trigger_rule_id) {
    violations.push('来源为ISC规则触发但缺少 trigger_rule_id');
  }

  if (task.source === 'event_driven' && !task.trigger_event_id) {
    violations.push('来源为事件驱动但缺少 trigger_event_id');
  }

  return gateResult(violations, mode);
}

// ============================================================
// Plan 准出门禁 — 4要素检查（目标/时限/成本/验收）
// ============================================================
function planExitGate(task, mode = 'warn') {
  const violations = [];

  // G1: 业务目标
  if (!task.business_goal || String(task.business_goal).trim().length < 10) {
    violations.push('业务目标未定义或过于简略（<10字符）');
  }

  // G2: 时效约束
  if (!task.deadline && !task.urgency) {
    violations.push('时效约束未定义（需要 deadline 或 urgency）');
  }

  // G3: 成本边界
  if (!task.priority) {
    violations.push('成本边界未定义（至少需要 priority）');
  }

  // G4: 验收标准
  if (!task.acceptance_criteria || !Array.isArray(task.acceptance_criteria) || task.acceptance_criteria.length === 0) {
    violations.push('验收标准未定义或为空数组');
  }

  // G5: 交付物声明
  if (!task.expected_artifacts || !Array.isArray(task.expected_artifacts) || task.expected_artifacts.length === 0) {
    violations.push('未声明期望交付物');
  }

  return gateResult(violations, mode);
}

// ============================================================
// Do 准入门禁 — plan准出已通过
// ============================================================
function doEntryGate(task, mode = 'warn') {
  const violations = [];

  // G1: Plan阶段必须已通过准出门禁
  if (!task.gates || !task.gates['plan_exit'] || !task.gates['plan_exit'].passed) {
    violations.push('Plan阶段准出门禁未通过，不允许进入Do阶段');
  }

  // G2: 执行者已分配
  if (!task.executor_agent && !task.assignee && !task.agent_id) {
    violations.push('执行者未分配（需要 executor_agent / assignee / agent_id）');
  }

  return gateResult(violations, mode);
}

// ============================================================
// Do 准出门禁 — 交付物存在性
// ============================================================
function doExitGate(task, mode = 'warn') {
  const violations = [];

  // G1: 交付物声明存在
  if (!task.actual_artifacts || !Array.isArray(task.actual_artifacts) || task.actual_artifacts.length === 0) {
    violations.push('无交付物产出（actual_artifacts 为空）');
  } else {
    // G2: 交付物文件实际存在
    for (const artifact of task.actual_artifacts) {
      const fullPath = path.resolve(WORKSPACE, artifact);
      if (!fs.existsSync(fullPath)) {
        violations.push(`交付物文件不存在: ${artifact}`);
      }
    }
  }

  return gateResult(violations, mode);
}

// ============================================================
// Check 准入门禁 — 有交付物
// ============================================================
function checkEntryGate(task, mode = 'warn') {
  const violations = [];

  // G1: 至少有一个交付物可供检查
  if (!task.actual_artifacts || !Array.isArray(task.actual_artifacts) || task.actual_artifacts.length === 0) {
    violations.push('无交付物可供Check评测');
  }

  return gateResult(violations, mode);
}

// ============================================================
// Check 准出门禁 — 评测报告存在 + 角色分离二次验证
// 🚨 角色分离检查永远是 block 模式（无视 mode 参数）
// ============================================================
function checkExitGate(task, mode = 'warn') {
  const violations = [];

  // ============================================================
  // 🚨 G1: 角色分离 — 铁律·双保险（第二道防线）
  //    第一道防线在 state-machine.js 的 do→check 转换中。
  //    这里是二次防御。角色分离永远 block，无例外。
  // ============================================================
  if (!task.evaluator_agent) {
    violations.push('ROLE_SEPARATION: 未分配独立评测者(evaluator_agent)。Check阶段必须有与Do执行者不同的Agent。');
  } else if (task.evaluator_agent === task.executor_agent) {
    violations.push(`ROLE_SEPARATION: 自检禁止！evaluator(${task.evaluator_agent}) === executor(${task.executor_agent})。违反 ISC-EVAL-ROLE-SEPARATION-001。`);
  } else if (!isRoleSeparationValid(task.executor_agent, task.evaluator_agent)) {
    violations.push(`ROLE_SEPARATION: 角色映射不合法。executor=${task.executor_agent} 的合法评测者为 ${(ROLE_SEPARATION_MAP[task.executor_agent] || ['任何不同AgentId']).join('/')}, 实际=${task.evaluator_agent}`);
  }

  // 角色分离violation是硬拦截，立即返回block
  const roleSepViolations = violations.filter(v => v.startsWith('ROLE_SEPARATION:'));
  if (roleSepViolations.length > 0) {
    return { passed: false, violations };
  }

  // G2: 评测报告已生成
  if (!task.eval_report_path) {
    violations.push('评测报告未生成（缺少 eval_report_path）');
  }

  // G3: 评测结论明确
  const validVerdicts = ['pass', 'fail', 'conditional_pass'];
  if (!task.eval_verdict || !validVerdicts.includes(task.eval_verdict)) {
    violations.push(`评测结论不明确，需要: ${validVerdicts.join('/')}, 实际: ${task.eval_verdict || 'undefined'}`);
  }

  return gateResult(violations, mode);
}

// ============================================================
// Act 准入门禁 — check发现了问题
// ============================================================
function actEntryGate(task, mode = 'warn') {
  const violations = [];

  // G1: 评测结论不是pass（有问题才进Act）
  if (task.eval_verdict === 'pass') {
    violations.push('Check阶段评测通过(pass)，无需进入Act阶段（应直接归档完成）');
  }

  // G2: 问题清单存在
  if (!task.issues || !Array.isArray(task.issues) || task.issues.length === 0) {
    violations.push('评测发现问题但未输出问题清单(issues)');
  }

  return gateResult(violations, mode);
}

// ============================================================
// Act 准出门禁 — 改进措施已落到代码/ISC规则
// ============================================================
function actExitGate(task, mode = 'warn') {
  const violations = [];

  // G1: 改进措施已定义
  if (!task.improvements || !Array.isArray(task.improvements) || task.improvements.length === 0) {
    violations.push('未定义改进措施(improvements)');
    return gateResult(violations, mode);
  }

  // G2: 每个改进措施必须有落地形态
  for (const imp of task.improvements) {
    const hasRuleChange = imp.isc_rule_id || imp.new_rule_id;
    const hasCodeChange = imp.code_change_path || imp.script_path;
    const hasProcessChange = imp.process_change_doc;

    if (!hasRuleChange && !hasCodeChange && !hasProcessChange) {
      violations.push(`改进措施 "${imp.description || imp.id || 'unknown'}" 无落地形态（需要 isc_rule/code_change/process_change 至少一项）`);
    }
  }

  // G3: 重复失败（>=2次）必须代码化
  if ((task.failure_count || 0) >= 2) {
    const allCodeified = task.improvements.every(imp => imp.code_change_path || imp.script_path);
    if (!allCodeified) {
      violations.push('重复失败（≥2次）的改进措施必须全部代码化（ISC-FAILURE-PATTERN-CODE-ESCALATION-001）');
    }
  }

  // G4: 改进措施已验证
  const unverified = task.improvements.filter(imp => imp.verified !== true);
  if (unverified.length > 0) {
    violations.push(`${unverified.length}项改进措施未经验证(verified !== true)`);
  }

  return gateResult(violations, mode);
}

// ─── 通用门禁调度 ───
const GATE_MAP = {
  plan_entry: planEntryGate,
  plan_exit: planExitGate,
  do_entry: doEntryGate,
  do_exit: doExitGate,
  check_entry: checkEntryGate,
  check_exit: checkExitGate,
  act_entry: actEntryGate,
  act_exit: actExitGate,
};

function runGate(gateName, task, mode = 'warn') {
  const fn = GATE_MAP[gateName];
  if (!fn) throw new Error(`Unknown gate: ${gateName}`);
  return fn(task, mode);
}

module.exports = {
  ROLE_SEPARATION_MAP,
  CHECK_EVALUATOR_ROLE,
  isRoleSeparationValid,
  planEntryGate,
  planExitGate,
  doEntryGate,
  doExitGate,
  checkEntryGate,
  checkExitGate,
  actEntryGate,
  actExitGate,
  runGate,
  GATE_MAP,
};
