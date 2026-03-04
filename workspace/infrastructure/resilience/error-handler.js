'use strict';

/**
 * Error Handler — L3 错误分类与恢复策略
 * 
 * 三类错误，三种策略：
 *   1. Transient（网络超时、API限流）→ 指数退避重试，最多3次
 *   2. Permanent（配置缺失、文件损坏）→ 立即失败+告警+降级
 *   3. Partial（LLM返回不完整）    → 尝试解析+降级到regex
 * 
 * CommonJS · 纯 Node.js · 零外部依赖
 * @module resilience/error-handler
 */

const fs = require('fs');
const path = require('path');

// ── Decision Logger (optional) ──────────────────────────────────
let _decisionLogger = null;
try {
  _decisionLogger = require('../decision-log/decision-logger');
} catch (_) {}

// ── Constants ───────────────────────────────────────────────────
const ERROR_TYPES = Object.freeze({
  TRANSIENT: 'transient',
  PERMANENT: 'permanent',
  PARTIAL: 'partial',
  UNKNOWN: 'unknown',
});

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;   // 500ms base for exponential backoff
const MAX_DELAY_MS = 15000;  // cap at 15s

const ALERT_LOG_FILE = path.join(__dirname, 'alerts.jsonl');

// ── Transient error patterns ────────────────────────────────────
const TRANSIENT_PATTERNS = [
  /timeout/i,
  /ETIMEDOUT/,
  /ECONNRESET/,
  /ECONNREFUSED/,
  /ENOTFOUND/,
  /ENETUNREACH/,
  /socket hang up/i,
  /rate.?limit/i,
  /429/,
  /503/,
  /502/,
  /too many requests/i,
  /network/i,
  /EPIPE/,
  /EAI_AGAIN/,
];

// ── Permanent error patterns ────────────────────────────────────
const PERMANENT_PATTERNS = [
  /ENOENT/,
  /EACCES/,
  /EPERM/,
  /SyntaxError.*JSON/i,
  /invalid.*config/i,
  /missing.*required/i,
  /401/,
  /403/,
  /not.?found.*config/i,
  /cannot.*read.*property/i,
  /is not a function/i,
  /module.*not.*found/i,
];

// ── Partial error patterns ──────────────────────────────────────
const PARTIAL_PATTERNS = [
  /unexpected end of JSON/i,
  /incomplete/i,
  /truncated/i,
  /partial/i,
  /unterminated/i,
  /content_filter/i,
  /finish_reason.*length/i,
];

// ── Error Classification ────────────────────────────────────────

/**
 * Classify an error into transient/permanent/partial/unknown.
 * 
 * @param {Error|string|object} error - The error to classify
 * @returns {{ type: string, message: string, code: string|null }}
 */
function classify(error) {
  const msg = _extractMessage(error);
  const code = _extractCode(error);
  const statusCode = _extractStatusCode(error);

  // Check status code first (most reliable)
  if (statusCode) {
    if (statusCode === 429 || statusCode === 502 || statusCode === 503 || statusCode === 504) {
      return { type: ERROR_TYPES.TRANSIENT, message: msg, code };
    }
    if (statusCode === 401 || statusCode === 403 || statusCode === 404) {
      return { type: ERROR_TYPES.PERMANENT, message: msg, code };
    }
  }

  // Pattern matching
  for (const pattern of TRANSIENT_PATTERNS) {
    if (pattern.test(msg) || (code && pattern.test(code))) {
      return { type: ERROR_TYPES.TRANSIENT, message: msg, code };
    }
  }

  for (const PARTIAL_PATTERN of PARTIAL_PATTERNS) {
    if (PARTIAL_PATTERN.test(msg)) {
      return { type: ERROR_TYPES.PARTIAL, message: msg, code };
    }
  }

  for (const pattern of PERMANENT_PATTERNS) {
    if (pattern.test(msg) || (code && pattern.test(code))) {
      return { type: ERROR_TYPES.PERMANENT, message: msg, code };
    }
  }

  return { type: ERROR_TYPES.UNKNOWN, message: msg, code };
}

// ── Retry with Exponential Backoff ──────────────────────────────

/**
 * Execute a function with exponential backoff retry for transient errors.
 * 
 * @param {Function} fn - Async function to execute (can return promise)
 * @param {object} [options] - Options
 * @param {number} [options.maxRetries=3] - Maximum retry attempts
 * @param {number} [options.baseDelayMs=500] - Base delay in ms
 * @param {number} [options.maxDelayMs=15000] - Maximum delay cap
 * @param {string} [options.context='unknown'] - Context label for logging
 * @param {Function} [options.onRetry] - Called before each retry (attempt, error, delayMs)
 * @returns {Promise<{ result: any, attempts: number, errors: Array }>}
 */
async function withRetry(fn, options = {}) {
  const maxRetries = options.maxRetries ?? MAX_RETRIES;
  const baseDelay = options.baseDelayMs ?? BASE_DELAY_MS;
  const maxDelay = options.maxDelayMs ?? MAX_DELAY_MS;
  const context = options.context || 'unknown';
  const onRetry = options.onRetry || null;

  const errors = [];

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      return { result, attempts: attempt, errors };
    } catch (err) {
      const classified = classify(err);
      errors.push({ attempt, type: classified.type, message: classified.message, timestamp: Date.now() });

      // Only retry transient errors (and unknowns on first retry)
      if (classified.type === ERROR_TYPES.PERMANENT) {
        _logAlert('permanent_error', { context, error: classified.message, attempt });
        throw new PermanentError(classified.message, err);
      }

      if (classified.type === ERROR_TYPES.PARTIAL) {
        // Return the error for caller to attempt partial recovery
        throw new PartialError(classified.message, err);
      }

      if (attempt >= maxRetries) {
        _logAlert('retry_exhausted', { context, attempts: maxRetries, lastError: classified.message });
        throw new RetryExhaustedError(
          `Failed after ${maxRetries} attempts: ${classified.message}`,
          errors
        );
      }

      // Exponential backoff with jitter
      const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
      const jitter = Math.floor(Math.random() * delay * 0.3); // 30% jitter
      const actualDelay = delay + jitter;

      if (onRetry) {
        try { onRetry(attempt, err, actualDelay); } catch (_) {}
      }

      _logDecision('retry', { context, attempt, delay: actualDelay, errorType: classified.type });

      await _sleep(actualDelay);
    }
  }
}

// ── Degradation Strategy ────────────────────────────────────────

/**
 * Execute primary function, falling back to degraded function on failure.
 * 
 * @param {Function} primaryFn - Primary async function
 * @param {Function} fallbackFn - Fallback async function
 * @param {object} [options] - Options
 * @param {string} [options.context='unknown'] - Context label
 * @param {boolean} [options.retryPrimary=true] - Whether to retry primary before fallback
 * @returns {Promise<{ result: any, degraded: boolean, error?: string }>}
 */
async function withDegradation(primaryFn, fallbackFn, options = {}) {
  const context = options.context || 'unknown';
  const retryPrimary = options.retryPrimary !== false;

  try {
    if (retryPrimary) {
      const { result } = await withRetry(primaryFn, { ...options, maxRetries: 2 });
      return { result, degraded: false };
    } else {
      const result = await primaryFn();
      return { result, degraded: false };
    }
  } catch (primaryErr) {
    _logAlert('degradation', { context, primaryError: primaryErr.message });
    _logDecision('degradation', { context, primaryError: primaryErr.message });

    try {
      const result = await fallbackFn(primaryErr);
      return { result, degraded: true, error: primaryErr.message };
    } catch (fallbackErr) {
      _logAlert('degradation_failed', {
        context,
        primaryError: primaryErr.message,
        fallbackError: fallbackErr.message,
      });
      throw new DegradationError(
        `Both primary and fallback failed: ${primaryErr.message} / ${fallbackErr.message}`,
        primaryErr,
        fallbackErr
      );
    }
  }
}

// ── Partial Response Recovery ───────────────────────────────────

/**
 * Attempt to parse a partial/incomplete LLM response.
 * Falls back to regex extraction if JSON parsing fails.
 * 
 * @param {string} rawResponse - Raw response string (possibly incomplete)
 * @param {object} [options] - Options
 * @param {RegExp[]} [options.extractPatterns] - Regex patterns to try for extraction
 * @returns {{ parsed: object|null, extracted: string[], method: string }}
 */
function recoverPartialResponse(rawResponse, options = {}) {
  if (!rawResponse || typeof rawResponse !== 'string') {
    return { parsed: null, extracted: [], method: 'none' };
  }

  // Attempt 1: Full JSON parse
  try {
    const parsed = JSON.parse(rawResponse);
    return { parsed, extracted: [], method: 'json_full' };
  } catch (_) {}

  // Attempt 2: Fix common truncation issues
  const fixed = _tryFixTruncatedJson(rawResponse);
  if (fixed) {
    try {
      const parsed = JSON.parse(fixed);
      return { parsed, extracted: [], method: 'json_fixed' };
    } catch (_) {}
  }

  // Attempt 3: Extract JSON objects from the string
  const jsonObjects = _extractJsonObjects(rawResponse);
  if (jsonObjects.length > 0) {
    return { parsed: jsonObjects[0], extracted: jsonObjects.map(o => JSON.stringify(o)), method: 'json_extracted' };
  }

  // Attempt 4: Regex extraction fallback
  const patterns = options.extractPatterns || [
    /(?:intent|action|type)\s*[:=]\s*["']([^"']+)["']/gi,
    /(?:result|output|answer)\s*[:=]\s*["']([^"']+)["']/gi,
    /\{[^{}]*\}/g,
  ];

  const extracted = [];
  for (const pattern of patterns) {
    const matches = rawResponse.match(pattern);
    if (matches) {
      extracted.push(...matches);
    }
  }

  return { parsed: null, extracted, method: extracted.length > 0 ? 'regex' : 'none' };
}

// ── Custom Error Types ──────────────────────────────────────────

class PermanentError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'PermanentError';
    this.type = ERROR_TYPES.PERMANENT;
    this.cause = cause;
  }
}

class PartialError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'PartialError';
    this.type = ERROR_TYPES.PARTIAL;
    this.cause = cause;
  }
}

class RetryExhaustedError extends Error {
  constructor(message, attempts) {
    super(message);
    this.name = 'RetryExhaustedError';
    this.type = ERROR_TYPES.TRANSIENT;
    this.attempts = attempts;
  }
}

class DegradationError extends Error {
  constructor(message, primaryError, fallbackError) {
    super(message);
    this.name = 'DegradationError';
    this.primaryError = primaryError;
    this.fallbackError = fallbackError;
  }
}

// ── Internal Helpers ────────────────────────────────────────────

function _extractMessage(error) {
  if (!error) return 'unknown error';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message || error.toString();
  if (error.message) return String(error.message);
  if (error.error) return String(error.error);
  return JSON.stringify(error).slice(0, 200);
}

function _extractCode(error) {
  if (!error) return null;
  if (error.code) return String(error.code);
  if (error.errno) return String(error.errno);
  return null;
}

function _extractStatusCode(error) {
  if (!error) return null;
  if (error.statusCode) return Number(error.statusCode);
  if (error.status) return Number(error.status);
  if (error.response && error.response.status) return Number(error.response.status);
  return null;
}

function _tryFixTruncatedJson(str) {
  // Count brackets to fix common truncations
  let braceCount = 0;
  let bracketCount = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') braceCount++;
    if (ch === '}') braceCount--;
    if (ch === '[') bracketCount++;
    if (ch === ']') bracketCount--;
  }

  if (inString) str += '"';
  let fixed = str;
  while (bracketCount > 0) { fixed += ']'; bracketCount--; }
  while (braceCount > 0) { fixed += '}'; braceCount--; }

  return fixed !== str ? fixed : null;
}

function _extractJsonObjects(str) {
  const objects = [];
  let depth = 0;
  let start = -1;

  for (let i = 0; i < str.length; i++) {
    if (str[i] === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (str[i] === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        try {
          const obj = JSON.parse(str.slice(start, i + 1));
          objects.push(obj);
        } catch (_) {}
        start = -1;
      }
    }
  }
  return objects;
}

function _sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function _logAlert(type, data) {
  const entry = { ts: new Date().toISOString(), alertType: type, ...data };
  try {
    fs.mkdirSync(path.dirname(ALERT_LOG_FILE), { recursive: true });
    fs.appendFileSync(ALERT_LOG_FILE, JSON.stringify(entry) + '\n');
  } catch (_) {}
}

function _logDecision(action, data) {
  if (_decisionLogger && typeof _decisionLogger.log === 'function') {
    try {
      _decisionLogger.log({
        phase: 'resilience',
        component: 'ErrorHandler',
        what: `${action}: ${data.context || 'unknown'}`,
        why: JSON.stringify(data).slice(0, 500),
        confidence: 1.0,
        decision_method: 'error_classification',
      });
    } catch (_) {}
  }
}

// ── Exports ─────────────────────────────────────────────────────

module.exports = {
  // Classification
  classify,
  ERROR_TYPES,

  // Retry & Degradation
  withRetry,
  withDegradation,
  recoverPartialResponse,

  // Error classes
  PermanentError,
  PartialError,
  RetryExhaustedError,
  DegradationError,

  // Constants (for testing)
  MAX_RETRIES,
  BASE_DELAY_MS,
  MAX_DELAY_MS,
  ALERT_LOG_FILE,
  TRANSIENT_PATTERNS,
  PERMANENT_PATTERNS,
  PARTIAL_PATTERNS,
};
