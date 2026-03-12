#!/usr/bin/env node
'use strict';

/**
 * state-machine.js — PDCA状态机
 *
 * 管理任务生命周期：init→plan→do→check→act→done
 *
 * - transition(taskId, from, to) — 尝试状态转换
 * - 转换前自动运行准出门禁（from阶段）+ 准入门禁（to阶段）
 * - do→check 转换时硬拦截角色分离（ISC-EVAL-ROLE-SEPARATION-001）
 * - 状态转换成功后发射 pdca.* 事件到事件总线
 * - 状态持久化到 logs/pdca-state.json
 */

const fs = require('fs');
const path = require('path');
const gates = require('./gates');
const { emit, PDCA_EVENTS } = require('./event-emitter');

const WORKSPACE = process.env.OPENCLAW_WORKSPACE || '/root/.openclaw/workspace';
const STATE_FILE = path.join(WORKSPACE, 'logs', 'pdca-state.json');

// ─── 合法的状态转换 ───
const VALID_TRANSITIONS = {
  'init':  ['plan'],
  'plan':  ['do'],
  'do':    ['check'],
  'check': ['act', 'done'],
  'act':   ['plan', 'done'],
  'done':  [],
};

// ─── 每个转换需要运行的门禁 ───
const TRANSITION_GATES = {
  'init→plan':  { exit: null,         entry: 'plan_entry' },
  'plan→do':    { exit: 'plan_exit',  entry: 'do_entry' },
  'do→check':   { exit: 'do_exit',    entry: 'check_entry' },
  'check→act':  { exit: 'check_exit', entry: 'act_entry' },
  'check→done': { exit: 'check_exit', entry: null },
  'act→plan':   { exit: 'act_exit',   entry: 'plan_entry' },
  'act→done':   { exit: 'act_exit',   entry: null },
};

// ─── 状态持久化 ───
function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

function getTaskState(taskId) {
  const state = loadState();
  return state[taskId] || null;
}

/**
 * 尝试状态转换
 * @param {string} taskId - 任务ID
 * @param {string} from   - 当前阶段
 * @param {string} to     - 目标阶段
 * @param {object} task   - 完整任务对象（包含门禁所需字段）
 * @returns {{ allowed: boolean, reason?: string, violation?: string, badcase?: boolean, gateResults: object[] }}
 */
function transition(taskId, from, to, task) {
  const key = `${from}→${to}`;

  // 1. 检查转换合法性
  const validTargets = VALID_TRANSITIONS[from];
  if (!validTargets || !validTargets.includes(to)) {
    return {
      allowed: false,
      reason: `非法状态转换: ${key}。从 ${from} 允许转到: ${(validTargets || []).join(', ') || '无'}`,
      gateResults: [],
    };
  }

  // ============================================================
  // 🚨 铁律：ISC-EVAL-ROLE-SEPARATION-001 硬拦截
  //    在所有gate函数之前执行。状态机层面的第一道防线。
  //    自检=Badcase，不是warn，不是可配置选项。无例外。
  //
  //    🚨 用户铁令：Check阶段evaluator_agent只能是analyst。
  //    唯一选项。代码层面硬编码。
  // ============================================================
  if (from === 'do' && to === 'check') {
    if (!task.evaluator_agent) {
      const result = {
        allowed: false,
        reason: 'BLOCK: Check阶段未分配评测者(evaluator_agent)。必须指定analyst作为评测者。',
        violation: 'ISC-EVAL-ROLE-SEPARATION-001',
        gateResults: [],
      };
      emit(PDCA_EVENTS.BADCASE_ROLE_SEPARATION, {
        task_id: taskId, executor: task.executor_agent, evaluator: null,
        reason: result.reason,
      });
      return result;
    }
    if (task.evaluator_agent === task.executor_agent) {
      const result = {
        allowed: false,
        reason: `BADCASE: 自检禁止。executor=${task.executor_agent}, evaluator=${task.evaluator_agent}。ISC-EVAL-ROLE-SEPARATION-001。`,
        violation: 'ISC-EVAL-ROLE-SEPARATION-001',
        badcase: true,
        gateResults: [],
      };
      emit(PDCA_EVENTS.BADCASE_ROLE_SEPARATION, {
        task_id: taskId, executor: task.executor_agent, evaluator: task.evaluator_agent,
        reason: result.reason, badcase: true,
      });
      return result;
    }
    // 🚨 铁令：evaluator必须是analyst，唯一选项
    if (task.evaluator_agent !== gates.CHECK_EVALUATOR_ROLE) {
      const result = {
        allowed: false,
        reason: `BLOCK: Check阶段评测者必须是 ${gates.CHECK_EVALUATOR_ROLE}（质量分析师），实际=${task.evaluator_agent}。用户铁令。`,
        violation: 'ISC-EVAL-ROLE-SEPARATION-001',
        badcase: true,
        gateResults: [],
      };
      emit(PDCA_EVENTS.BADCASE_ROLE_SEPARATION, {
        task_id: taskId, executor: task.executor_agent, evaluator: task.evaluator_agent,
        reason: result.reason, badcase: true,
      });
      return result;
    }
  }
  // ============================================================

  const transitionGates = TRANSITION_GATES[key];
  if (!transitionGates) {
    return {
      allowed: false,
      reason: `未定义的转换门禁配置: ${key}`,
      gateResults: [],
    };
  }

  const gateResults = [];

  // 2. 运行准出门禁（from阶段）
  if (transitionGates.exit) {
    const exitResult = gates.runGate(transitionGates.exit, task, 'block');
    gateResults.push({ gate: transitionGates.exit, ...exitResult });
    if (!exitResult.passed) {
      emit(PDCA_EVENTS.GATE_BLOCKED, {
        task_id: taskId, gate: transitionGates.exit, from, to,
        violations: exitResult.violations,
      });
      return {
        allowed: false,
        reason: `准出门禁拒绝: ${transitionGates.exit}`,
        gateResults,
      };
    }
    emit(PDCA_EVENTS.GATE_PASSED, {
      task_id: taskId, gate: transitionGates.exit, from, to,
    });
  }

  // 3. 运行准入门禁（to阶段）
  if (transitionGates.entry) {
    const entryResult = gates.runGate(transitionGates.entry, task, 'block');
    gateResults.push({ gate: transitionGates.entry, ...entryResult });
    if (!entryResult.passed) {
      emit(PDCA_EVENTS.GATE_BLOCKED, {
        task_id: taskId, gate: transitionGates.entry, from, to,
        violations: entryResult.violations,
      });
      return {
        allowed: false,
        reason: `准入门禁拒绝: ${transitionGates.entry}`,
        gateResults,
      };
    }
    emit(PDCA_EVENTS.GATE_PASSED, {
      task_id: taskId, gate: transitionGates.entry, from, to,
    });
  }

  // 4. 转换成功 — 更新状态 + 发射事件
  emit(PDCA_EVENTS.PHASE_EXITED, { task_id: taskId, phase: from });
  emit(PDCA_EVENTS.PHASE_ENTERED, { task_id: taskId, phase: to });

  // 持久化状态
  const state = loadState();
  state[taskId] = {
    phase: to,
    updated_at: new Date().toISOString(),
    history: [
      ...(state[taskId]?.history || []),
      { from, to, timestamp: new Date().toISOString(), gates: gateResults.map(g => ({ gate: g.gate, passed: g.passed })) },
    ],
  };
  saveState(state);

  return {
    allowed: true,
    gateResults,
  };
}

module.exports = {
  transition,
  getTaskState,
  loadState,
  saveState,
  VALID_TRANSITIONS,
  TRANSITION_GATES,
  STATE_FILE,
};
