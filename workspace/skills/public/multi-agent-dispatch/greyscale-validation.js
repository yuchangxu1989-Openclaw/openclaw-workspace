#!/usr/bin/env node
'use strict';

/**
 * greyscale-validation.js
 * ───────────────────────
 * Minimum viable validation for the dispatch engine cutover.
 * Tests the full lifecycle: enqueue → spawning → running → done → backfill
 * Also tests: reapStale, file locking, batch enqueue, priority ordering.
 * 
 * Exit 0 = all pass. Exit 1 = failure.
 */

const path = require('path');
const fs = require('fs');

// Use a temp state dir so validation doesn't pollute production state
const TMP_DIR = path.join(__dirname, 'state', '.validation-tmp');
fs.mkdirSync(TMP_DIR, { recursive: true });

const { DispatchEngine } = require('./dispatch-engine');

let pass = 0;
let fail = 0;

function assert(condition, label) {
  if (condition) {
    pass++;
    console.log(`  ✅ ${label}`);
  } else {
    fail++;
    console.error(`  ❌ ${label}`);
  }
}

function cleanup() {
  try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch {}
}

function main() {
  console.log('\n🔬 Dispatch Engine Greyscale Validation\n');

  // ── Test 1: Basic lifecycle ──
  console.log('Test 1: Full lifecycle (enqueue → spawn → running → done → backfill)');
  {
    const e = new DispatchEngine({
      maxSlots: 2,
      stateFile: path.join(TMP_DIR, 't1-state.json'),
      boardFile: path.join(TMP_DIR, 't1-board.json'),
    });

    const t1 = e.enqueue({ title: 'Task A', priority: 'high' });
    assert(t1.status === 'spawning', 'enqueue auto-dispatches to spawning (slot available)');
    assert(e.freeSlots() === 1, 'one slot used after enqueue');

    const t2 = e.enqueue({ title: 'Task B', priority: 'normal' });
    assert(t2.status === 'spawning', 'second task also dispatched');
    assert(e.freeSlots() === 0, 'all slots full');

    const t3 = e.enqueue({ title: 'Task C (queued)', priority: 'low' });
    assert(t3.status === 'queued', 'third task queued (no free slots)');
    assert(e.queueDepth() === 1, 'queue depth = 1');

    // Mark t1 running
    e.markRunning(t1.taskId, { sessionKey: 'test:session:1' });
    assert(e.liveBoard().summary.runningCount === 1, 'running count = 1 after markRunning');

    // Mark t1 done → should auto-backfill t3
    e.markDone(t1.taskId, { result: 'success' });
    assert(e.queueDepth() === 0, 'queue drained after slot freed (backfill worked)');
    assert(e.busyCount() === 2, 'two slots busy again (t2 + t3 backfilled)');

    const board = e.liveBoard();
    assert(board.summary.finishedCount === 1, 'one task in finished list');
    assert(board.recentFinished[0].status === 'done', 'finished task has done status');
  }

  // ── Test 2: Priority ordering ──
  console.log('\nTest 2: Priority ordering');
  {
    const e = new DispatchEngine({
      maxSlots: 1,
      stateFile: path.join(TMP_DIR, 't2-state.json'),
      boardFile: path.join(TMP_DIR, 't2-board.json'),
    });

    // Fill the only slot
    const blocker = e.enqueue({ title: 'Blocker' });
    
    // Queue tasks with different priorities
    e.enqueue({ title: 'Low', priority: 'low' });
    e.enqueue({ title: 'Critical', priority: 'critical' });
    e.enqueue({ title: 'Normal', priority: 'normal' });

    assert(e.queueDepth() === 3, '3 tasks queued behind blocker');

    // Free slot → critical should be next
    e.markDone(blocker.taskId);
    const board = e.liveBoard();
    const spawning = board.spawning[0] || {};
    assert(spawning.title === 'Critical', 'critical-priority task dispatched first');
  }

  // ── Test 3: Reap stale ──
  console.log('\nTest 3: Reap stale spawning tasks');
  {
    const e = new DispatchEngine({
      maxSlots: 2,
      stateFile: path.join(TMP_DIR, 't3-state.json'),
      boardFile: path.join(TMP_DIR, 't3-board.json'),
    });

    const t = e.enqueue({ title: 'Will timeout' });

    // Manually backdate spawningAt to simulate timeout
    const state = JSON.parse(fs.readFileSync(path.join(TMP_DIR, 't3-state.json'), 'utf8'));
    state.spawning[t.taskId].spawningAt = new Date(Date.now() - 300_000).toISOString();
    fs.writeFileSync(path.join(TMP_DIR, 't3-state.json'), JSON.stringify(state));
    
    e.reload();
    const reaped = e.reapStale({ spawnTimeoutMs: 120_000 });
    assert(reaped.length === 1, 'stale task reaped');
    assert(e.freeSlots() === 2, 'slot freed after reap');
  }

  // ── Test 4: Batch enqueue ──
  console.log('\nTest 4: Batch enqueue');
  {
    const e = new DispatchEngine({
      maxSlots: 3,
      stateFile: path.join(TMP_DIR, 't4-state.json'),
      boardFile: path.join(TMP_DIR, 't4-board.json'),
    });

    const tasks = e.enqueueBatch([
      { title: 'Batch-1' },
      { title: 'Batch-2' },
      { title: 'Batch-3' },
      { title: 'Batch-4' },
      { title: 'Batch-5' },
    ]);

    assert(tasks.length === 5, 'all 5 tasks created');
    assert(e.busyCount() === 3, '3 slots filled');
    assert(e.queueDepth() === 2, '2 tasks queued');
  }

  // ── Test 5: Cancel ──
  console.log('\nTest 5: Cancel task');
  {
    const e = new DispatchEngine({
      maxSlots: 1,
      stateFile: path.join(TMP_DIR, 't5-state.json'),
      boardFile: path.join(TMP_DIR, 't5-board.json'),
    });

    const t = e.enqueue({ title: 'To cancel' });
    e.enqueue({ title: 'Waiting' });
    
    e.cancel(t.taskId);
    assert(e.liveBoard().summary.spawningCount === 1, 'cancelled task replaced by queued one');
  }

  // ── Test 6: File lock (write concurrency) ──
  console.log('\nTest 6: Atomic file write');
  {
    const stateFile = path.join(TMP_DIR, 't6-state.json');
    const e = new DispatchEngine({
      maxSlots: 5,
      stateFile,
      boardFile: path.join(TMP_DIR, 't6-board.json'),
    });

    // Rapid sequential writes to verify no corruption
    for (let i = 0; i < 20; i++) {
      e.enqueue({ title: `Rapid-${i}` });
    }
    
    // Verify state file is valid JSON
    try {
      const data = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      assert(data.version === 2, 'state file valid JSON after 20 rapid writes');
    } catch {
      assert(false, 'state file valid JSON after 20 rapid writes');
    }
  }

  // ── Test 7: Bridge file ──
  console.log('\nTest 7: Dispatch bridge (onDispatch → pending file)');
  {
    const { onDispatchBridge, getPendingTasks, ackTask, clearPending } = require('./dispatch-bridge');
    
    clearPending();
    onDispatchBridge({ taskId: 'bridge-1', title: 'Test Bridge', model: 'test', priority: 'high' });
    const pending = getPendingTasks();
    assert(pending.length === 1, 'pending dispatch recorded');
    assert(pending[0].taskId === 'bridge-1', 'correct taskId in pending');
    
    ackTask('bridge-1');
    assert(getPendingTasks().length === 0, 'pending cleared after ack');
    clearPending();
  }

  // ── Results ──
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`Results: ${pass} passed, ${fail} failed`);
  console.log(`${'═'.repeat(50)}\n`);

  cleanup();
  process.exit(fail > 0 ? 1 : 0);
}

main();
