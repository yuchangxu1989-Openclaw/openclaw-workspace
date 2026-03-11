#!/usr/bin/env node
'use strict';

/**
 * multi-agent-dispatch CLI
 * ────────────────────────
 * Minimal CLI for the dispatch engine.
 * 
 * Usage:
 *   node cli.js enqueue '{"title":"Build auth","model":"boom-coder/gpt-5.3-codex"}'
 *   node cli.js enqueue-batch '[{"title":"Task A"},{"title":"Task B"}]'
 *   node cli.js running <taskId> ['{"sessionKey":"..."}']
 *   node cli.js done <taskId> ['{"result":"ok"}']
 *   node cli.js failed <taskId> ['{"error":"timeout"}']
 *   node cli.js cancel <taskId>
 *   node cli.js heartbeat <taskId> ['{"progress":"50%"}']
 *   node cli.js drain
 *   node cli.js board
 *   node cli.js status
 *   node cli.js reap
 *   node cli.js clear-queue
 *   node cli.js reset
 *   node cli.js history [--status=done|failed] [--since=2h] [--search=text] [--limit=N]
 *   node cli.js summary
 *   node cli.js summaries [limit]
 *   node cli.js task-board
 *   node cli.js batch-create <label> <taskId1,taskId2,...>
 *   node cli.js batch-status
 *   node cli.js add-to-batch <batchId> <taskId>
 */

const { DispatchEngine } = require('./dispatch-engine');

function parseJson(raw, fallback = {}) {
  if (!raw) return fallback;
  try { return JSON.parse(raw); }
  catch { return fallback; }
}

function out(data) {
  console.log(JSON.stringify(data, null, 2));
}

function main() {
  const [cmd = 'status', arg1, arg2] = process.argv.slice(2);
  const engine = new DispatchEngine();

  switch (cmd) {
    case 'enqueue': {
      const task = engine.enqueue(parseJson(arg1));
      out({ ok: true, cmd, task, freeSlots: engine.freeSlots() });
      break;
    }

    case 'enqueue-batch': {
      const tasks = engine.enqueueBatch(parseJson(arg1, []));
      out({ ok: true, cmd, count: tasks.length, freeSlots: engine.freeSlots() });
      break;
    }

    case 'running': {
      const task = engine.markRunning(arg1, parseJson(arg2));
      out({ ok: true, cmd, task });
      break;
    }

    case 'done': {
      const task = engine.markDone(arg1, parseJson(arg2));
      out({ ok: true, cmd, task, freeSlots: engine.freeSlots() });
      break;
    }

    case 'failed': {
      const task = engine.markFailed(arg1, parseJson(arg2));
      out({ ok: true, cmd, task, freeSlots: engine.freeSlots() });
      break;
    }

    case 'cancel': {
      const task = engine.cancel(arg1);
      out({ ok: true, cmd, task, freeSlots: engine.freeSlots() });
      break;
    }

    case 'heartbeat': {
      const task = engine.heartbeat(arg1, parseJson(arg2));
      out({ ok: true, cmd, task });
      break;
    }

    case 'drain': {
      const dispatched = engine.drain();
      out({ ok: true, cmd, dispatched: dispatched.length, freeSlots: engine.freeSlots() });
      break;
    }

    case 'board': {
      out(engine.liveBoard());
      break;
    }

    case 'status': {
      const board = engine.liveBoard();
      out({
        ok: true,
        maxSlots:   board.summary.maxSlots,
        busy:       board.summary.busySlots,
        free:       board.summary.freeSlots,
        queued:     board.summary.queueDepth,
        running:    board.summary.runningCount,
        spawning:   board.summary.spawningCount,
        utilisation: board.summary.utilisation,
      });
      break;
    }

    case 'reap': {
      const reaped = engine.reapStale();
      out({ ok: true, cmd, reaped: reaped.length, details: reaped });
      break;
    }

    case 'clear-queue': {
      const count = engine.clearQueue();
      out({ ok: true, cmd, cleared: count });
      break;
    }

    case 'reset': {
      engine.reset();
      out({ ok: true, cmd: 'reset' });
      break;
    }

    case 'history': {
      // Parse flags: --status=X --since=Xh --search=X --limit=N
      const opts = {};
      for (const a of process.argv.slice(3)) {
        if (a.startsWith('--status=')) opts.status = a.split('=')[1];
        else if (a.startsWith('--since=')) {
          const raw = a.split('=')[1];
          const m = raw.match(/^(\d+)(h|m|d)$/);
          if (m) {
            const ms = { h: 3600000, m: 60000, d: 86400000 }[m[2]] * Number(m[1]);
            opts.since = new Date(Date.now() - ms).toISOString();
          } else {
            opts.since = raw; // assume ISO string
          }
        }
        else if (a.startsWith('--search=')) opts.search = a.split('=')[1];
        else if (a.startsWith('--limit=')) opts.limit = Number(a.split('=')[1]);
      }
      if (!opts.limit) opts.limit = 20;
      const history = engine.queryHistory(opts);
      out({ ok: true, cmd, count: history.length, records: history });
      break;
    }

    case 'summary': {
      const summary = engine.generateSummary('manual');
      out({ ok: true, cmd, summary });
      break;
    }

    case 'summaries': {
      const limit = arg1 ? Number(arg1) : 10;
      const summaries = engine.getSummaries(limit);
      out({ ok: true, cmd, count: summaries.length, summaries });
      break;
    }

    case 'task-board': {
      const board = engine.getTaskBoard();
      out(board);
      break;
    }

    case 'batch-create': {
      if (!arg1) { console.error('Usage: batch-create <label> <id1,id2,...>'); process.exit(1); }
      const taskIds = (arg2 || '').split(',').filter(Boolean);
      const batch = engine.createBatch(arg1, taskIds);
      out({ ok: true, cmd, batch });
      break;
    }

    case 'batch-status': {
      const batches = engine.getBatches();
      out({ ok: true, cmd, batches });
      break;
    }

    case 'add-to-batch': {
      if (!arg1 || !arg2) { console.error('Usage: add-to-batch <batchId> <taskId>'); process.exit(1); }
      engine.addToBatch(arg1, arg2);
      out({ ok: true, cmd, batchId: arg1, taskId: arg2 });
      break;
    }

    default:
      console.error(`Unknown command: ${cmd}`);
      console.error('Commands: enqueue, enqueue-batch, running, done, failed, cancel, heartbeat, drain, board, status, reap, clear-queue, reset, history, summary, summaries, task-board, batch-create, batch-status, add-to-batch');
      process.exit(1);
  }
}

main();
