'use strict';

/**
 * Cron Job Requested Handler
 * [Gap4] 处理通过 EventBus 请求执行定时任务的事件
 * 
 * 事件类型: cron.job.requested
 * 功能: 将请求路由到对应的底层脚本或技能执行
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const WORKSPACE = '/root/.openclaw/workspace';
const LOG_PATH = path.join(WORKSPACE, 'infrastructure/logs/cron-job-requested.jsonl');

function appendLog(entry) {
  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
  fs.appendFileSync(LOG_PATH, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n');
}

function normalizeCommand(payload) {
  const job = payload.job || {};
  const command = payload.command || {};
  const script = payload.script || command.script || null;
  const args = Array.isArray(payload.args)
    ? payload.args
    : Array.isArray(command.args)
      ? command.args
      : [];
  const jobId = payload.job_id || payload.jobId || job.name || 'unknown';
  const timeoutSeconds = Number(job.timeout_seconds || payload.timeout_seconds || 60) || 60;
  return { jobId, script, args, timeoutSeconds };
}

function handle(event, context) {
  const payload = (event && event.payload) || {};
  const { jobId, script, args, timeoutSeconds } = normalizeCommand(payload);

  if (!script) {
    const result = {
      status: 'skipped',
      handler: 'cron-job-requested',
      reason: 'No script/command in payload',
      job_id: jobId,
    };
    appendLog({ ...result, payload_keys: Object.keys(payload || {}) });
    return result;
  }

  // 安全限制: 只允许 workspace 内的脚本
  const resolvedScript = path.resolve(WORKSPACE, script);
  if (!resolvedScript.startsWith(WORKSPACE)) {
    const result = {
      status: 'error',
      handler: 'cron-job-requested',
      error: 'Script path outside workspace — rejected',
      job_id: jobId,
      script,
    };
    appendLog(result);
    return result;
  }

  if (!fs.existsSync(resolvedScript)) {
    const result = {
      status: 'error',
      handler: 'cron-job-requested',
      error: 'Script not found',
      job_id: jobId,
      script,
      resolvedScript,
    };
    appendLog(result);
    return result;
  }

  const res = spawnSync('node', [resolvedScript, ...args], {
    timeout: timeoutSeconds * 1000,
    encoding: 'utf8',
    cwd: WORKSPACE,
    env: { ...process.env },
  });

  const result = {
    status: res.status === 0 ? 'ok' : 'error',
    handler: 'cron-job-requested',
    job_id: jobId,
    script,
    args,
    exitCode: res.status,
    stdout: (res.stdout || '').slice(0, 1000),
    stderr: (res.stderr || '').slice(0, 1000),
  };

  if (res.error) {
    result.error = res.error.message;
  }

  appendLog(result);
  return result;
}

module.exports = { handle, normalizeCommand };
