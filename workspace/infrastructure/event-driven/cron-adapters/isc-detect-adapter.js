#!/usr/bin/env node
/**
 * ISC变更检测 — Cron Adapter (Check-and-Skip Mode)
 * 
 * 替代原来直接运行 isc-core/event-bridge.js。
 * 检查事件驱动的 fs.watch 是否已处理变更，如果是则跳过。
 */
'use strict';

const path = require('path');
const { shouldSkip, markCronExecuted } = require('../cron-check-skip');

const TASK_ID = 'isc-detect';
const MAX_AGE_MS = 30 * 60 * 1000; // 30分钟（cron周期15分钟 * 2）
const ISC_BRIDGE_PATH = path.join(__dirname, '../../../skills/isc-core/event-bridge');

async function main() {
  // 1. Check-and-skip
  const skipResult = shouldSkip(TASK_ID, { maxAgeMs: MAX_AGE_MS });
  
  if (skipResult.skip) {
    console.log(JSON.stringify({
      status: 'SKIPPED',
      task: TASK_ID,
      reason: skipResult.reason,
      message: `ISC fs.watch 已处理变更，cron跳过`,
      timestamp: new Date().toISOString()
    }));
    markCronExecuted(TASK_ID, 'skipped');
    process.exit(0);
  }
  
  // 2. 执行 ISC event-bridge 完整检测（cron兜底）
  console.log(`[cron-adapter] ${TASK_ID}: 执行cron兜底扫描`);
  
  try {
    const bridge = require(ISC_BRIDGE_PATH);
    const result = bridge.publishChangesWithSummary();
    
    console.log(JSON.stringify({
      status: 'OK',
      task: TASK_ID,
      mode: 'cron-fallback',
      result: {
        changes: result.changes,
        details: result.details || []
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
