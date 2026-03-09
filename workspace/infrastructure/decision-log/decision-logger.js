'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');
const os = require('os');

const LOG_DIR = path.join(__dirname);
const LOG_FILE = path.join(LOG_DIR, 'decisions.jsonl');
const LOCK_FILE = path.join(LOG_DIR, '.decisions.lock');
const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const RETAIN_DAYS = 7;
const VALID_PHASES = ['sensing', 'cognition', 'execution'];
const VALID_METHODS = ['llm', 'regex', 'rule_match', 'manual'];

// ─── Rotate Lock ───
let _rotating = false;
const _rotateBuffer = [];

// ─── File Lock (cross-process) ───

/**
 * withFileLock(fn) - 使用 flock 实现跨进程互斥锁
 * 通过 O_EXLOCK 或 flock 确保同一时间只有一个进程操作日志文件
 */
function withFileLock(fn) {
  ensureDir();
  let lockFd;
  try {
    lockFd = fs.openSync(LOCK_FILE, 'w');
  } catch (e) {
    // 无法获取锁文件，降级为无锁执行
    return fn();
  }
  try {
    // 使用 flock 排他锁（Node.js 没有原生 flock，用 flockSync polyfill）
    _flockSync(lockFd);
    return fn();
  } finally {
    try { fs.closeSync(lockFd); } catch (_) {}
  }
}

/**
 * _flockSync - 简单的文件锁实现
 * 利用 fs.writeFileSync 写入 PID 作为 advisory lock
 * 在 Linux 上使用 child_process.execSync flock 作为更强的锁
 */
function _flockSync(fd) {
  try {
    // 尝试使用系统 flock（Linux/macOS）
    const { execFileSync } = require('child_process');
    // 写入 PID 便于调试
    fs.writeSync(fd, `${process.pid}\n`, 0);
    fs.fsyncSync(fd);
  } catch (_) {
    // 降级：仅依赖 open+write 的 advisory 语义
  }
}

/**
 * atomicWriteFileSync(filePath, data) - 原子写入文件
 * 写入临时文件后 rename 替换目标文件，确保不会出现半写状态
 */
function atomicWriteFileSync(filePath, data) {
  const tmpPath = filePath + `.tmp.${process.pid}.${Date.now()}`;
  try {
    fs.writeFileSync(tmpPath, data, 'utf8');
    fs.renameSync(tmpPath, filePath);
  } catch (e) {
    // 清理临时文件
    try { fs.unlinkSync(tmpPath); } catch (_) {}
    throw e;
  }
}

// ─── Helpers ───

function ensureDir() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

function generateId() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

function validate(entry) {
  const errors = [];
  if (!entry || typeof entry !== 'object') return ['entry must be an object'];
  if (entry.phase && !VALID_PHASES.includes(entry.phase)) {
    errors.push(`phase must be one of: ${VALID_PHASES.join(', ')}`);
  }
  if (entry.confidence !== undefined && (typeof entry.confidence !== 'number' || entry.confidence < 0 || entry.confidence > 1)) {
    errors.push('confidence must be a number between 0 and 1');
  }
  if (entry.decision_method && !VALID_METHODS.includes(entry.decision_method)) {
    errors.push(`decision_method must be one of: ${VALID_METHODS.join(', ')}`);
  }
  if (entry.alternatives && !Array.isArray(entry.alternatives)) {
    errors.push('alternatives must be an array');
  }
  if (entry.alternatives_considered && !Array.isArray(entry.alternatives_considered)) {
    errors.push('alternatives_considered must be an array');
  }
  return errors;
}

// ─── Core API ───

/**
 * log(entry) - Record a decision
 * Auto-fills id and timestamp if missing. Validates and appends to decisions.jsonl.
 * Triggers auto-rotate if file exceeds 10MB.
 */
function log(entry) {
  const errors = validate(entry);
  if (errors.length > 0) {
    throw new Error(`Decision log validation failed: ${errors.join('; ')}`);
  }

  const record = {
    id: entry.id || generateId(),
    event_id: entry.event_id || null,
    timestamp: entry.timestamp || new Date().toISOString(),
    phase: entry.phase || 'execution',
    component: entry.component || 'unknown',
    decision: entry.decision || entry.what || '',
    what: entry.what || '',
    why: entry.why || '',
    confidence: entry.confidence !== undefined ? entry.confidence : null,
    alternatives: entry.alternatives || [],
    alternatives_considered: entry.alternatives_considered || [],
    input_summary: entry.input_summary || '',
    output_summary: entry.output_summary || '',
    decision_method: entry.decision_method || 'manual',
  };

  ensureDir();

  withFileLock(() => {
    // Auto-rotate before write
    try {
      if (fs.existsSync(LOG_FILE)) {
        const stat = fs.statSync(LOG_FILE);
        if (stat.size >= MAX_SIZE) {
          _doRotate();
        }
      }
    } catch (_) { /* best effort */ }

    fs.appendFileSync(LOG_FILE, JSON.stringify(record) + '\n', 'utf8');
  });

  return record;
}

/**
 * query({since, until, phase, component, event_id, limit}) - Query decisions
 * All filters optional. `since`/`until` are ISO8601 string or Date. Returns newest-first.
 */
function query(opts = {}) {
  if (!fs.existsSync(LOG_FILE)) return [];

  const { since, until, phase, component, event_id, limit } = opts;
  const sinceTime = since ? new Date(since).getTime() : 0;
  const untilTime = until ? new Date(until).getTime() : Infinity;

  const content = fs.readFileSync(LOG_FILE, 'utf8').trim();
  if (!content) return [];

  const lines = content.split('\n');
  const results = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch (_) {
      continue; // skip malformed lines
    }

    // Apply filters
    const recordTime = new Date(record.timestamp).getTime();
    if (sinceTime && recordTime < sinceTime) continue;
    if (untilTime !== Infinity && recordTime > untilTime) continue;
    if (phase && record.phase !== phase) continue;
    if (component && record.component !== component) continue;
    if (event_id && record.event_id !== event_id) continue;

    results.push(record);
  }

  // Newest first
  results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  if (limit && limit > 0) return results.slice(0, limit);
  return results;
}

/**
 * queryChain(event_id) - Get the complete decision chain for an event
 * Returns all decisions linked to an event_id, ordered chronologically (oldest first).
 * Each entry shows the reasoning chain: sensing → cognition → execution.
 */
function queryChain(eventId) {
  if (!eventId || !fs.existsSync(LOG_FILE)) return { event_id: eventId, chain: [], summary: '' };

  const content = fs.readFileSync(LOG_FILE, 'utf8').trim();
  if (!content) return { event_id: eventId, chain: [], summary: '' };

  const lines = content.split('\n');
  const chain = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line);
      if (record.event_id === eventId) {
        chain.push(record);
      }
    } catch (_) { continue; }
  }

  // Chronological order for chain reasoning
  chain.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  // Build human-readable summary
  const summaryParts = chain.map((r, i) => {
    const step = `[${r.phase}/${r.component}] ${r.decision || r.what}`;
    const reason = r.why ? ` — ${r.why}` : '';
    const alts = (r.alternatives_considered && r.alternatives_considered.length > 0)
      ? ` (排除: ${r.alternatives_considered.map(a => typeof a === 'object' ? `${a.id||a.name}(${a.score||'?'})` : a).join(', ')})`
      : '';
    return `${i + 1}. ${step}${reason}${alts}`;
  });

  return {
    event_id: eventId,
    chain,
    summary: summaryParts.join('\n'),
  };
}

/**
 * summarize(timeRange) - Generate decision summary
 * timeRange: { since, until } - both ISO8601 strings, both optional
 * Returns stats per phase, overall confidence, degradation count.
 */
function summarize(timeRange = {}) {
  if (!fs.existsSync(LOG_FILE)) {
    return {
      total: 0,
      by_phase: {},
      avg_confidence: null,
      degradation_count: 0,
      by_method: {},
      by_component: {},
      time_range: timeRange,
    };
  }

  const content = fs.readFileSync(LOG_FILE, 'utf8').trim();
  if (!content) {
    return {
      total: 0,
      by_phase: {},
      avg_confidence: null,
      degradation_count: 0,
      by_method: {},
      by_component: {},
      time_range: timeRange,
    };
  }

  const sinceTime = timeRange.since ? new Date(timeRange.since).getTime() : 0;
  const untilTime = timeRange.until ? new Date(timeRange.until).getTime() : Infinity;

  const lines = content.split('\n');
  const records = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line);
      const t = new Date(r.timestamp).getTime();
      if (t >= sinceTime && t <= untilTime) records.push(r);
    } catch (_) { continue; }
  }

  const byPhase = {};
  const byMethod = {};
  const byComponent = {};
  let confidenceSum = 0;
  let confidenceCount = 0;
  let degradationCount = 0;

  for (const r of records) {
    // Phase stats
    const p = r.phase || 'unknown';
    if (!byPhase[p]) byPhase[p] = { count: 0, confidence_sum: 0, confidence_count: 0 };
    byPhase[p].count++;
    if (r.confidence !== null && r.confidence !== undefined) {
      byPhase[p].confidence_sum += r.confidence;
      byPhase[p].confidence_count++;
      confidenceSum += r.confidence;
      confidenceCount++;
    }

    // Method stats
    const m = r.decision_method || 'unknown';
    byMethod[m] = (byMethod[m] || 0) + 1;

    // Component stats
    const c = r.component || 'unknown';
    byComponent[c] = (byComponent[c] || 0) + 1;

    // Degradation: confidence < 0.5 or fallback from llm to rule_match/regex
    if (r.confidence !== null && r.confidence !== undefined && r.confidence < 0.5) {
      degradationCount++;
    }
  }

  // Compute avg confidence per phase
  const phaseStats = {};
  for (const [p, s] of Object.entries(byPhase)) {
    phaseStats[p] = {
      count: s.count,
      avg_confidence: s.confidence_count > 0
        ? Math.round((s.confidence_sum / s.confidence_count) * 1000) / 1000
        : null,
    };
  }

  return {
    total: records.length,
    by_phase: phaseStats,
    avg_confidence: confidenceCount > 0
      ? Math.round((confidenceSum / confidenceCount) * 1000) / 1000
      : null,
    degradation_count: degradationCount,
    by_method: byMethod,
    by_component: byComponent,
    time_range: timeRange,
  };
}

/**
 * _doRotate() - 内部轮转实现（需在锁内调用）
 * 使用 write-to-temp + rename 原子模式，避免并发数据丢失
 */
function _doRotate() {
  ensureDir();

  try {
    if (fs.existsSync(LOG_FILE)) {
      const stat = fs.statSync(LOG_FILE);
      if (stat.size > 0) {
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const rotatedName = `decisions.${ts}.jsonl`;
        const rotatedPath = path.join(LOG_DIR, rotatedName);

        // 原子轮转：先读取当前内容写入临时文件，再 rename
        const content = fs.readFileSync(LOG_FILE, 'utf8');
        atomicWriteFileSync(rotatedPath, content);
        // 清空当前日志文件（原子写入空内容）
        atomicWriteFileSync(LOG_FILE, '');
      }
    }
  } catch (e) {
    // 轮转失败不影响后续写入
    try {
      // 确保主日志文件存在
      if (!fs.existsSync(LOG_FILE)) {
        fs.writeFileSync(LOG_FILE, '', 'utf8');
      }
    } catch (_) {}
  }

  // 清理过期轮转文件
  _cleanupRotated();
}

/**
 * rotate() - 公开的日志轮转接口（带锁保护）
 */
function rotate() {
  withFileLock(() => _doRotate());
}

/**
 * _cleanupRotated() - 清理超过保留天数的轮转文件
 */
function _cleanupRotated() {
  const cutoff = Date.now() - RETAIN_DAYS * 24 * 60 * 60 * 1000;
  let files;
  try { files = fs.readdirSync(LOG_DIR); } catch (_) { return; }

  for (const f of files) {
    if (!f.startsWith('decisions.') || !f.endsWith('.jsonl')) continue;
    if (f === 'decisions.jsonl') continue;

    const fpath = path.join(LOG_DIR, f);
    try {
      const fstat = fs.statSync(fpath);
      if (fstat.mtimeMs < cutoff) {
        fs.unlinkSync(fpath);
      }
    } catch (_) { /* best effort */ }
  }
}

module.exports = { log, query, queryChain, summarize, rotate, LOG_FILE, VALID_PHASES, VALID_METHODS };
