'use strict';

/**
 * archive-stale-pending.js — Dispatcher Anti-Accumulation Guard
 * 
 * Scans infrastructure/dispatcher/dispatched/ for records older than
 * MAX_AGE_HOURS (default 24h) and moves them to dispatched-archive/YYYY-MM-DD/.
 * 
 * This prevents indefinite accumulation of file-based dispatch records.
 * 
 * Usage:
 *   node archive-stale-pending.js [--max-age-hours=24] [--dry-run]
 * 
 * Intended to be called by dispatcher.js at the start of each run,
 * or by a periodic cron / 本地任务编排 task.
 * 
 * CommonJS, pure Node.js, zero external dependencies.
 */

const fs = require('fs');
const path = require('path');

const DISPATCHED_DIR = path.join(__dirname, 'dispatched');
const ARCHIVE_BASE_DIR = path.join(__dirname, 'dispatched-archive');
const DEFAULT_MAX_AGE_HOURS = 24;

/**
 * Archive all pending_execution / pending records older than maxAgeHours.
 * 
 * @param {object} options
 * @param {number} [options.maxAgeHours=24]  - Records older than this are archived
 * @param {boolean} [options.dryRun=false]   - If true, only report, don't move files
 * @returns {{ archived: number, skipped: number, errors: string[] }}
 */
function archiveStalePending(options = {}) {
  const maxAgeHours = options.maxAgeHours ?? DEFAULT_MAX_AGE_HOURS;
  const dryRun = options.dryRun ?? false;
  const now = new Date();

  const result = { archived: 0, skipped: 0, errors: [] };

  if (!fs.existsSync(DISPATCHED_DIR)) {
    return result; // Nothing to do
  }

  let files;
  try {
    files = fs.readdirSync(DISPATCHED_DIR).filter(f => f.endsWith('.json'));
  } catch (err) {
    result.errors.push(`Failed to read dispatched dir: ${err.message}`);
    return result;
  }

  // Archive dir: dispatched-archive/YYYY-MM-DD
  const dateStr = now.toISOString().slice(0, 10);
  const archiveDir = path.join(ARCHIVE_BASE_DIR, dateStr);

  for (const fname of files) {
    const fpath = path.join(DISPATCHED_DIR, fname);
    try {
      const raw = fs.readFileSync(fpath, 'utf8');
      const record = JSON.parse(raw);

      const status = record.status || 'unknown';

      // Only process pending records — skip completed/archived
      if (status === 'completed' || status === 'archived') {
        result.skipped++;
        continue;
      }

      // Check age
      const dispatchedAt = record.dispatchedAt || record.timestamp;
      if (!dispatchedAt) {
        // No timestamp — treat as infinitely old, archive it
      } else {
        const ageMs = now - new Date(dispatchedAt);
        const ageHours = ageMs / 3600000;
        if (ageHours <= maxAgeHours) {
          result.skipped++;
          continue; // Still fresh
        }
      }

      // Archive it
      if (!dryRun) {
        fs.mkdirSync(archiveDir, { recursive: true });
        record.status = 'archived';
        record.archivedAt = now.toISOString();
        record.archiveReason = `auto_stale_pending (maxAgeHours=${maxAgeHours})`;
        const archivePath = path.join(archiveDir, fname);
        fs.writeFileSync(archivePath, JSON.stringify(record, null, 2));
        fs.unlinkSync(fpath);
      }

      result.archived++;
      if (dryRun) {
        console.log(`[DRY-RUN] Would archive: ${fname} (status=${status})`);
      }
    } catch (err) {
      result.errors.push(`${fname}: ${err.message}`);
    }
  }

  if (result.archived > 0 && !dryRun) {
    console.log(`[archive-stale-pending] Archived ${result.archived} stale pending record(s) → ${archiveDir}`);
  }

  return result;
}

// ─── CLI ─────────────────────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const maxAgeArg = args.find(a => a.startsWith('--max-age-hours='));
  const maxAgeHours = maxAgeArg ? parseFloat(maxAgeArg.split('=')[1]) : DEFAULT_MAX_AGE_HOURS;

  console.log(`[archive-stale-pending] Scanning dispatched/ (maxAge=${maxAgeHours}h, dryRun=${dryRun})`);
  const result = archiveStalePending({ maxAgeHours, dryRun });
  console.log(`[archive-stale-pending] Done: archived=${result.archived}, skipped=${result.skipped}, errors=${result.errors.length}`);
  if (result.errors.length > 0) {
    console.error('Errors:');
    for (const e of result.errors) console.error('  ' + e);
    process.exit(1);
  }
}

module.exports = { archiveStalePending };
