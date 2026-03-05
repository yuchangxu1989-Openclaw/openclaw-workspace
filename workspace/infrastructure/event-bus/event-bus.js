'use strict';

/**
 * @deprecated DO NOT USE THIS FILE.
 * 
 * This module has been TOMBSTONED as part of D09 debt resolution (2026-03-05).
 * 
 * ─── Migration Path ───────────────────────────────────────────────
 * 
 * Use bus-adapter.js instead. It exposes the same API (emit/consume/healthCheck/stats)
 * but routes through the file-lock-protected bus.js, eliminating the data race
 * caused by this file writing to a separate data/events.jsonl path.
 * 
 * Before (WRONG - writes to event-bus/data/events.jsonl, orphaned file):
 *   const EventBus = require('./event-bus');
 * 
 * After (CORRECT - writes to event-bus/events.jsonl, shared storage):
 *   const EventBus = require('./bus-adapter');
 * 
 * API compatibility:
 *   emit(type, payload, source, metadata) → { id, suppressed }   ✅ same
 *   consume({ type_filter, since, layer, limit })                 ✅ same
 *   healthCheck()                                                 ✅ same
 *   stats()                                                       ✅ same
 * 
 * ─── Why Deprecated ───────────────────────────────────────────────
 * 
 * This file wrote events to event-bus/data/events.jsonl while bus.js writes
 * to event-bus/events.jsonl. The two paths caused data to be split across
 * two separate JSONL files, making cross-consumer reads impossible.
 * 
 * Additionally, bus.js uses PID file-locks for safe concurrent writes.
 * This file used tmp→rename atomic append which can overwrite bus.js writes
 * under concurrent load (data loss risk).
 * 
 * The historical implementation has been preserved at:
 *   infrastructure/event-bus/event-bus.js.deprecated
 */

// Emit a runtime warning if this file is ever required by mistake.
const path = require('path');
const callerFile = path.relative(process.cwd(), __filename);
process.stderr.write(
  `\n[EventBus DEPRECATED] '${callerFile}' is deprecated and should not be imported.\n` +
  `  Use '../event-bus/bus-adapter' instead.\n` +
  `  See: infrastructure/event-bus/event-bus.js header for migration guide.\n\n`
);

// Re-export bus-adapter so any accidental require() still works without crashing.
// This provides a safety net during any missed migration.
module.exports = require('./bus-adapter');
