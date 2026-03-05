'use strict';

/**
 * System Alert Handler
 *
 * Handles system.error events by recording them to a persistent JSONL log.
 * Triggered by: system.error
 *
 * @module infrastructure/dispatcher/handlers/system-alert
 */

const fs = require('fs');
const path = require('path');

const WORKSPACE = path.resolve(__dirname, '..', '..', '..');
const LOG_DIR = path.join(WORKSPACE, 'infrastructure', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'system-errors.jsonl');

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

/**
 * Handle a system.error event — append a structured entry to system-errors.jsonl.
 * @param {object} event - The dispatcher event object
 * @param {object} [context] - Optional dispatcher context
 * @returns {object} Handler result
 */
async function handle(event, context) {
  try {
    ensureLogDir();

    const payload = event.payload || {};
    const entry = {
      ts: new Date().toISOString(),
      eventId: event.id || 'unknown',
      type: event.type || 'system.error',
      source: event.source || payload.source || 'unknown',
      severity: payload.severity || 'error',
      message: payload.message || payload.msg || payload.error || 'No message',
      stack: payload.stack || null,
      context: payload.context || payload.ctx || null,
      raw: Object.keys(payload).length > 0 ? payload : undefined,
    };

    // Strip undefined fields
    Object.keys(entry).forEach(k => entry[k] === undefined && delete entry[k]);

    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');

    console.log(`[system-alert] Logged error: ${entry.message} (${entry.eventId})`);

    return {
      status: 'ok',
      handler: 'system-alert',
      action: 'log_error',
      logFile: LOG_FILE,
      eventId: entry.eventId,
    };
  } catch (err) {
    console.error(`[system-alert] Failed to log error event: ${err.message}`);
    return {
      status: 'error',
      handler: 'system-alert',
      error: err.message,
    };
  }
}

module.exports = handle;
module.exports.handle = handle;
