#!/usr/bin/env node
'use strict';

/**
 * dispatch-cron-runner.js
 * ───────────────────────
 * Workspace-safe cron entrypoint for the full dispatch governance chain:
 *   reap stale → derive follow-ups → republish stranded spawning → spawn pending
 *
 * This is intentionally separate from dispatch-reap-cron.js so existing scripts
 * remain preserved while cron can be upgraded to run the full chain.
 */

const fs = require('fs');
const path = require('path');
const { drainAndRun } = require('./dispatch-runner');

const ROOT = path.resolve(__dirname, '../../..');
const LOG_DIR = path.join(ROOT, 'infrastructure', 'logs');
const JSONL_LOG = path.join(LOG_DIR, 'dispatch-cron-runner.jsonl');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function appendJsonl(file, record) {
  ensureDir(path.dirname(file));
  fs.appendFileSync(file, `${JSON.stringify(record)}\n`);
}

async function main(options = {}) {
  const startedAt = new Date().toISOString();
  const baseDir = options.baseDir || __dirname;

  try {
    const result = await drainAndRun({ baseDir, ...options });
    const summary = {
      ts: new Date().toISOString(),
      startedAt,
      job: 'dispatch-cron-runner',
      ok: result.ok,
      spawned: result.spawned,
      republished: result.republished,
      reaped: result.reaped,
      reapedFollowups: result.reapedFollowups,
      errors: result.errors,
      board: result.board ? result.board.summary : null,
    };

    appendJsonl(JSONL_LOG, summary);
    console.log(`[dispatch-cron] ok=${summary.ok} reaped=${summary.reaped} followups=${summary.reapedFollowups} republished=${summary.republished} spawned=${summary.spawned}`);
    if (summary.board) {
      console.log(`[dispatch-cron] board running=${summary.board.runningCount} spawning=${summary.board.spawningCount} queued=${summary.board.queueDepth} free=${summary.board.freeSlots}/${summary.board.maxSlots}`);
    }
    if (summary.errors.length) {
      for (const err of summary.errors) {
        console.error(`[dispatch-cron] task=${err.taskId} error=${err.error}`);
      }
    }
  } catch (error) {
    const failure = {
      ts: new Date().toISOString(),
      startedAt,
      job: 'dispatch-cron-runner',
      ok: false,
      fatal: true,
      error: error.message,
      stack: error.stack || null,
    };
    appendJsonl(JSONL_LOG, failure);
    console.error('[dispatch-cron] fatal:', error.stack || error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
