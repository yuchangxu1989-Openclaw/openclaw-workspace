/**
 * board-push-on-complete handler
 * 
 * 事件触发看板推送：当 task.status.completed / task.status.done 事件到达时，
 * 异步触发 push-board-now.js 推送最新看板到飞书。
 * 
 * 去重由 push-board-now.js 内部的 content-hash 机制保证，不会重复推送。
 */
'use strict';
const { exec } = require('child_process');

const PUSH_SCRIPT = '/root/.openclaw/workspace/scripts/push-board-now.js';
const LOG_FILE = '/tmp/feishu-board-cron.log';

// 简单节流：同一进程内10秒内不重复触发
let lastTriggerMs = 0;
const THROTTLE_MS = 10000;

module.exports = async function boardPushOnComplete(event, rule, ctx) {
  const now = Date.now();
  if (now - lastTriggerMs < THROTTLE_MS) {
    return { status: 'throttled', message: `距上次触发不足${THROTTLE_MS / 1000}秒，跳过` };
  }
  lastTriggerMs = now;

  const label = event?.payload?.label || event?.payload?.task_label || '(unknown)';

  return new Promise((resolve) => {
    exec(`node ${PUSH_SCRIPT} >> ${LOG_FILE} 2>&1`, { timeout: 30000 }, (err) => {
      if (err) {
        console.error(`[board-push-on-complete] 推送失败: ${err.message}`);
        resolve({ status: 'error', message: err.message, label });
      } else {
        console.log(`[board-push-on-complete] 看板推送已触发 (label=${label})`);
        resolve({ status: 'ok', label });
      }
    });
  });
};
