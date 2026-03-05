#!/usr/bin/env node
/**
 * OpenClaw Cron Scheduler Daemon
 * 
 * 读取 infrastructure/cron/jobs.json，使用纯 Node.js 定时器
 * 按计划执行各 job（解析 cron 表达式的简化实现）。
 * 
 * 这是 systemd openclaw-cron.service 的入口点。
 * 
 * 注意：对于精确 cron 场景，系统 crontab 更可靠。
 * 此 daemon 作为补充，提供可观测性和动态重载能力。
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');

const WORKSPACE = path.join(__dirname, '..');
process.chdir(WORKSPACE);

const JOBS_FILE = path.join(WORKSPACE, 'infrastructure/cron/jobs.json');
const LOG_DIR = path.join(WORKSPACE, 'infrastructure/logs');
const RELOAD_INTERVAL_MS = 5 * 60 * 1000; // 每5分钟重载 jobs.json

function log(msg, data = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), msg, ...data }));
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

ensureDir(LOG_DIR);

// ── 简化的 cron 表达式解析器 ──
// 支持：`*/N` (每N单位), `N` (固定值), `*` (任意)
function parseCronField(field, min, max) {
  if (field === '*') return null; // 匹配所有
  if (field.startsWith('*/')) {
    const step = parseInt(field.slice(2), 10);
    return { type: 'step', step };
  }
  const val = parseInt(field, 10);
  if (!isNaN(val)) return { type: 'exact', val };
  return null;
}

function cronMatches(cronExpr, date) {
  const [minute, hour, dom, month, dow] = cronExpr.split(' ');
  const now = {
    minute: date.getMinutes(),
    hour:   date.getHours(),
    dom:    date.getDate(),
    month:  date.getMonth() + 1,
    dow:    date.getDay(),
  };

  function fieldMatch(expr, val) {
    const parsed = parseCronField(expr);
    if (parsed === null) return true;
    if (parsed.type === 'exact') return parsed.val === val;
    if (parsed.type === 'step') return val % parsed.step === 0;
    return true;
  }

  return (
    fieldMatch(minute, now.minute) &&
    fieldMatch(hour,   now.hour) &&
    fieldMatch(dom,    now.dom) &&
    fieldMatch(month,  now.month) &&
    fieldMatch(dow,    now.dow)
  );
}

// ── Job 执行 ──
const runningJobs = new Set();

function runJob(job) {
  if (runningJobs.has(job.name)) {
    log('Job already running, skipping', { job: job.name });
    return;
  }

  const scriptPath = path.join(WORKSPACE, job.script);
  const args = job.args || [];
  const logFile = path.join(LOG_DIR, `${job.name}.log`);
  const logStream = fs.createWriteStream(logFile, { flags: 'a' });

  log('Running job', { job: job.name, script: job.script, args });
  runningJobs.add(job.name);

  const child = execFile('node', [scriptPath, ...args], {
    cwd: WORKSPACE,
    timeout: (job.timeout_seconds || 120) * 1000,
    env: { ...process.env },
  }, (err, stdout, stderr) => {
    runningJobs.delete(job.name);
    if (err) {
      log('Job failed', { job: job.name, error: err.message, code: err.code });
      logStream.write(`[${new Date().toISOString()}] ERROR: ${err.message}\n`);
    } else {
      log('Job completed', { job: job.name });
    }
    if (stdout) logStream.write(stdout);
    if (stderr) logStream.write(stderr);
    logStream.end();
  });
}

// ── Jobs 加载 ──
function loadJobs() {
  try {
    const raw = fs.readFileSync(JOBS_FILE, 'utf8');
    const data = JSON.parse(raw);
    const jobs = (data.jobs || []).filter(j => j.enabled !== false);
    log('Jobs loaded', { count: jobs.length, names: jobs.map(j => j.name) });
    return jobs;
  } catch (err) {
    log('Failed to load jobs', { error: err.message });
    return [];
  }
}

let jobs = loadJobs();

// ── 每分钟检查 cron 调度 ──
function tick() {
  const now = new Date();
  // 对齐到整分钟
  for (const job of jobs) {
    if (!job.schedule) continue;
    try {
      if (cronMatches(job.schedule, now)) {
        runJob(job);
      }
    } catch (err) {
      log('Cron match error', { job: job.name, error: err.message });
    }
  }
}

// 等待到下一整分钟后开始，之后每60s触发
const msUntilNextMinute = 60000 - (Date.now() % 60000);
log('Cron daemon starting, first tick in', { ms: msUntilNextMinute });

setTimeout(() => {
  tick(); // 第一次 tick
  setInterval(tick, 60 * 1000); // 之后每分钟
}, msUntilNextMinute);

// ── 定期重载 jobs ──
setInterval(() => {
  jobs = loadJobs();
}, RELOAD_INTERVAL_MS);

log('OpenClaw Cron Daemon ready', { pid: process.pid, jobsFile: JOBS_FILE });

// ── 优雅退出 ──
function shutdown(signal) {
  log('Shutdown', { signal, runningJobs: [...runningJobs] });
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  log('uncaughtException', { error: err.message });
});
