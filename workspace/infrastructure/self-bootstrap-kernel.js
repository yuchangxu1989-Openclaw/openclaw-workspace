'use strict';

/**
 * self-bootstrap-kernel.js — 最小生存内核
 *
 * 目标：
 * 1. 在“失忆/无用户输入”状态下，仍可完成最小自举
 * 2. 固化 capability anchor / bootstrap / memory / dispatcher / RCA / eval 六件套
 * 3. 输出 machine-readable 状态，供上层调度器与 handler 复用
 */

const fs = require('fs');
const path = require('path');
const { DispatchLayer } = require('./dispatcher/dispatch-layer');
const { ensureCapabilityAnchorLoaded } = require('./session-anchor-bootstrap');

const WORKSPACE = '/root/.openclaw/workspace';
const REPORTS_DIR = path.join(WORKSPACE, 'reports');
const LOGS_DIR = path.join(WORKSPACE, 'infrastructure', 'logs');
const MEMORY_DIR = path.join(WORKSPACE, 'memory');
const STATE_DIR = path.join(WORKSPACE, 'infrastructure', 'self-bootstrap');
const KERNEL_STATUS_FILE = path.join(STATE_DIR, 'kernel-status.json');
const KERNEL_LOG_FILE = path.join(LOGS_DIR, 'self-bootstrap-kernel.jsonl');
const MEMORY_DIGEST_FILE = path.join(MEMORY_DIR, 'bootstrap-memory-digest.json');
const RCA_CASES_FILE = path.join(REPORTS_DIR, 'self-bootstrap-rca-cases.json');
const EVAL_REPORT_FILE = path.join(REPORTS_DIR, 'self-bootstrap-eval.json');

const DEFAULT_ANCHOR_FILES = [
  'CAPABILITY-ANCHOR.md',
  'MEMORY.md',
  'SOUL.md',
  'AGENTS.md',
  'TOOLS.md',
  'PROJECT-TRACKER.md',
  'infrastructure/system-bootstrap.js',
  'infrastructure/session-anchor-bootstrap.js',
  'infrastructure/event-bus/handler-executor.js',
  'infrastructure/dispatcher/dispatch-layer.js',
  'infrastructure/event-bus/handlers/memory-loss-recovery.js',
  'infrastructure/event-bus/handlers/self-correction-root-cause.js',
  'infrastructure/event-bus/handlers/memory-digest-must-verify.js',
  'infrastructure/event-bus/handlers/eval-quality-check.js',
];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function writeJson(file, data) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function appendJsonl(file, data) {
  ensureDir(path.dirname(file));
  fs.appendFileSync(file, `${JSON.stringify(data)}\n`, 'utf8');
}

function rel(p) {
  return path.relative(WORKSPACE, p) || '.';
}

function fileSnapshot(relPath) {
  const abs = path.join(WORKSPACE, relPath);
  if (!fs.existsSync(abs)) {
    return { path: relPath, exists: false, size: 0, mtimeMs: 0 };
  }
  const stat = fs.statSync(abs);
  return {
    path: relPath,
    exists: true,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
  };
}

function buildCapabilityAnchorSnapshot() {
  const anchor = ensureCapabilityAnchorLoaded({ source: 'self-bootstrap-kernel' });
  return {
    path: rel(anchor.path),
    size: anchor.size,
    cacheHit: anchor.cacheHit,
    loadedAt: anchor.loadedAt,
    preview: anchor.preview,
  };
}

function buildBootstrapMemoryDigest() {
  const files = DEFAULT_ANCHOR_FILES.map(fileSnapshot);
  const existing = files.filter(item => item.exists);
  const digest = {
    generatedAt: new Date().toISOString(),
    type: 'self-bootstrap-memory-digest',
    workspace: WORKSPACE,
    files,
    survivalKernel: {
      anchorReady: existing.some(item => item.path === 'CAPABILITY-ANCHOR.md'),
      memoryReady: existing.some(item => item.path === 'MEMORY.md'),
      dispatcherReady: existing.some(item => item.path === 'infrastructure/dispatcher/dispatch-layer.js'),
      rcaReady: existing.some(item => item.path === 'infrastructure/event-bus/handlers/self-correction-root-cause.js'),
      evalReady: existing.some(item => item.path === 'infrastructure/event-bus/handlers/eval-quality-check.js'),
    },
    summary: {
      tracked: files.length,
      existing: existing.length,
      missing: files.length - existing.length,
    },
  };
  writeJson(MEMORY_DIGEST_FILE, digest);
  return digest;
}

function scheduleAutonomyTasks() {
  const layer = new DispatchLayer();
  const tasks = [
    {
      taskId: 'sbk-anchor-refresh',
      title: 'refresh-capability-anchor',
      source: 'self-bootstrap-kernel',
      priority: 'high',
      payload: { objective: 'load capability anchor into working memory' },
    },
    {
      taskId: 'sbk-memory-digest-verify',
      title: 'verify-bootstrap-memory-digest',
      source: 'self-bootstrap-kernel',
      priority: 'high',
      payload: { objective: 'verify survival memory files exist on disk', file: rel(MEMORY_DIGEST_FILE) },
    },
    {
      taskId: 'sbk-eval-sweep',
      title: 'run-self-bootstrap-eval-sweep',
      source: 'self-bootstrap-kernel',
      priority: 'normal',
      payload: { objective: 'check bootstrap kernel health and handler coverage' },
    },
  ];

  const stateBefore = layer.load();
  const knownIds = new Set([
    ...stateBefore.queue.map(t => t.taskId),
    ...stateBefore.running.map(t => t.taskId),
    ...stateBefore.history.map(h => h.taskId).filter(Boolean),
  ]);

  const enqueued = [];
  for (const task of tasks) {
    if (knownIds.has(task.taskId)) continue;
    enqueued.push(layer.enqueue(task));
  }
  const tick = layer.tick();
  return {
    enqueued: enqueued.map(t => ({ taskId: t.taskId, title: t.title })),
    dispatched: tick.dispatched,
    queueDepth: tick.queueDepth,
    runningCount: tick.runningCount,
    idleSlots: tick.idleSlots,
  };
}

function buildRCACases(digest) {
  const cases = [];
  if (!digest.survivalKernel.anchorReady) {
    cases.push({
      id: 'rca.anchor.missing',
      symptom: 'capability anchor missing',
      rootCause: 'capability_anchor_absent',
      expectedFix: 'restore CAPABILITY-ANCHOR.md and preload into session cache',
      severity: 'critical',
    });
  }
  if (!digest.survivalKernel.memoryReady) {
    cases.push({
      id: 'rca.memory.missing',
      symptom: 'bootstrap memory unavailable',
      rootCause: 'memory_digest_absent',
      expectedFix: 'rebuild memory digest from code anchors',
      severity: 'critical',
    });
  }
  if (!digest.survivalKernel.dispatcherReady) {
    cases.push({
      id: 'rca.dispatcher.missing',
      symptom: 'no local dispatcher substrate',
      rootCause: 'dispatch_kernel_absent',
      expectedFix: 'restore dispatch-layer and re-enqueue autonomy tasks',
      severity: 'critical',
    });
  }
  if (!digest.survivalKernel.rcaReady) {
    cases.push({
      id: 'rca.rca.missing',
      symptom: 'root cause handler missing',
      rootCause: 'self_repair_path_absent',
      expectedFix: 'restore self-correction-root-cause handler',
      severity: 'high',
    });
  }
  if (!digest.survivalKernel.evalReady) {
    cases.push({
      id: 'rca.eval.missing',
      symptom: 'no eval gate for bootstrap kernel',
      rootCause: 'eval_gate_absent',
      expectedFix: 'restore eval-quality-check handler and self-bootstrap eval report',
      severity: 'high',
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    total: cases.length,
    cases,
  };
  writeJson(RCA_CASES_FILE, report);
  return report;
}

function buildEvalReport({ anchor, digest, dispatch }) {
  const checks = [
    { name: 'anchor_loaded', pass: !!anchor && anchor.size > 0 },
    { name: 'memory_digest_written', pass: fs.existsSync(MEMORY_DIGEST_FILE) },
    { name: 'dispatcher_available', pass: digest.survivalKernel.dispatcherReady },
    { name: 'rca_handler_available', pass: digest.survivalKernel.rcaReady },
    { name: 'eval_handler_available', pass: digest.survivalKernel.evalReady },
    { name: 'autonomy_tasks_present', pass: (dispatch.enqueued.length + dispatch.dispatched.length + dispatch.runningCount) > 0 },
  ];

  const passCount = checks.filter(item => item.pass).length;
  const report = {
    generatedAt: new Date().toISOString(),
    score: Number((passCount / checks.length).toFixed(4)),
    passCount,
    totalChecks: checks.length,
    checks,
    verdict: passCount === checks.length ? 'pass' : (passCount >= 4 ? 'partial' : 'fail'),
  };
  writeJson(EVAL_REPORT_FILE, report);
  return report;
}

function runSelfBootstrapKernel() {
  ensureDir(REPORTS_DIR);
  ensureDir(LOGS_DIR);
  ensureDir(MEMORY_DIR);
  ensureDir(STATE_DIR);

  const anchor = buildCapabilityAnchorSnapshot();
  const digest = buildBootstrapMemoryDigest();
  const dispatch = scheduleAutonomyTasks();
  const rca = buildRCACases(digest);
  const evalReport = buildEvalReport({ anchor, digest, dispatch });

  const status = {
    generatedAt: new Date().toISOString(),
    kernel: 'self-bootstrap-kernel',
    anchor,
    memoryDigest: rel(MEMORY_DIGEST_FILE),
    dispatch,
    rca: {
      file: rel(RCA_CASES_FILE),
      total: rca.total,
    },
    eval: {
      file: rel(EVAL_REPORT_FILE),
      verdict: evalReport.verdict,
      score: evalReport.score,
    },
  };

  writeJson(KERNEL_STATUS_FILE, status);
  appendJsonl(KERNEL_LOG_FILE, status);
  return status;
}

if (require.main === module) {
  const status = runSelfBootstrapKernel();
  console.log(JSON.stringify(status, null, 2));
}

module.exports = {
  runSelfBootstrapKernel,
  buildBootstrapMemoryDigest,
  buildRCACases,
  buildEvalReport,
  scheduleAutonomyTasks,
};
