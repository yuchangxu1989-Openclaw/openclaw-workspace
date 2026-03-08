#!/usr/bin/env node
/**
 * Cron Check-and-Skip Adapter
 * 
 * 共享逻辑：cron执行前检查是否已被事件触发处理过。
 * 如果上次事件触发后无新变更，则跳过本次cron执行。
 * 
 * 用法：
 *   const { shouldSkip, markEventTriggered, markCronExecuted } = require('./cron-check-skip');
 *   if (shouldSkip('isc-detect')) { process.exit(0); }
 * 
 * 状态文件：state/trigger-state.json
 */
'use strict';

const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, 'state', 'trigger-state.json');

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch (_) {}
  return {};
}

function saveState(state) {
  const dir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

/**
 * 标记某任务被事件触发执行了
 * @param {string} taskId - 任务标识（如 'isc-detect', 'lto-aeo'）
 * @param {object} [meta] - 附加信息
 */
function markEventTriggered(taskId, meta = {}) {
  const state = loadState();
  if (!state[taskId]) state[taskId] = {};
  state[taskId].lastEventTrigger = Date.now();
  state[taskId].lastEventMeta = meta;
  state[taskId].eventTriggerCount = (state[taskId].eventTriggerCount || 0) + 1;
  saveState(state);
}

/**
 * 标记cron执行了（无论是否跳过）
 * @param {string} taskId
 * @param {string} outcome - 'executed' | 'skipped'
 */
function markCronExecuted(taskId, outcome) {
  const state = loadState();
  if (!state[taskId]) state[taskId] = {};
  state[taskId].lastCronRun = Date.now();
  state[taskId].lastCronOutcome = outcome;
  state[taskId].cronRunCount = (state[taskId].cronRunCount || 0) + 1;
  saveState(state);
}

/**
 * 判断cron是否应该跳过执行
 * 
 * 跳过条件：上次事件触发 > 上次cron执行 且 距离上次事件触发不超过 maxAge
 * 
 * @param {string} taskId - 任务标识
 * @param {object} [opts]
 * @param {number} [opts.maxAgeMs] - 事件触发后多久内cron可以跳过（默认=任务cron周期*2）
 * @param {function} [opts.hasNewChanges] - 可选：额外检查是否有新变更的函数，返回 true 表示有新变更
 * @returns {{ skip: boolean, reason: string }}
 */
function shouldSkip(taskId, opts = {}) {
  const state = loadState();
  const task = state[taskId];

  if (!task || !task.lastEventTrigger) {
    return { skip: false, reason: 'no_event_trigger_record' };
  }

  const lastEvent = task.lastEventTrigger;
  const lastCron = task.lastCronRun || 0;
  const maxAge = opts.maxAgeMs || 30 * 60 * 1000; // 默认30分钟

  // 如果上次事件触发比上次cron执行更近
  if (lastEvent > lastCron) {
    const age = Date.now() - lastEvent;
    if (age < maxAge) {
      // 如果提供了额外检查函数，检查是否有新变更
      if (typeof opts.hasNewChanges === 'function') {
        try {
          if (opts.hasNewChanges()) {
            return { skip: false, reason: 'new_changes_detected_since_event_trigger' };
          }
        } catch (_) {
          return { skip: false, reason: 'change_check_error_executing_anyway' };
        }
      }
      return {
        skip: true,
        reason: `event_triggered_${Math.round(age / 1000)}s_ago`
      };
    }
  }

  return { skip: false, reason: 'event_trigger_too_old_or_before_last_cron' };
}

/**
 * 获取某任务的触发状态
 * @param {string} taskId
 * @returns {object|null}
 */
function getTaskState(taskId) {
  const state = loadState();
  return state[taskId] || null;
}

/**
 * 获取所有任务状态
 * @returns {object}
 */
function getAllState() {
  return loadState();
}

module.exports = {
  shouldSkip,
  markEventTriggered,
  markCronExecuted,
  getTaskState,
  getAllState,
  STATE_FILE
};
