#!/usr/bin/env node
'use strict';

/**
 * dispatch-reap-cron.js
 * ─────────────────────
 * Cron-safe script: reaps stale tasks and force-drains the queue.
 * Designed to run every 5 minutes via cron.
 * 
 * Usage: node dispatch-reap-cron.js
 */

const { DispatchEngine } = require('./dispatch-engine');

function main() {
  try {
    const engine = new DispatchEngine({
      maxSlots: parseInt(process.env.DISPATCH_ENGINE_SLOTS || '3', 10),
    });

    // Reap stale spawning/running tasks
    const reaped = engine.reapStale();
    if (reaped.length > 0) {
      console.log(`[dispatch-reap] Reaped ${reaped.length} stale tasks:`, 
        reaped.map(t => `${t.taskId} (${t.reason})`).join(', '));
    }

    // Force drain to backfill freed slots
    const dispatched = engine.drain();
    if (dispatched.length > 0) {
      console.log(`[dispatch-reap] Drained ${dispatched.length} tasks into slots`);
    }

    // Summary
    const board = engine.liveBoard();
    console.log(`[dispatch-reap] Status: ${board.summary.runningCount} running, ` +
      `${board.summary.spawningCount} spawning, ${board.summary.queueDepth} queued, ` +
      `${board.summary.freeSlots}/${board.summary.maxSlots} free`);
  } catch (e) {
    console.error('[dispatch-reap] Error:', e.message);
    process.exit(1);
  }
}

main();
