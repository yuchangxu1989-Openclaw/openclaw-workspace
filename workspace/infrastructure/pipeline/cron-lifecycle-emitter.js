'use strict';

/**
 * Cron 生命周期事件发射器 (Cron Lifecycle Emitter)
 * 
 * 为任意脚本添加EventBus生命周期事件包装：
 *   cron.job.started  → 脚本开始执行
 *   cron.job.completed → 脚本成功完成
 *   cron.job.failed   → 脚本执行失败
 * 
 * 用法：
 *   node cron-lifecycle-emitter.js <job-id> <script-path> [args...]
 *   
 *   例：
 *   node cron-lifecycle-emitter.js event-dispatcher /path/to/dispatcher.js
 *   node cron-lifecycle-emitter.js isc-detect /path/to/event-bridge.js
 * 
 * 环境变量：
 *   L3_LIFECYCLE_EVENTS=false  禁用事件发射（脚本照常执行）
 * 
 * 设计原则：
 *   1. 零侵入：不修改被包装脚本的任何代码
 *   2. 透明代理：脚本的stdout/stderr/exit code原样传递
 *   3. 容错：EventBus不可用时不影响脚本执行
 *   4. Layer标记：所有事件标记为 META 层
 * 
 * @module infrastructure/pipeline/cron-lifecycle-emitter
 */

const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// ─── 配置 ───
const ENABLED = process.env.L3_LIFECYCLE_EVENTS !== 'false';

// ─── EventBus 接入（容错） ───
let busAdapter = null;
try {
  busAdapter = require('../event-bus/bus-adapter');
} catch (e) {
  try {
    busAdapter = require(path.join(__dirname, '..', 'event-bus', 'bus-adapter'));
  } catch (_) {
    // EventBus unavailable — lifecycle events silently disabled
  }
}

/**
 * 安全发射事件（不抛异常）
 */
function safeEmit(type, payload) {
  if (!ENABLED || !busAdapter) return null;
  try {
    return busAdapter.emit(type, payload, 'cron-lifecycle', { layer: 'META' });
  } catch (e) {
    // EventBus failure is never fatal
    console.error(`[CronLifecycle] emit failed: ${e.message}`);
    return null;
  }
}

/**
 * 包装执行脚本，前后发射生命周期事件
 */
async function wrapExecution(jobId, scriptPath, args = []) {
  const startTime = Date.now();
  const startPayload = {
    job_id: jobId,
    script: scriptPath,
    args: args,
    start_time: new Date().toISOString(),
  };

  // emit started
  safeEmit('cron.job.started', startPayload);

  // 执行脚本
  return new Promise((resolve) => {
    const child = spawn('node', [scriptPath, ...args], {
      stdio: 'inherit',
      env: { ...process.env },
      cwd: path.dirname(scriptPath),
    });

    child.on('close', (code) => {
      const duration = Date.now() - startTime;
      
      if (code === 0) {
        safeEmit('cron.job.completed', {
          ...startPayload,
          duration_ms: duration,
          exit_code: 0,
          end_time: new Date().toISOString(),
        });
      } else {
        safeEmit('cron.job.failed', {
          ...startPayload,
          duration_ms: duration,
          exit_code: code,
          end_time: new Date().toISOString(),
          error: `Process exited with code ${code}`,
        });
      }

      resolve(code);
    });

    child.on('error', (err) => {
      const duration = Date.now() - startTime;
      safeEmit('cron.job.failed', {
        ...startPayload,
        duration_ms: duration,
        exit_code: -1,
        end_time: new Date().toISOString(),
        error: err.message,
      });
      resolve(1);
    });
  });
}

// ─── CLI 入口 ───
if (require.main === module) {
  const [,, jobId, scriptPath, ...args] = process.argv;

  if (!jobId || !scriptPath) {
    console.error('Usage: node cron-lifecycle-emitter.js <job-id> <script-path> [args...]');
    process.exit(1);
  }

  if (!fs.existsSync(scriptPath)) {
    console.error(`Script not found: ${scriptPath}`);
    process.exit(1);
  }

  wrapExecution(jobId, scriptPath, args).then((code) => {
    process.exit(code || 0);
  });
}

// ─── 模块导出 ───
module.exports = { wrapExecution, safeEmit };
