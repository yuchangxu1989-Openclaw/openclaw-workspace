'use strict';

/**
 * Memory Archiver Handler (Dispatcher)
 *
 * Handles architecture/config/fix events by writing structured entries to the
 * memory/ directory. This is the dispatcher-facing wrapper around the existing
 * event-bus memory-archiver logic.
 *
 * Triggered by:
 *   - system.architecture.changed → memory/architecture-changelog.md
 *   - system.config.changed       → memory/architecture-changelog.md
 *   - system.critical.fix         → memory/architecture-changelog.md
 *
 * @module infrastructure/dispatcher/handlers/memory-archiver
 */

const fs = require('fs');
const path = require('path');

const WORKSPACE = path.resolve(__dirname, '..', '..', '..');
const MEMORY_DIR = path.join(WORKSPACE, 'memory');
const CHANGELOG_PATH = path.join(MEMORY_DIR, 'architecture-changelog.md');

function ensureMemoryDir() {
  if (!fs.existsSync(MEMORY_DIR)) {
    fs.mkdirSync(MEMORY_DIR, { recursive: true });
  }
}

function ensureChangelog() {
  ensureMemoryDir();
  if (!fs.existsSync(CHANGELOG_PATH)) {
    const header = [
      '# Architecture Changelog',
      '',
      '> 由Dispatcher自动归档的关键系统变更记录。',
      '> Auto-archived critical system change records from the event dispatcher.',
      '',
    ].join('\n');
    fs.writeFileSync(CHANGELOG_PATH, header);
  }
}

function formatEntry(event) {
  const ts = event.timestamp
    ? new Date(event.timestamp).toISOString()
    : new Date().toISOString();
  const type = event.type || 'unknown';
  const payload = event.payload || {};
  const source = event.source || payload.source || 'unknown';
  const description = payload.description || payload.desc || payload.message || type;
  const scope = payload.scope || payload.impact || 'unspecified';
  const details = payload.details || payload.detail || payload.summary || 'N/A';

  return [
    `## [${ts}] ${type}`,
    `${description}`,
    '',
    `- 来源: ${source}`,
    `- 影响: ${scope}`,
    `- 详情: ${details}`,
    '',
  ].join('\n');
}

/**
 * Handle architecture/config/fix events — archive to memory/architecture-changelog.md.
 * @param {object} event - The dispatcher event object
 * @param {object} [context] - Optional dispatcher context
 * @returns {object} Handler result
 */
async function handle(event, context) {
  try {
    // Try to delegate to the existing event-bus memory-archiver if available
    try {
      const busArchiver = require(
        path.join(WORKSPACE, 'infrastructure', 'event-bus', 'handlers', 'memory-archiver.js')
      );
      if (typeof busArchiver.archive === 'function') {
        const result = busArchiver.archive(event);
        return {
          status: 'ok',
          handler: 'memory-archiver',
          action: 'archive_via_bus',
          delegated: true,
          ...result,
        };
      }
    } catch (_) {
      // Bus archiver not available, fall through to local implementation
    }

    // Local fallback
    ensureChangelog();

    const entry = formatEntry(event);
    fs.appendFileSync(CHANGELOG_PATH, entry);

    const result = {
      status: 'ok',
      handler: 'memory-archiver',
      action: 'archive',
      eventId: event.id || 'unknown',
      eventType: event.type,
      changelogPath: CHANGELOG_PATH,
      archivedAt: new Date().toISOString(),
    };

    console.log(`[memory-archiver] Archived ${event.type} (${event.id || 'N/A'}) → ${CHANGELOG_PATH}`);
    return result;
  } catch (err) {
    console.error(`[memory-archiver] Failed to archive event: ${err.message}`);
    return {
      status: 'error',
      handler: 'memory-archiver',
      error: err.message,
    };
  }
}

module.exports = handle;
module.exports.handle = handle;
