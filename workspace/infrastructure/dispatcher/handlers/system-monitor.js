'use strict';

/**
 * System Monitor Handler
 *
 * Handles system.health events by recording health status to a persistent JSONL log.
 * Triggered by: system.health
 *
 * @module infrastructure/dispatcher/handlers/system-monitor
 */

const fs = require('fs');
const path = require('path');

const WORKSPACE = path.resolve(__dirname, '..', '..', '..');
const LOG_DIR = path.join(WORKSPACE, 'infrastructure', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'health.jsonl');

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

/**
 * Handle a system.health event — append a structured entry to health.jsonl.
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
      type: event.type || 'system.health',
      source: event.source || payload.source || 'unknown',
      status: payload.status || 'unknown',
      uptime: payload.uptime || null,
      memoryMB: payload.memoryMB || payload.memory_mb || null,
      cpuPercent: payload.cpuPercent || payload.cpu_percent || null,
      checks: payload.checks || payload.components || null,
      summary: payload.summary || payload.message || null,
    };

    // Strip null/undefined fields for compactness
    Object.keys(entry).forEach(k => (entry[k] === null || entry[k] === undefined) && delete entry[k]);

    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');

    console.log(`[system-monitor] Health logged: ${entry.status} (${entry.eventId})`);

    return {
      status: 'ok',
      handler: 'system-monitor',
      action: 'log_health',
      logFile: LOG_FILE,
      healthStatus: entry.status,
      eventId: entry.eventId,
    };
  } catch (err) {
    console.error(`[system-monitor] Failed to log health event: ${err.message}`);
    return {
      status: 'error',
      handler: 'system-monitor',
      error: err.message,
    };
  }
}

module.exports = handle;
module.exports.handle = handle;
