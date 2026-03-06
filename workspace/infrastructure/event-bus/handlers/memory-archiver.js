'use strict';

/**
 * Memory Archiver Handler
 *
 * Processes critical system events and archives them to
 * memory/architecture-changelog.md for long-term memory retention.
 *
 * Triggered by:
 *   - system.architecture.changed
 *   - system.config.changed
 *   - system.critical.fix
 *
 * Usage:
 *   node memory-archiver.js <event-json-file>   # process a dispatched event
 *   node memory-archiver.js --test               # emit a test event and verify
 *
 * Can also be required and called programmatically:
 *   const archiver = require('./memory-archiver');
 *   archiver.archive(event);
 */

const fs = require('fs');
const path = require('path');

const WORKSPACE = path.resolve(__dirname, '..', '..', '..');
const CHANGELOG_PATH = path.join(WORKSPACE, 'memory', 'architecture-changelog.md');

// ─── Archive Logic ───────────────────────────────────────────────

/**
 * Format an event into a changelog markdown entry.
 * @param {object} event - The bus event object
 * @returns {string} Formatted markdown block
 */
function formatEntry(event) {
  const ts = event.timestamp
    ? new Date(event.timestamp).toISOString()
    : new Date().toISOString();
  const type = event.type || 'unknown';
  const payload = event.payload || {};
  const source = event.source || payload.source || 'unknown';
  const description = payload.description || payload.desc || type;
  const scope = payload.scope || payload.impact || 'unspecified';
  const details = payload.details || payload.detail || payload.summary || 'N/A';

  const lines = [
    `## [${ts}] ${type}`,
    `${description}`,
    '',
    `- 来源: ${source}`,
    `- 影响: ${scope}`,
    `- 详情: ${details}`,
    '',
  ];

  return lines.join('\n');
}

/**
 * Ensure the changelog file exists with a header.
 */
function ensureChangelog() {
  const dir = path.dirname(CHANGELOG_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(CHANGELOG_PATH)) {
    const header = [
      '# Architecture Changelog',
      '',
      '> 由事件总线自动归档的关键系统变更记录。',
      '> Auto-archived critical system change records from the event bus.',
      '',
    ].join('\n');
    fs.writeFileSync(CHANGELOG_PATH, header);
  }
}

/**
 * Archive an event to the changelog.
 * @param {object} event - The bus event object
 * @returns {object} Result with status and path
 */
function archive(event) {
  if (!event || !event.type) {
    throw new Error('[MemoryArchiver] Invalid event: missing type');
  }

  ensureChangelog();

  const entry = formatEntry(event);
  fs.appendFileSync(CHANGELOG_PATH, entry);

  const result = {
    status: 'archived',
    eventId: event.id || 'unknown',
    eventType: event.type,
    changelogPath: CHANGELOG_PATH,
    archivedAt: new Date().toISOString(),
  };

  console.log(`[MemoryArchiver] Archived ${event.type} (${event.id || 'N/A'}) → ${CHANGELOG_PATH}`);
  return result;
}

/**
 * Standard event-bus handler signature wrapper.
 * Compatible with handler-executor signatures:
 *   1) handler(event)
 *   2) handler(event, rule)
 *   3) handler(event, rule, context)
 */
async function memoryArchiverHandler(event, rule, context) {
  return archive(event);
}

// Keep backward compatibility for existing object-style API consumers.
memoryArchiverHandler.archive = archive;
memoryArchiverHandler.formatEntry = formatEntry;
memoryArchiverHandler.ensureChangelog = ensureChangelog;
memoryArchiverHandler.CHANGELOG_PATH = CHANGELOG_PATH;

// ─── CLI Entry ───────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);

  // Test mode: emit a test event and archive it
  if (args.includes('--test')) {
    const bus = require('../bus.js');

    console.log('[MemoryArchiver] Running test...');

    // Emit a test event
    const testEvent = bus.emit(
      'system.architecture.changed',
      {
        description: '事件总线记忆归档路由上线测试',
        scope: 'infrastructure/event-bus',
        details: '添加 memory-archiver handler，支持 system.architecture.changed / system.config.changed / system.critical.fix 事件自动归档到 architecture-changelog.md',
        source: 'memory-archiver-test',
      },
      'memory-archiver-test'
    );
    console.log(`[MemoryArchiver] Test event emitted: ${testEvent.id}`);

    // Archive it
    const result = archive(testEvent);
    console.log(`[MemoryArchiver] Test result:`, JSON.stringify(result, null, 2));

    // Verify
    const content = fs.readFileSync(CHANGELOG_PATH, 'utf8');
    if (content.includes(testEvent.id) || content.includes('事件总线记忆归档路由上线测试')) {
      console.log('[MemoryArchiver] ✅ Test PASSED — entry found in changelog');
    } else {
      console.error('[MemoryArchiver] ❌ Test FAILED — entry not found in changelog');
      process.exit(1);
    }

    return;
  }

  // Normal mode: read event from dispatched JSON file
  const eventFile = args[0];
  if (!eventFile) {
    console.error('Usage: node memory-archiver.js <event-json-file> | --test');
    process.exit(1);
  }

  if (!fs.existsSync(eventFile)) {
    console.error(`[MemoryArchiver] Event file not found: ${eventFile}`);
    process.exit(1);
  }

  let dispatched;
  try {
    dispatched = JSON.parse(fs.readFileSync(eventFile, 'utf8'));
  } catch (err) {
    console.error(`[MemoryArchiver] Failed to parse event file: ${err.message}`);
    process.exit(1);
  }

  // The dispatched file wraps the event: { event, route, dispatchedAt, status }
  const event = dispatched.event || dispatched;
  archive(event);

  // Update dispatch status
  if (dispatched.status) {
    dispatched.status = 'completed';
    dispatched.completedAt = new Date().toISOString();
    fs.writeFileSync(eventFile, JSON.stringify(dispatched, null, 2));
  }
}

// ─── Exports ─────────────────────────────────────────────────────

module.exports = memoryArchiverHandler;

if (require.main === module) {
  main();
}
