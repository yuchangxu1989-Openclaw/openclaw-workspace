#!/usr/bin/env node
/**
 * cron-healer.js - 事件驱动自愈PoC
 * 
 * 读取cron jobs.json，检测连续错误>=3的任务，
 * 对已知错误模式自动修复，未知模式escalate。
 */

const fs = require('fs');
const path = require('path');

const JOBS_PATH = '/root/.openclaw/cron/jobs.json';
const LOG_DIR = '/root/.openclaw/workspace/infrastructure/self-healing/logs';
const ERROR_THRESHOLD = 3;

// 已知错误模式 → 自动修复函数
const KNOWN_PATTERNS = [
  {
    id: 'delivery-target-to-to',
    match: (job) => job.delivery?.target && !job.delivery?.to,
    description: 'delivery.target should be delivery.to',
    fix: (job) => {
      const old = JSON.parse(JSON.stringify(job.delivery));
      job.delivery.to = job.delivery.target;
      delete job.delivery.target;
      return { field: 'delivery', old, new: JSON.parse(JSON.stringify(job.delivery)) };
    }
  },
  {
    id: 'delivery-missing-to',
    match: (job) => {
      const err = job.state?.lastError || '';
      return err.includes('Delivering to Feishu requires target') && 
             job.delivery?.mode === 'announce' && !job.delivery?.to;
    },
    description: 'delivery.mode=announce but missing delivery.to',
    fix: (job) => {
      const defaultTo = 'user:ou_a113e465324cc55f9ab3348c9a1a7b9b';
      job.delivery.to = defaultTo;
      return { field: 'delivery.to', added: defaultTo };
    }
  },
  // D15: 新增模式库 - 扩展覆盖范围
  {
    id: 'script-not-found',
    match: (job) => {
      const err = job.state?.lastError || '';
      const cmd = job.command || '';
      return (err.includes('ENOENT') || err.includes('Cannot find module') || err.includes('No such file')) && cmd;
    },
    description: 'Script file not found - disable job and notify',
    fix: (job) => {
      const oldEnabled = job.enabled;
      job.enabled = false;
      job.state.disabledReason = `auto-disabled: script not found (${job.state.lastError?.slice(0, 100)})`;
      return { field: 'enabled', old: oldEnabled, new: false, reason: 'script_not_found' };
    }
  },
  {
    id: 'timeout-too-short',
    match: (job) => {
      const err = job.state?.lastError || '';
      return err.includes('timeout') || err.includes('ETIMEDOUT') || err.includes('exceeded');
    },
    description: 'Job timed out - double the timeout if configured',
    fix: (job) => {
      const oldTimeout = job.timeoutMs;
      if (oldTimeout && oldTimeout < 300000) { // max 5 min
        job.timeoutMs = Math.min(oldTimeout * 2, 300000);
        return { field: 'timeoutMs', old: oldTimeout, new: job.timeoutMs };
      }
      // If no timeout or already at max, disable retries
      job.state.skipRetry = true;
      return { field: 'skipRetry', added: true, reason: 'timeout_max_reached' };
    }
  },
  {
    id: 'permission-denied',
    match: (job) => {
      const err = job.state?.lastError || '';
      return err.includes('EACCES') || err.includes('permission denied') || err.includes('EPERM');
    },
    description: 'Permission denied - disable job until manual intervention',
    fix: (job) => {
      const oldEnabled = job.enabled;
      job.enabled = false;
      job.state.disabledReason = `auto-disabled: permission denied (requires manual fix)`;
      return { field: 'enabled', old: oldEnabled, new: false, reason: 'permission_denied' };
    }
  },
  {
    id: 'syntax-error-in-command',
    match: (job) => {
      const err = job.state?.lastError || '';
      return err.includes('SyntaxError') || err.includes('Unexpected token') || err.includes('is not a function');
    },
    description: 'Syntax/runtime error in script - disable and log for manual fix',
    fix: (job) => {
      const oldEnabled = job.enabled;
      job.enabled = false;
      job.state.disabledReason = `auto-disabled: code error — ${job.state.lastError?.slice(0, 150)}`;
      return { field: 'enabled', old: oldEnabled, new: false, reason: 'code_error' };
    }
  },
  {
    id: 'api-key-error',
    match: (job) => {
      const err = job.state?.lastError || '';
      return err.includes('401') || err.includes('403') || err.includes('invalid_api_key') || err.includes('API key');
    },
    description: 'API key invalid/expired - disable job, require key rotation',
    fix: (job) => {
      const oldEnabled = job.enabled;
      job.enabled = false;
      job.state.disabledReason = `auto-disabled: API authentication failure — rotate API keys`;
      return { field: 'enabled', old: oldEnabled, new: false, reason: 'api_key_invalid' };
    }
  },
  {
    id: 'network-unreachable',
    match: (job) => {
      const err = job.state?.lastError || '';
      return err.includes('ECONNREFUSED') || err.includes('ETIMEDOUT') || err.includes('ENOTFOUND') || err.includes('fetch failed');
    },
    description: 'Network unreachable - apply exponential backoff retry',
    fix: (job) => {
      // Exponential backoff: increase retry interval but don't disable
      const currentBackoff = job.state.retryBackoffMs || 60000;
      const newBackoff = Math.min(currentBackoff * 2, 1800000); // max 30 min
      job.state.retryBackoffMs = newBackoff;
      // Reset error count to give it another chance
      job.state.consecutiveErrors = Math.max(0, (job.state.consecutiveErrors || 0) - 2);
      return { field: 'retryBackoffMs', old: currentBackoff, new: newBackoff };
    }
  }
];

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

function log(entry) {
  ensureLogDir();
  const date = new Date().toISOString().slice(0, 10);
  const logFile = path.join(LOG_DIR, `heal-${date}.jsonl`);
  fs.appendFileSync(logFile, JSON.stringify({ ...entry, ts: new Date().toISOString() }) + '\n');
}

function run() {
  console.log(`[cron-healer] Reading ${JOBS_PATH}`);
  const data = JSON.parse(fs.readFileSync(JOBS_PATH, 'utf8'));
  const jobs = data.jobs;

  const sick = jobs.filter(j => (j.state?.consecutiveErrors || 0) >= ERROR_THRESHOLD);
  console.log(`[cron-healer] Found ${sick.length} job(s) with consecutiveErrors >= ${ERROR_THRESHOLD}`);

  if (sick.length === 0) {
    console.log('[cron-healer] All healthy. Nothing to do.');
    return { healed: 0, escalated: 0 };
  }

  let healed = 0, escalated = 0;

  for (const job of sick) {
    console.log(`\n[cron-healer] Diagnosing: "${job.name}" (errors: ${job.state.consecutiveErrors})`);
    console.log(`  lastError: ${job.state.lastError || '(empty)'}`);

    let fixed = false;
    for (const pattern of KNOWN_PATTERNS) {
      if (pattern.match(job)) {
        console.log(`  ✅ Matched pattern: ${pattern.id} - ${pattern.description}`);
        const diff = pattern.fix(job);
        job.state.consecutiveErrors = 0;
        log({ action: 'auto-fix', jobId: job.id, jobName: job.name, pattern: pattern.id, diff });
        console.log(`  🔧 Fixed! consecutiveErrors reset to 0`);
        healed++;
        fixed = true;
        break;
      }
    }

    if (!fixed) {
      console.log(`  ⚠️ No known pattern matched. Escalating.`);
      log({ action: 'escalate', jobId: job.id, jobName: job.name, lastError: job.state.lastError });
      escalated++;
    }
  }

  // Write back
  fs.writeFileSync(JOBS_PATH, JSON.stringify(data, null, 2) + '\n');
  console.log(`\n[cron-healer] Done. Healed: ${healed}, Escalated: ${escalated}`);
  return { healed, escalated };
}

if (require.main === module) {
  try {
    run();
  } catch (e) {
    console.error('[cron-healer] Fatal:', e.message);
    process.exit(1);
  }
}

module.exports = { run, KNOWN_PATTERNS };
