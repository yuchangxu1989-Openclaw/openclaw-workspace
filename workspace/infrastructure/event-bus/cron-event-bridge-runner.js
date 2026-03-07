#!/usr/bin/env node
'use strict';

/**
 * Cron → EventBus bridge runner
 *
 * 目标：把 infrastructure/cron/jobs.json 中的 time-trigger job 统一桥接为事件驱动入口。
 * - 默认列出可桥接作业
 * - 可对指定 job / 全量 job 发射 cron.job.requested 事件
 * - 可选直接执行底层脚本（供 fallback / 验证使用）
 *
 * 事件驱动契约：
 *   cron.job.requested
 *   payload = {
 *     job,
 *     requested_at,
 *     requested_by,
 *     trigger: 'cron-bridge',
 *     fallback: boolean,
 *     command: { script, args }
 *   }
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const bus = require('./bus-adapter');

const ROOT = path.resolve(__dirname, '..', '..');
const JOBS_FILE = path.resolve(ROOT, 'infrastructure/cron/jobs.json');
const LOG_FILE = path.resolve(ROOT, 'infrastructure/logs/cron-event-bridge.jsonl');

function readJobs() {
  const raw = JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8'));
  return Array.isArray(raw.jobs) ? raw.jobs : [];
}

function ensureLogDir() {
  const dir = path.dirname(LOG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function appendLog(entry) {
  ensureLogDir();
  fs.appendFileSync(LOG_FILE, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n');
}

function parseArgs(argv) {
  const args = { all: false, emitOnly: false, runFallback: false, list: false, jobNames: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--all') args.all = true;
    else if (a === '--emit-only') args.emitOnly = true;
    else if (a === '--run-fallback') args.runFallback = true;
    else if (a === '--list') args.list = true;
    else if (a === '--job' && argv[i + 1]) args.jobNames.push(argv[++i]);
    else if (a.startsWith('--job=')) args.jobNames.push(a.slice(6));
  }
  if (!args.all && args.jobNames.length === 0 && !args.list) args.list = true;
  return args;
}

function selectJobs(allJobs, opts) {
  let jobs = allJobs.filter(job => job && job.enabled !== false && (job.bridge_event === 'cron.job.requested' || job.trigger === 'time' || job.trigger === 'event_bridge')); 
  if (!opts.all && opts.jobNames.length > 0) {
    const wanted = new Set(opts.jobNames);
    jobs = jobs.filter(job => wanted.has(job.name));
  }
  return jobs;
}

function emitRequested(job, fallback = false) {
  const payload = {
    job: {
      name: job.name,
      description: job.description,
      schedule: job.schedule,
      tags: job.tags || [],
      mode: job.mode || 'time',
      primary_channel: job.primary_channel || null,
      primary_event: job.primary_event || null,
      model: job.model || null,
      timeout_seconds: job.timeout_seconds || null
    },
    requested_at: Date.now(),
    requested_by: 'cron-event-bridge-runner',
    trigger: 'cron-bridge',
    fallback,
    command: {
      script: job.script,
      args: job.args || []
    }
  };

  const result = bus.emit('cron.job.requested', payload, 'cron-event-bridge-runner', { layer: 'META' });
  appendLog({ action: 'emit', job: job.name, event: 'cron.job.requested', result });
  return result;
}

function runFallback(job) {
  const scriptPath = path.resolve(ROOT, job.script);
  if (!fs.existsSync(scriptPath)) {
    const error = `script_not_found:${scriptPath}`;
    appendLog({ action: 'fallback', job: job.name, status: 'error', error });
    return { ok: false, error };
  }

  const res = spawnSync('node', [scriptPath, ...(job.args || [])], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: (job.timeout_seconds || 60) * 1000,
    env: { ...process.env }
  });

  appendLog({
    action: 'fallback',
    job: job.name,
    status: res.status === 0 ? 'ok' : 'error',
    exitCode: res.status,
    stdout: (res.stdout || '').slice(0, 1000),
    stderr: (res.stderr || '').slice(0, 1000)
  });

  return {
    ok: res.status === 0,
    exitCode: res.status,
    stdout: res.stdout || '',
    stderr: res.stderr || ''
  };
}

function main() {
  const opts = parseArgs(process.argv);
  const allJobs = readJobs();
  const jobs = selectJobs(allJobs, opts);

  if (opts.list) {
    console.log(JSON.stringify({
      status: 'OK',
      mode: 'list',
      count: jobs.length,
      jobs: jobs.map(j => ({
        name: j.name,
        schedule: j.schedule,
        script: j.script,
        mode: j.mode || 'time',
        primary_event: j.primary_event || null
      }))
    }, null, 2));
    return;
  }

  const results = [];
  for (const job of jobs) {
    const emitted = emitRequested(job, opts.runFallback);
    let fallback = null;
    if (opts.runFallback) {
      fallback = runFallback(job);
    }
    results.push({ job: job.name, emitted, fallback });
  }

  console.log(JSON.stringify({
    status: 'OK',
    mode: opts.runFallback ? 'emit+fallback' : 'emit-only',
    count: results.length,
    results
  }, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = { readJobs, selectJobs, emitRequested, runFallback };
