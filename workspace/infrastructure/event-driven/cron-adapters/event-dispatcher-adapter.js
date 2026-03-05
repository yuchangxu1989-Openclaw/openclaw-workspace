#!/usr/bin/env node
/**
 * Event Dispatcher — Cron Adapter (Check-and-Skip Mode)
 * 
 * 替代原来的 fast-check.js + dispatcher 调用链。
 * 检查事件驱动是否已经处理了待消费事件，如果是则跳过。
 * 
 * 用法（cron message 中）：
 *   node infrastructure/event-driven/cron-adapters/event-dispatcher-adapter.js
 */
'use strict';

const { shouldSkip, markCronExecuted } = require('../cron-check-skip');

const TASK_ID = 'event-dispatcher';
const MAX_AGE_MS = 10 * 60 * 1000; // 10分钟（cron周期5分钟 * 2）

async function main() {
  // 1. Check-and-skip
  const skipResult = shouldSkip(TASK_ID, { maxAgeMs: MAX_AGE_MS });
  
  if (skipResult.skip) {
    console.log(JSON.stringify({
      status: 'SKIPPED',
      task: TASK_ID,
      reason: skipResult.reason,
      message: `事件驱动已处理，cron跳过 (${skipResult.reason})`,
      timestamp: new Date().toISOString()
    }));
    markCronExecuted(TASK_ID, 'skipped');
    process.exit(0);
  }
  
  // 2. 执行原有 fast-check + dispatcher 逻辑
  console.log(`[cron-adapter] ${TASK_ID}: 事件驱动未覆盖，执行cron兜底`);
  
  try {
    // 先做 fast-check
    const fastCheck = require('../../dispatcher/fast-check');
    // fast-check 是同步的，如果没工作会直接 exit(0)
    // 但我们需要捕获它的行为，直接检查事件文件
    
    const { hasUnconsumedEvents } = require('../watchers/eventbus-file-watcher');
    
    if (!hasUnconsumedEvents()) {
      console.log(JSON.stringify({
        status: 'IDLE',
        task: TASK_ID,
        message: '无未消费事件，跳过',
        timestamp: new Date().toISOString()
      }));
      markCronExecuted(TASK_ID, 'idle');
      process.exit(0);
    }
    
    // 有未消费事件，执行 L3 Pipeline
    const { runOnce } = require('../../pipeline/l3-pipeline');
    const result = await runOnce({ source: 'cron-fallback', trigger: 'scheduled-5min' });
    
    console.log(JSON.stringify({
      status: 'OK',
      task: TASK_ID,
      mode: 'cron-fallback',
      result: {
        consumed: result.consumed_events,
        dispatched: result.dispatched_actions,
        duration_ms: result.duration_ms
      },
      timestamp: new Date().toISOString()
    }));
    
    markCronExecuted(TASK_ID, 'executed');
  } catch (err) {
    console.error(JSON.stringify({
      status: 'ERROR',
      task: TASK_ID,
      error: err.message,
      timestamp: new Date().toISOString()
    }));
    markCronExecuted(TASK_ID, 'error');
    process.exit(1);
  }
}

main();
