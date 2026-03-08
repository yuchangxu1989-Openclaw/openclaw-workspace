'use strict';

/**
 * Mainline resilience primitives migrated back from LEP standalone narrative.
 *
 * Minimal usable chain-level capabilities for dispatcher / resilience / self-healing:
 *   - retry with backoff
 *   - circuit breaker state
 *   - WAL append/query
 *   - trace logging
 *   - recovery trigger logging
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const STATE_DIR = path.join(ROOT_DIR, 'resilience');
const DEFAULT_WAL_DIR = path.join(STATE_DIR, 'wal');
const DEFAULT_TRACE_FILE = path.join(STATE_DIR, 'trace.jsonl');
const DEFAULT_RECOVERY_FILE = path.join(ROOT_DIR, 'self-healing', 'recovery-log.jsonl');
const DEFAULT_CIRCUIT_FILE = path.join(STATE_DIR, 'circuit-state.json');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function appendJsonl(file, entry) {
  ensureDir(path.dirname(file));
  fs.appendFileSync(file, JSON.stringify(entry) + '\n', 'utf8');
}

class MainlineWAL {
  constructor(options = {}) {
    this.dir = options.dir || DEFAULT_WAL_DIR;
    ensureDir(this.dir);
  }

  append(entry = {}) {
    const line = {
      ...entry,
      _wal: {
        ts: Date.now(),
        iso: new Date().toISOString(),
      },
    };
    const file = path.join(this.dir, `${new Date().toISOString().slice(0, 10)}.wal`);
    fs.appendFileSync(file, JSON.stringify(line) + '\n', 'utf8');
    return line;
  }

  queryByTrace(traceId, limit = 50) {
    if (!fs.existsSync(this.dir)) return [];
    const files = fs.readdirSync(this.dir).filter(name => name.endsWith('.wal')).sort().reverse();
    const out = [];
    for (const file of files) {
      const lines = fs.readFileSync(path.join(this.dir, file), 'utf8').split('\n').filter(Boolean).reverse();
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (!traceId || parsed.traceId === traceId) {
            out.push(parsed);
            if (out.length >= limit) return out;
          }
        } catch (_) {}
      }
    }
    return out;
  }
}

class MainlineTrace {
  constructor(options = {}) {
    this.file = options.file || DEFAULT_TRACE_FILE;
  }

  log(stage, payload = {}) {
    const entry = {
      ts: new Date().toISOString(),
      stage,
      ...payload,
    };
    appendJsonl(this.file, entry);
    return entry;
  }
}

class MainlineRecovery {
  constructor(options = {}) {
    this.file = options.file || DEFAULT_RECOVERY_FILE;
  }

  trigger(event = {}) {
    const entry = {
      ts: new Date().toISOString(),
      status: 'triggered',
      ...event,
    };
    appendJsonl(this.file, entry);
    return entry;
  }
}

class MainlineCircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 3;
    this.resetTimeoutMs = options.resetTimeoutMs || 5 * 60 * 1000;
    this.stateFile = options.stateFile || DEFAULT_CIRCUIT_FILE;
    this.state = this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.stateFile)) {
        return JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
      }
    } catch (_) {}
    return {};
  }

  _save() {
    ensureDir(path.dirname(this.stateFile));
    fs.writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2), 'utf8');
  }

  _record(key) {
    if (!this.state[key]) {
      this.state[key] = { failures: 0, openedAt: null, state: 'closed', lastError: null, lastSuccessAt: null };
    }
    return this.state[key];
  }

  canExecute(key) {
    const item = this._record(key);
    if (item.state !== 'open') return true;
    if (item.openedAt && Date.now() - item.openedAt > this.resetTimeoutMs) {
      item.state = 'closed';
      item.failures = 0;
      item.openedAt = null;
      this._save();
      return true;
    }
    return false;
  }

  recordSuccess(key) {
    const item = this._record(key);
    item.failures = 0;
    item.state = 'closed';
    item.openedAt = null;
    item.lastSuccessAt = Date.now();
    this._save();
    return item;
  }

  recordFailure(key, error) {
    const item = this._record(key);
    item.failures += 1;
    item.lastError = error instanceof Error ? error.message : String(error);
    if (item.failures >= this.failureThreshold) {
      item.state = 'open';
      item.openedAt = Date.now();
    }
    this._save();
    return item;
  }

  getState(key) {
    return key ? this._record(key) : this.state;
  }
}

async function executeWithRetry(fn, options = {}) {
  const retries = options.retries ?? 1;
  const baseDelayMs = options.baseDelayMs ?? 200;
  const shouldRetry = options.shouldRetry || (() => true);
  let lastError;

  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      if (attempt > retries || !shouldRetry(error, attempt)) break;
      const delay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), options.maxDelayMs || 5000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

module.exports = {
  MainlineWAL,
  MainlineTrace,
  MainlineRecovery,
  MainlineCircuitBreaker,
  executeWithRetry,
  DEFAULT_WAL_DIR,
  DEFAULT_TRACE_FILE,
  DEFAULT_RECOVERY_FILE,
  DEFAULT_CIRCUIT_FILE,
};
