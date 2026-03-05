#!/usr/bin/env node
/**
 * DTO-AEO流水线 — Cron Adapter (Check-and-Skip Mode)
 * 
 * 替代原来每小时无条件执行。
 * 检查 DTO Signals Watcher 是否已处理信号，如果是则跳过。
 */
'use strict';

const path = require('path');
const fs = require('fs');
const { shouldSkip, markCronExecuted } = require('../cron-check-skip');

const TASK_ID = 'dto-aeo';
const MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2小时（cron周期1小时 * 2）
const DTO_BRIDGE_PATH = path.join(__dirname, '../../../skills/dto-core/event-bridge');
const SIGNALS_DIR = path.join(__dirname, '../../../.dto-signals');

/**
 * 检查是否有新的未处理信号
 */
function hasNewSignals() {
  if (!fs.existsSync(SIGNALS_DIR)) return false;
  const files = fs.readdirSync(SIGNALS_DIR)
    .filter(f => !f.startsWith('.') && !f.startsWith('_'));
  return files.some(f => {
    const stat = fs.statSync(path.join(SIGNALS_DIR, f));
    return stat.isFile();
  });
}

async function main() {
  // 1. Check-and-skip
  const skipResult = shouldSkip(TASK_ID, {
    maxAgeMs: MAX_AGE_MS,
    hasNewChanges: hasNewSignals
  });
  
  if (skipResult.skip) {
    console.log(JSON.stringify({
      status: 'SKIPPED',
      task: TASK_ID,
      reason: skipResult.reason,
      message: `DTO Signals Watcher 已处理信号，cron跳过`,
      timestamp: new Date().toISOString()
    }));
    markCronExecuted(TASK_ID, 'skipped');
    process.exit(0);
  }
  
  // 2. 执行 DTO event-bridge（cron兜底）
  console.log(`[cron-adapter] ${TASK_ID}: 执行cron兜底`);
  
  try {
    const bridge = require(DTO_BRIDGE_PATH);
    const result = await bridge.processEvents();
    
    console.log(JSON.stringify({
      status: 'OK',
      task: TASK_ID,
      mode: 'cron-fallback',
      result: {
        processed: result.processed,
        details: (result.results || []).map(r => ({
          type: r.type,
          status: r.status
        }))
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
