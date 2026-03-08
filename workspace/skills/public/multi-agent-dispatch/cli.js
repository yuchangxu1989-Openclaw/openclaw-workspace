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

    default:
      console.error(`Unknown command: ${cmd}`);
      console.error('Commands: enqueue, enqueue-batch, running, done, failed, cancel, heartbeat, drain, board, status, reap, clear-queue, reset');
      process.exit(1);
  }
}

main();
