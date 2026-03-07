'use strict';

/**
 * Cron Job Requested Handler
 * [Gap4] 处理通过 EventBus 请求执行定时任务的事件
 * 
 * 事件类型: cron.job.requested
 * 功能: 将请求路由到对应的底层脚本或技能执行
 */

const path = require('path');
const { execSync } = require('child_process');

function handle(event, context) {
  const payload = (event && event.payload) || {};
  const jobId = payload.job_id || payload.jobId || 'unknown';
  const script = payload.script || payload.command || null;

  if (!script) {
    return {
      status: 'skipped',
      handler: 'cron-job-requested',
      reason: 'No script/command in payload',
      job_id: jobId,
    };
  }

  // 安全限制: 只允许 workspace 内的脚本
  const WORKSPACE = '/root/.openclaw/workspace';
  const resolvedScript = path.resolve(WORKSPACE, script);
  if (!resolvedScript.startsWith(WORKSPACE)) {
    return {
      status: 'error',
      handler: 'cron-job-requested',
      error: 'Script path outside workspace — rejected',
      job_id: jobId,
    };
  }

  try {
    const output = execSync(`node "${resolvedScript}"`, {
      timeout: 60000,
      encoding: 'utf8',
      cwd: WORKSPACE,
    }).trim();
    return {
      status: 'ok',
      handler: 'cron-job-requested',
      job_id: jobId,
      output: output.slice(0, 500),
    };
  } catch (err) {
    return {
      status: 'error',
      handler: 'cron-job-requested',
      job_id: jobId,
      error: err.message,
    };
  }
}

module.exports = { handle };
