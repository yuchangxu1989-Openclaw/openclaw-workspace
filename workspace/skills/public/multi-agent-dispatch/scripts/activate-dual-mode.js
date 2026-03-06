#!/usr/bin/env node
'use strict';

/**
 * activate-dual-mode.js
 * ─────────────────────
 * Activates the new DispatchEngine in dual-write mode alongside the old DispatchLayer.
 * 
 * Strategy:
 *   1. Reset new engine to clean state with proper slot count
 *   2. Wire onDispatch bridge for pending pickup
 *   3. Migrate active tasks from old dispatcher as read-only snapshot (no deletion)
 *   4. Write activation marker file for runtime detection
 *   5. No old dispatcher mutation — purely additive
 */

const fs = require('fs');
const path = require('path');

const { DispatchEngine } = require('../dispatch-engine');
const { onDispatchBridge } = require('../dispatch-bridge');

const OLD_STATE = path.resolve(__dirname, '..', '..', '..', '..', 'infrastructure', 'dispatcher', 'state', 'dispatch-layer-state.json');
const ACTIVATION_MARKER = path.join(__dirname, '..', 'state', 'activation-status.json');

function main() {
  console.log('🚀 Activating new DispatchEngine in DUAL mode...\n');

  // Step 1: Read old dispatcher state (read-only)
  let oldState = null;
  try {
    oldState = JSON.parse(fs.readFileSync(OLD_STATE, 'utf8'));
    console.log(`📖 Old dispatcher: ${Object.keys(oldState.slots || {}).length} slots, ${(oldState.running || []).length} running, ${(oldState.queue || []).length} queued`);
  } catch (e) {
    console.log(`⚠️ Old dispatcher state not readable: ${e.message}`);
  }

  // Step 2: Initialize new engine with production slot count
  const SLOTS = 19;
  const engine = new DispatchEngine({
    maxSlots: SLOTS,
    onDispatch: onDispatchBridge,
  });

  // Reset to clean state
  engine.reset();
  console.log(`✅ New engine initialized: ${SLOTS} slots`);

  // Step 3: Write activation marker
  const marker = {
    mode: 'dual',
    activatedAt: new Date().toISOString(),
    newEngineSlots: SLOTS,
    oldDispatcherPreserved: true,
    migratedTasks: 0,
    notes: [
      'Old dispatcher state preserved — no mutations.',
      'New engine is the source of truth for new tasks.',
      'Old running tasks will complete in old dispatcher.',
      'Reporting trigger reads from new engine only.',
    ],
  };

  // Step 4: Snapshot old running tasks into new engine as informational entries
  if (oldState && oldState.running && oldState.running.length > 0) {
    for (const oldTask of oldState.running) {
      // Don't re-enqueue — just record in event log for visibility
      engine._load().eventLog.push({
        ts: new Date().toISOString(),
        type: 'legacy_task_snapshot',
        taskId: oldTask.taskId,
        title: oldTask.title,
        status: oldTask.status,
        note: 'from old DispatchLayer — completing in legacy system',
      });
      marker.migratedTasks++;
    }
    engine._save();
    console.log(`📸 Snapshotted ${marker.migratedTasks} legacy running tasks`);
  }

  // Write marker
  fs.mkdirSync(path.dirname(ACTIVATION_MARKER), { recursive: true });
  fs.writeFileSync(ACTIVATION_MARKER, JSON.stringify(marker, null, 2));
  console.log(`📝 Activation marker written to ${ACTIVATION_MARKER}`);

  // Step 5: Verify
  const board = engine.liveBoard();
  console.log(`\n📊 New Engine Status:`);
  console.log(`   Max Slots: ${board.summary.maxSlots}`);
  console.log(`   Busy:      ${board.summary.busySlots}`);
  console.log(`   Free:      ${board.summary.freeSlots}`);
  console.log(`   Queued:    ${board.summary.queueDepth}`);
  console.log(`   Mode:      DUAL (new engine active, old preserved)`);

  console.log('\n✅ Dual-mode activation complete.');
  return marker;
}

const result = main();
console.log(JSON.stringify(result, null, 2));
