'use strict';

/**
 * D2-03 Cron Healer — 自愈守卫
 * 
 * 检测并修复 cron jobs 中的常见问题：
 * 1. delivery.target → delivery.to 字段迁移
 * 2. delivery 缺少 to 字段
 * 3. consecutiveErrors > 0 的 job 诊断
 * 4. escalate 无法自动修复的问题
 */

const fs = require('fs');
const path = require('path');

const JOBS_FILE = '/root/.openclaw/cron/jobs.json';
const HEAL_LOG_DIR = path.join(__dirname, 'logs');
const DEFAULT_USER = 'user:ou_a113e465324cc55f9ab3348c9a1a7b9b';
const { MainlineRecovery, MainlineWAL, MainlineTrace } = require('/root/.openclaw/workspace/infrastructure/resilience/mainline-capabilities');
const recovery = new MainlineRecovery();
const wal = new MainlineWAL();
const trace = new MainlineTrace();

// 确保日志目录存在
if (!fs.existsSync(HEAL_LOG_DIR)) {
  fs.mkdirSync(HEAL_LOG_DIR, { recursive: true });
}

const today = new Date().toISOString().slice(0, 10);
const HEAL_LOG_FILE = path.join(HEAL_LOG_DIR, `heal-${today}.jsonl`);

function appendLog(entry) {
  const line = JSON.stringify({ ...entry, ts: new Date().toISOString() });
  fs.appendFileSync(HEAL_LOG_FILE, line + '\n', 'utf8');
  trace.log('self_healing.log', entry);
  wal.append({ type: 'self_healing_log', traceId: entry.jobId || entry.jobName || 'cron-healer', ...entry });
  if (entry.action === 'escalate') {
    recovery.trigger({ traceId: entry.jobId || entry.jobName || 'cron-healer', source: 'self-healing', reason: entry.reason || entry.pattern || 'escalate', jobId: entry.jobId, jobName: entry.jobName });
  }
  console.log(line);
}

function loadJobs() {
  const raw = fs.readFileSync(JOBS_FILE, 'utf8');
  return JSON.parse(raw);
}

function saveJobs(data) {
  fs.writeFileSync(JOBS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function healJobs(data) {
  const jobs = Array.isArray(data) ? data : (data.jobs || []);
  const fixes = [];
  const escalations = [];

  for (const job of jobs) {
    const d = job.delivery;
    
    // Pattern 1: delivery.target → delivery.to
    if (d && typeof d === 'object' && d.target && !d.to) {
      const oldDelivery = { ...d };
      d.to = d.target;
      delete d.target;
      fixes.push({
        action: 'auto-fix',
        jobId: job.id,
        jobName: job.name,
        pattern: 'delivery-target-to-to',
        diff: { field: 'delivery', old: oldDelivery, new: { ...d } }
      });
    }
    
    // Pattern 2: announce mode missing `to`
    if (d && typeof d === 'object' && d.mode === 'announce' && !d.to) {
      d.to = DEFAULT_USER;
      fixes.push({
        action: 'auto-fix',
        jobId: job.id,
        jobName: job.name,
        pattern: 'delivery-missing-to',
        diff: { field: 'delivery.to', added: DEFAULT_USER }
      });
    }
    
    // Pattern 3: consecutiveErrors >= 3 → escalate
    const state = job.state || {};
    const lastError = job.lastError || state.lastError || '';
    const errors = state.consecutiveErrors || 0;
    
    if (errors >= 3) {
      escalations.push({
        action: 'escalate',
        jobId: job.id,
        jobName: job.name,
        consecutiveErrors: errors,
        lastError: String(lastError).slice(0, 300)
      });
    }
    
    // Pattern 4: auth errors → escalate (cannot auto-fix)
    if (lastError && (String(lastError).includes('401') || String(lastError).toLowerCase().includes('auth'))) {
      escalations.push({
        action: 'escalate',
        jobId: job.id,
        jobName: job.name,
        reason: 'auth-error',
        lastError: String(lastError).slice(0, 300)
      });
    }
    
    // Pattern 5: unknown errors without autofix
    if (lastError && errors === 0 && !String(lastError).includes('401') && String(lastError).trim()) {
      const status = state.lastStatus || state.lastRunStatus;
      if (status === 'error') {
        escalations.push({
          action: 'escalate',
          jobId: job.id,
          jobName: job.name,
          reason: 'unknown-error',
          lastError: String(lastError).slice(0, 300)
        });
      }
    }
  }

  return { fixes, escalations };
}

// Main
const data = loadJobs();
const { fixes, escalations } = healJobs(data);

// 应用修复
if (fixes.length > 0) {
  saveJobs(data);
}

// 记录日志
for (const fix of fixes) {
  appendLog(fix);
}
for (const esc of escalations) {
  appendLog(esc);
}

// 输出摘要
const summary = {
  runAt: new Date().toISOString(),
  fixes: fixes.length,
  escalations: escalations.length,
  fixDetails: fixes.map(f => `${f.jobName} [${f.pattern}]`),
  escalateDetails: escalations.map(e => `${e.jobName} [${e.reason || 'consecutive-errors'}]`)
};

console.log('\n=== SUMMARY ===');
console.log(JSON.stringify(summary, null, 2));

process.exit(0);
