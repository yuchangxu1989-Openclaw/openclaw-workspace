'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

const LOG_DIR = path.join(__dirname);
const LOG_FILE = path.join(LOG_DIR, 'decisions.jsonl');
const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const RETAIN_DAYS = 7;
const VALID_PHASES = ['sensing', 'cognition', 'execution'];
const VALID_METHODS = ['llm', 'regex', 'rule_match', 'manual'];

// ─── Rotate Lock ───
let _rotating = false;
const _rotateBuffer = [];

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
    timestamp: entry.timestamp || new Date().toISOString(),
    phase: entry.phase || 'execution',
    component: entry.component || 'unknown',
    what: entry.what || '',
    why: entry.why || '',
    confidence: entry.confidence !== undefined ? entry.confidence : null,
    alternatives: entry.alternatives || [],
    input_summary: entry.input_summary || '',
    output_summary: entry.output_summary || '',
    decision_method: entry.decision_method || 'manual',
  };

  ensureDir();

  // Auto-rotate before write
  try {
    if (fs.existsSync(LOG_FILE)) {
      const stat = fs.statSync(LOG_FILE);
      if (stat.size >= MAX_SIZE) {
        rotate();
      }
    }
  } catch (_) { /* best effort */ }

  if (_rotating) {
    // Buffer writes during rotation to avoid losing data
    _rotateBuffer.push(JSON.stringify(record) + '\n');
  } else {
    fs.appendFileSync(LOG_FILE, JSON.stringify(record) + '\n', 'utf8');
  }
  return record;
}

/**
 * query({since, phase, component, limit}) - Query decisions
 * All filters optional. `since` is ISO8601 string or Date. Returns newest-first.
 */
function query(opts = {}) {
  if (!fs.existsSync(LOG_FILE)) return [];

  const { since, phase, component, limit } = opts;
  const sinceTime = since ? new Date(since).getTime() : 0;

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
    if (sinceTime && new Date(record.timestamp).getTime() < sinceTime) continue;
    if (phase && record.phase !== phase) continue;
    if (component && record.component !== component) continue;

    results.push(record);
  }

  // Newest first
  results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  if (limit && limit > 0) return results.slice(0, limit);
  return results;
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
 * rotate() - Log rotation
 * Renames current file with timestamp suffix. Cleans up files older than 7 days.
 */
function rotate() {
  ensureDir();
  _rotating = true;

  try {
    // Rotate current file
    if (fs.existsSync(LOG_FILE)) {
      const stat = fs.statSync(LOG_FILE);
      if (stat.size > 0) {
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const rotatedName = `decisions.${ts}.jsonl`;
        const rotatedPath = path.join(LOG_DIR, rotatedName);
        fs.renameSync(LOG_FILE, rotatedPath);
      }
    }
  } finally {
    _rotating = false;

    // Flush buffered writes to the new (empty) log file
    if (_rotateBuffer.length > 0) {
      const buffered = _rotateBuffer.splice(0);
      fs.appendFileSync(LOG_FILE, buffered.join(''), 'utf8');
    }
  }

  // Cleanup: remove rotated files older than RETAIN_DAYS
  const cutoff = Date.now() - RETAIN_DAYS * 24 * 60 * 60 * 1000;
  const files = fs.readdirSync(LOG_DIR);

  for (const f of files) {
    if (!f.startsWith('decisions.') || !f.endsWith('.jsonl')) continue;
    if (f === 'decisions.jsonl') continue; // skip active file

    const fpath = path.join(LOG_DIR, f);
    try {
      const fstat = fs.statSync(fpath);
      if (fstat.mtimeMs < cutoff) {
        fs.unlinkSync(fpath);
      }
    } catch (_) { /* best effort */ }
  }
}

module.exports = { log, query, summarize, rotate, LOG_FILE, VALID_PHASES, VALID_METHODS };
