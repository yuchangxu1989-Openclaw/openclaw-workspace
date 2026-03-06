#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = '/root/.openclaw/workspace';
const JOBS_FILE = path.join(ROOT, 'infrastructure/cron/jobs.json');
const ALERTS_FILE = path.join(ROOT, 'infrastructure/logs/alerts.jsonl');
const REPAIR_LOG = path.join(ROOT, 'infrastructure/logs/auto-repair-executions.jsonl');
const TASKS_FILE = path.join(ROOT, 'infrastructure/dispatcher/state/auto-repair-tasks.json');
const HANDLER_STATE_FILE = path.join(ROOT, 'infrastructure/resilience/handler-state.json');

function ensureDir(file) { fs.mkdirSync(path.dirname(file), { recursive: true }); }
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, data) {
  ensureDir(file);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
function appendJsonl(file, obj) {
  ensureDir(file);
  fs.appendFileSync(file, JSON.stringify(obj) + '\n');
}
function nowIso() { return new Date().toISOString(); }
function stableId(prefix, seed) {
  return `${prefix}_${crypto.createHash('md5').update(seed).digest('hex').slice(0, 12)}`;
}

function loadTasks() {
  return readJson(TASKS_FILE, { version: '1.0.0', updatedAt: null, tasks: [] });
}
function saveTasks(tasks) {
  tasks.updatedAt = nowIso();
  writeJson(TASKS_FILE, tasks);
}

function upsertTask(task) {
  const store = loadTasks();
  const idx = store.tasks.findIndex(t => t.id === task.id);
  if (idx >= 0) store.tasks[idx] = task;
  else store.tasks.push(task);
  saveTasks(store);
}

function resolveCronFindings() {
  const data = readJson(JOBS_FILE, { jobs: [] });
  const findings = [];
  let changed = false;

  for (const job of data.jobs || []) {
    const state = job.state || {};
    const consecutiveErrors = Number(state.consecutiveErrors || 0);
    const lastStatus = state.lastStatus || state.lastRunStatus || job.lastStatus || null;
    const lastError = state.lastError || job.lastError || '';
    const enabled = job.enabled !== false;

    if (!enabled && (consecutiveErrors > 0 || String(lastStatus).toLowerCase() === 'error' || String(lastError).trim())) {
      const before = { consecutiveErrors, lastStatus, lastError };
      job.state = { ...state, consecutiveErrors: 0, lastStatus: 'suppressed_disabled', lastRunStatus: 'suppressed_disabled', lastError: '' };
      if ('lastError' in job) job.lastError = '';
      changed = true;
      findings.push({
        kind: 'cron.disabled_stale_error',
        severity: 'warning',
        entityType: 'cron_job',
        entityId: job.name,
        rootCause: 'disabled_job_with_historical_error_state',
        autoRepairable: true,
        repairAction: 'clear_disabled_job_error_state',
        verification: { status: 'passed', after: job.state },
        details: { before, after: job.state }
      });
      continue;
    }

    if (enabled && consecutiveErrors >= 3) {
      findings.push({
        kind: 'cron.active_consecutive_errors',
        severity: consecutiveErrors >= 5 ? 'critical' : 'error',
        entityType: 'cron_job',
        entityId: job.name,
        rootCause: 'active_job_repeated_failure',
        autoRepairable: false,
        repairAction: 'create_repair_task_for_owner',
        verification: { status: 'pending' },
        details: { consecutiveErrors, lastStatus, lastError: String(lastError).slice(0, 500) }
      });
    }
  }

  if (changed) writeJson(JOBS_FILE, data);
  return findings;
}

function resolveHandlerFindings() {
  const state = readJson(HANDLER_STATE_FILE, {});
  const findings = [];
  for (const [handlerName, health] of Object.entries(state || {})) {
    if (health && health.disabled === true) {
      findings.push({
        kind: 'dispatcher.handler_disabled',
        severity: 'error',
        entityType: 'dispatcher_handler',
        entityId: handlerName,
        rootCause: 'handler_circuit_breaker_open',
        autoRepairable: false,
        repairAction: 'create_repair_task_for_handler',
        verification: { status: 'pending' },
        details: {
          consecutiveFailures: health.consecutiveFailures || 0,
          lastError: health.lastError || '',
          disabledAt: health.disabledAt || null
        }
      });
    }
  }
  return findings;
}

function createRepairTask(finding) {
  const id = stableId('repair', `${finding.kind}:${finding.entityType}:${finding.entityId}`);
  return {
    id,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    status: 'open',
    source: 'auto-rootcause-repair',
    title: `[AutoRepair] ${finding.entityType}:${finding.entityId}`,
    finding,
    runbook: {
      diagnose: [
        `检查 ${finding.entityType}=${finding.entityId} 当前状态`,
        `确认根因 ${finding.rootCause}`
      ],
      repair: [finding.repairAction],
      verify: [`验证 ${finding.entityId} 告警恢复/不再重复触发`]
    }
  };
}

function syncAlerts(findings) {
  const alerts = [];
  for (const finding of findings) {
    const alertId = stableId('alert', `${finding.kind}:${finding.entityId}`);
    const taskId = !finding.autoRepairable ? stableId('repair', `${finding.kind}:${finding.entityType}:${finding.entityId}`) : null;
    alerts.push({
      timestamp: nowIso(),
      id: alertId,
      handler: 'auto-rootcause-repair',
      severity: finding.severity,
      eventType: finding.kind,
      eventId: stableId('evt', `${finding.kind}:${finding.entityId}:${Date.now()}`),
      ruleId: 'rule.monitor.auto-rootcause-repair-001',
      ruleName: 'monitor-auto-rootcause-repair',
      message: `${finding.kind} => ${finding.rootCause}`,
      payload: {
        entityType: finding.entityType,
        entityId: finding.entityId,
        autoRepairable: finding.autoRepairable,
        repairAction: finding.repairAction,
        verification: finding.verification,
        taskId
      },
      acknowledged: finding.autoRepairable,
      cleared: finding.autoRepairable && finding.verification?.status === 'passed'
    });
  }
  for (const alert of alerts) appendJsonl(ALERTS_FILE, alert);
}

function main() {
  const findings = [
    ...resolveCronFindings(),
    ...resolveHandlerFindings()
  ];

  for (const finding of findings) {
    if (!finding.autoRepairable) {
      upsertTask(createRepairTask(finding));
    }
    appendJsonl(REPAIR_LOG, {
      timestamp: nowIso(),
      finding,
      autoRepaired: finding.autoRepairable,
      verification: finding.verification
    });
  }

  if (findings.length) syncAlerts(findings);

  const summary = {
    timestamp: nowIso(),
    findings: findings.length,
    autoRepaired: findings.filter(f => f.autoRepairable).length,
    tasksCreated: findings.filter(f => !f.autoRepairable).length,
    breakdown: findings.map(f => ({ kind: f.kind, entityId: f.entityId, autoRepairable: f.autoRepairable }))
  };
  console.log(JSON.stringify(summary, null, 2));
}

main();
