#!/usr/bin/env node
'use strict';

/**
 * event-emitter.js — PDCA事件发射器
 *
 * 状态转换时写入事件总线 infrastructure/event-bus/events.jsonl
 * 事件类型：
 *   pdca.phase.entered — 进入新阶段
 *   pdca.phase.exited  — 离开阶段
 *   pdca.gate.passed   — 门禁通过
 *   pdca.gate.blocked  — 门禁拦截
 *   pdca.badcase.role_separation_violation — 角色分离违规
 */

const fs = require('fs');
const path = require('path');

const WORKSPACE = process.env.OPENCLAW_WORKSPACE || '/root/.openclaw/workspace';
const EVENTS_FILE = path.join(WORKSPACE, 'infrastructure', 'event-bus', 'events.jsonl');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * 发射事件到事件总线
 * @param {string} type - 事件类型
 * @param {object} payload - 事件数据
 * @returns {object} 写入的事件对象
 */
function emit(type, payload) {
  const event = {
    id: `evt_pdca_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    source: 'pdca-engine',
    payload: {
      ...payload,
      _metadata: {
        trace_id: `trace_pdca_${Date.now()}`,
        chain_depth: 0,
        emitted_at: Date.now(),
        event_type: type,
      },
    },
    timestamp: Date.now(),
    consumed_by: [],
  };

  ensureDir(path.dirname(EVENTS_FILE));
  fs.appendFileSync(EVENTS_FILE, JSON.stringify(event) + '\n');
  return event;
}

// 预定义的PDCA事件类型常量
const PDCA_EVENTS = {
  PHASE_ENTERED: 'pdca.phase.entered',
  PHASE_EXITED:  'pdca.phase.exited',
  GATE_PASSED:   'pdca.gate.passed',
  GATE_BLOCKED:  'pdca.gate.blocked',
  BADCASE_ROLE_SEPARATION: 'pdca.badcase.role_separation_violation',
};

module.exports = {
  emit,
  PDCA_EVENTS,
  EVENTS_FILE,
};
