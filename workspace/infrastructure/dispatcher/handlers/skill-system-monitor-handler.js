'use strict';

/**
 * Skill System Monitor Handler
 *
 * Consumes file.changed / file.changed.* events after L3 mainline promotion.
 * Writes categorized file-change observations to a dedicated JSONL log so the
 * route is no longer dangling after the L3 architecture reshape.
 */

const fs = require('fs');
const path = require('path');

const WORKSPACE = path.resolve(__dirname, '..', '..', '..');
const LOG_DIR = path.join(WORKSPACE, 'infrastructure', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'file-change-events.jsonl');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function normalizeFiles(payload) {
  if (Array.isArray(payload.files)) return payload.files;
  if (Array.isArray(payload.changed_files)) return payload.changed_files;
  if (Array.isArray(payload.paths)) return payload.paths;
  if (typeof payload.file === 'string') return [payload.file];
  if (typeof payload.path === 'string') return [payload.path];
  return [];
}

async function handle(event, _context) {
  ensureDir(LOG_DIR);

  const payload = event.payload || {};
  const files = normalizeFiles(payload);
  const entry = {
    ts: new Date().toISOString(),
    eventId: event.id || 'unknown',
    eventType: event.type || 'file.changed',
    source: event.source || payload.source || 'unknown',
    category: payload.category || payload.kind || payload.file_type || 'unknown',
    changeType: payload.change_type || payload.action || 'changed',
    fileCount: payload.file_count || files.length,
    files,
    summary: payload.summary || payload.message || null,
    metadata: payload._metadata || event.metadata || null,
  };

  Object.keys(entry).forEach((k) => (entry[k] === null || entry[k] === undefined) && delete entry[k]);
  fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n', 'utf8');

  return {
    status: 'ok',
    handler: 'skill-system-monitor-handler',
    action: 'log_file_change',
    eventType: entry.eventType,
    fileCount: entry.fileCount,
    category: entry.category,
    logFile: LOG_FILE,
  };
}

module.exports = handle;
module.exports.handle = handle;
