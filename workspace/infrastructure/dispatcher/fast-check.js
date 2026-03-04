#!/usr/bin/env node
/**
 * Event Dispatcher - Fast Pre-check
 * 
 * Lightweight check: if no unconsumed events exist for 'dispatcher',
 * exit 0 immediately without starting the full dispatch flow.
 * 
 * This saves Agent tokens when the event bus is idle.
 * 
 * Usage (in Cron payload message):
 *   node /root/.openclaw/workspace/infrastructure/dispatcher/fast-check.js && \
 *   node /root/.openclaw/workspace/infrastructure/dispatcher/dispatcher.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const BASE_DIR = path.join(__dirname, '..', 'event-bus');
const EVENTS_FILE = path.join(BASE_DIR, 'events.jsonl');
const CURSOR_FILE = path.join(BASE_DIR, 'cursor.json');
const HEARTBEAT_FILE = path.join(__dirname, '..', 'observability', 'heartbeats.json');

function quickCheck() {
  // 1. No events file or empty → nothing to do
  if (!fs.existsSync(EVENTS_FILE)) {
    console.log('[fast-check] 事件文件不存在，跳过');
    writeHeartbeat(0, 'idle');
    return false;
  }

  const content = fs.readFileSync(EVENTS_FILE, 'utf8').trim();
  if (!content) {
    console.log('[fast-check] 事件总线为空，跳过');
    writeHeartbeat(0, 'idle');
    return false;
  }

  // 2. Check cursor for 'dispatcher'
  let cursors = {};
  if (fs.existsSync(CURSOR_FILE)) {
    try { cursors = JSON.parse(fs.readFileSync(CURSOR_FILE, 'utf8')); } catch (_) {}
  }

  const cursor = cursors['dispatcher'] || { offset: 0, acked: [] };
  const totalLines = content.split('\n').length;

  // If cursor offset >= total lines, all events consumed
  if (cursor.offset >= totalLines) {
    console.log(`[fast-check] 所有事件已消费 (offset=${cursor.offset}, total=${totalLines})，跳过`);
    writeHeartbeat(0, 'idle');
    return false;
  }

  // 3. There might be unconsumed events
  const remaining = totalLines - cursor.offset;
  console.log(`[fast-check] 发现 ${remaining} 条可能未消费的事件，继续执行dispatcher`);
  return true;
}

function writeHeartbeat(count, status) {
  try {
    const dir = path.dirname(HEARTBEAT_FILE);
    fs.mkdirSync(dir, { recursive: true });
    let hb = {};
    if (fs.existsSync(HEARTBEAT_FILE)) {
      try { hb = JSON.parse(fs.readFileSync(HEARTBEAT_FILE, 'utf8')); } catch (_) {}
    }
    hb['event-dispatcher'] = {
      lastRun: new Date().toISOString(),
      status,
      eventsProcessed: count,
      fastCheck: true
    };
    fs.writeFileSync(HEARTBEAT_FILE, JSON.stringify(hb, null, 2));
  } catch (_) { /* ignore */ }
}

// Main
const hasWork = quickCheck();
if (!hasWork) {
  process.exit(0);
} else {
  // Signal to caller that full dispatcher should run
  // Exit with code 99 so the Cron message can chain: fast-check || dispatcher
  process.exit(0);
}
