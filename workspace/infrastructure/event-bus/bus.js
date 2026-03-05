'use strict';

const fs = require('fs');
const path = require('path');
const { once } = require('events');

// ─── Configuration ───────────────────────────────────────────────
const BASE_DIR = __dirname;
const EVENTS_FILE = path.join(BASE_DIR, 'events.jsonl');
const CURSOR_FILE = path.join(BASE_DIR, 'cursor.json');
const LOCK_FILE = path.join(BASE_DIR, '.bus.lock');
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB rotation threshold
const ARCHIVE_DIR = path.join(BASE_DIR, 'archive');

// ─── File Lock (advisory flock via fs.open + exclusive flag) ─────
// Pure Node.js file-lock: we write a PID to a lockfile with O_EXCL.
// On stale locks (process gone), we force-remove and retry once.

function acquireLock(lockPath, timeoutMs = 5000) {
  const start = Date.now();
  while (true) {
    try {
      // O_CREAT | O_EXCL | O_WRONLY — atomic create-or-fail
      const fd = fs.openSync(lockPath, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY);
      fs.writeSync(fd, String(process.pid));
      fs.closeSync(fd);
      return true;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      // Check if the holding process is still alive
      try {
        const pid = parseInt(fs.readFileSync(lockPath, 'utf8').trim(), 10);
        if (pid && pid !== process.pid) {
          try { process.kill(pid, 0); } catch (_) {
            // Process is dead — stale lock; remove and retry immediately
            try { fs.unlinkSync(lockPath); } catch (__) { /* ignore */ }
            continue;
          }
        }
      } catch (_) { /* can't read lock — will retry */ }

      if (Date.now() - start > timeoutMs) {
        throw new Error(`[EventBus] Failed to acquire lock within ${timeoutMs}ms`);
      }
      // Spin-wait 10ms
      const waitUntil = Date.now() + 10;
      while (Date.now() < waitUntil) { /* busy wait */ }
    }
  }
}

function releaseLock(lockPath) {
  try { fs.unlinkSync(lockPath); } catch (_) { /* ignore */ }
}

// ─── Helpers ─────────────────────────────────────────────────────

function ensureFile(filePath, defaultContent = '') {
  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, defaultContent);
  }
}

function generateId() {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `evt_${ts}_${rand}`;
}

/**
 * Match an event type against a pattern.
 * Supports exact match and wildcard suffix (e.g. "isc.rule.*").
 */
function matchType(eventType, pattern) {
  if (pattern === '*') return true;
  if (pattern === eventType) return true;
  if (pattern.endsWith('.*')) {
    const prefix = pattern.slice(0, -2);
    return eventType === prefix || eventType.startsWith(prefix + '.');
  }
  return false;
}

/**
 * Check if an event type matches any of the given patterns.
 */
function matchesAny(eventType, patterns) {
  if (!patterns || patterns.length === 0) return true;
  return patterns.some(p => matchType(eventType, p));
}

// ─── Cursor Management ──────────────────────────────────────────

function readCursors() {
  ensureFile(CURSOR_FILE, '{}');
  try {
    return JSON.parse(fs.readFileSync(CURSOR_FILE, 'utf8'));
  } catch (_) {
    return {};
  }
}

function writeCursors(cursors) {
  fs.writeFileSync(CURSOR_FILE, JSON.stringify(cursors, null, 2));
}

// ─── Log Rotation ────────────────────────────────────────────────

function rotateIfNeeded() {
  ensureFile(EVENTS_FILE);
  let stat;
  try {
    stat = fs.statSync(EVENTS_FILE);
  } catch (_) {
    return; // file doesn't exist yet
  }
  if (stat.size < MAX_FILE_SIZE) return;

  fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  const archiveName = `events-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`;
  const archivePath = path.join(ARCHIVE_DIR, archiveName);

  fs.renameSync(EVENTS_FILE, archivePath);
  fs.writeFileSync(EVENTS_FILE, '');

  // Reset all cursors to 0 since the file is new
  const cursors = readCursors();
  for (const consumer of Object.keys(cursors)) {
    cursors[consumer].offset = 0;
  }
  writeCursors(cursors);
}

// ─── Read all events from JSONL ──────────────────────────────────

function readAllEvents() {
  ensureFile(EVENTS_FILE);
  const content = fs.readFileSync(EVENTS_FILE, 'utf8').trim();
  if (!content) return [];
  return content.split('\n').map((line, idx) => {
    try {
      return JSON.parse(line);
    } catch (err) {
      console.error(`[EventBus] Corrupt line ${idx}: ${err.message}`);
      return null;
    }
  }).filter(Boolean);
}

// ─── Public API ──────────────────────────────────────────────────

// ─── Dispatcher Integration ──────────────────────────────────────
let _dispatcher = null;
let _dispatcherReady = false;

async function initDispatcher(options = {}) {
  try {
    const { Dispatcher } = require('./dispatcher');
    _dispatcher = new Dispatcher(options);
    await _dispatcher.init();
    _dispatcherReady = true;
  } catch (e) {
    console.error(`[EventBus] Dispatcher init failed (non-fatal): ${e.message}`);
    _dispatcherReady = false;
  }
}

function _fireDispatcher(eventType, payload) {
  if (!_dispatcherReady || !_dispatcher) return;
  try {
    // async, fire-and-forget, never blocks emit
    Promise.resolve(_dispatcher.dispatch(eventType, payload)).catch(e => {
      console.error(`[EventBus] Dispatcher.dispatch error (non-fatal): ${e.message}`);
    });
  } catch (e) {
    // sync guard — should never happen but fault-isolated
    console.error(`[EventBus] Dispatcher fire error (non-fatal): ${e.message}`);
  }
}

// ─── Public API ──────────────────────────────────────────────────

const bus = {
  /**
   * Initialize the integrated dispatcher. Call once at startup.
   * @param {object} [options] - Dispatcher constructor options
   */
  initDispatcher,

  /**
   * Get the dispatcher instance (if initialized).
   */
  getDispatcher() { return _dispatcher; },

  /**
   * Publish an event to the bus.
   * @param {string} type - Event type (e.g. "isc.rule.updated")
   * @param {object} payload - Event payload
   * @param {string} source - Source module identifier
   * @returns {object} The emitted event
   */
  emit(type, payload, source) {
    if (!type || typeof type !== 'string') {
      throw new Error('[EventBus] emit: type is required and must be a string');
    }
    source = source || 'unknown';
    payload = payload || {};

    const event = {
      id: generateId(),
      type,
      source,
      payload,
      timestamp: Date.now(),
      consumed_by: []
    };

    acquireLock(LOCK_FILE);
    try {
      rotateIfNeeded();
      ensureFile(EVENTS_FILE);
      fs.appendFileSync(EVENTS_FILE, JSON.stringify(event) + '\n');
    } finally {
      releaseLock(LOCK_FILE);
    }

    // Fire-and-forget dispatcher (async, fault-isolated)
    _fireDispatcher(type, payload);

    return event;
  },

  /**
   * Consume unconsumed events for a given consumer.
   * @param {string} consumerId - Unique consumer identifier
   * @param {object} [options] - Filter options
   * @param {string[]} [options.types] - Event type patterns to match
   * @param {number} [options.limit] - Max events to return
   * @returns {object[]} Array of matching unconsumed events
   */
  consume(consumerId, options = {}) {
    if (!consumerId || typeof consumerId !== 'string') {
      throw new Error('[EventBus] consume: consumerId is required');
    }

    const { types, limit } = options;

    acquireLock(LOCK_FILE);
    try {
      const allEvents = readAllEvents();
      const cursors = readCursors();

      // Get or initialize cursor for this consumer
      if (!cursors[consumerId]) {
        cursors[consumerId] = { offset: 0, acked: [] };
      }

      const cursor = cursors[consumerId];
      const ackedSet = new Set(cursor.acked || []);

      // Filter: unconsumed events from cursor offset, matching types
      let results = [];
      for (let i = cursor.offset; i < allEvents.length; i++) {
        const evt = allEvents[i];
        if (ackedSet.has(evt.id)) continue;
        if (evt.consumed_by && evt.consumed_by.includes(consumerId)) continue;
        if (!matchesAny(evt.type, types)) continue;
        results.push(evt);
        if (limit && results.length >= limit) break;
      }

      writeCursors(cursors);
      return results;
    } finally {
      releaseLock(LOCK_FILE);
    }
  },

  /**
   * Acknowledge that a consumer has processed an event.
   * @param {string} consumerId - Consumer identifier
   * @param {string} eventId - Event ID to acknowledge
   */
  ack(consumerId, eventId) {
    if (!consumerId || !eventId) {
      throw new Error('[EventBus] ack: consumerId and eventId are required');
    }

    acquireLock(LOCK_FILE);
    try {
      // Update the event's consumed_by array in the JSONL file
      const allEvents = readAllEvents();
      let updated = false;
      const lines = [];

      for (const evt of allEvents) {
        if (evt.id === eventId) {
          if (!evt.consumed_by) evt.consumed_by = [];
          if (!evt.consumed_by.includes(consumerId)) {
            evt.consumed_by.push(consumerId);
          }
          updated = true;
        }
        lines.push(JSON.stringify(evt));
      }

      if (updated) {
        fs.writeFileSync(EVENTS_FILE, lines.join('\n') + '\n');
      }

      // Also track in cursor for fast filtering
      const cursors = readCursors();
      if (!cursors[consumerId]) {
        cursors[consumerId] = { offset: 0, acked: [] };
      }
      if (!cursors[consumerId].acked) {
        cursors[consumerId].acked = [];
      }
      if (!cursors[consumerId].acked.includes(eventId)) {
        cursors[consumerId].acked.push(eventId);
      }

      // Advance offset: find the lowest index of an un-acked event
      const ackedSet = new Set(cursors[consumerId].acked);
      let newOffset = allEvents.length;
      for (let i = 0; i < allEvents.length; i++) {
        if (!ackedSet.has(allEvents[i].id) && 
            !(allEvents[i].consumed_by && allEvents[i].consumed_by.includes(consumerId))) {
          newOffset = i;
          break;
        }
      }
      cursors[consumerId].offset = newOffset;

      // Prune acked list: remove IDs that are before the offset (already advanced past)
      if (newOffset > 0) {
        const earlyIds = new Set(allEvents.slice(0, newOffset).map(e => e.id));
        cursors[consumerId].acked = cursors[consumerId].acked.filter(id => !earlyIds.has(id));
      }

      writeCursors(cursors);
    } finally {
      releaseLock(LOCK_FILE);
    }
  },

  /**
   * Query event history with filters.
   * @param {object} [options] - Query options
   * @param {string} [options.type] - Event type pattern to match
   * @param {number} [options.since] - Only events after this timestamp (ms)
   * @param {number} [options.until] - Only events before this timestamp (ms)
   * @param {string} [options.source] - Filter by source
   * @param {number} [options.limit] - Max events to return
   * @returns {object[]} Matching events
   */
  history(options = {}) {
    const { type, since, until, source, limit } = options;

    acquireLock(LOCK_FILE);
    try {
      let events = readAllEvents();

      if (type) {
        events = events.filter(e => matchType(e.type, type));
      }
      if (since) {
        events = events.filter(e => e.timestamp >= since);
      }
      if (until) {
        events = events.filter(e => e.timestamp <= until);
      }
      if (source) {
        events = events.filter(e => e.source === source);
      }
      if (limit) {
        events = events.slice(-limit);
      }

      return events;
    } finally {
      releaseLock(LOCK_FILE);
    }
  },

  /**
   * Get bus statistics.
   * @returns {object} Stats about events and consumers
   */
  stats() {
    acquireLock(LOCK_FILE);
    try {
      const events = readAllEvents();
      const cursors = readCursors();

      const typeCount = {};
      for (const evt of events) {
        typeCount[evt.type] = (typeCount[evt.type] || 0) + 1;
      }

      return {
        totalEvents: events.length,
        consumers: Object.keys(cursors).length,
        eventsByType: typeCount,
        oldestEvent: events.length > 0 ? events[0].timestamp : null,
        newestEvent: events.length > 0 ? events[events.length - 1].timestamp : null,
      };
    } finally {
      releaseLock(LOCK_FILE);
    }
  },

  /**
   * Purge all events (for testing / maintenance).
   */
  purge() {
    acquireLock(LOCK_FILE);
    try {
      fs.writeFileSync(EVENTS_FILE, '');
      writeCursors({});
    } finally {
      releaseLock(LOCK_FILE);
    }
  },

  // ─── Exposed utilities for testing ──────────────────────────────
  _matchType: matchType,
  _matchesAny: matchesAny,
  _EVENTS_FILE: EVENTS_FILE,
  _CURSOR_FILE: CURSOR_FILE,
  _LOCK_FILE: LOCK_FILE,
};

module.exports = bus;
