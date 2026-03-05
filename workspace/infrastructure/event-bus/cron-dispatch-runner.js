#!/usr/bin/env node
'use strict';

/**
 * cron-dispatch-runner.js
 * 
 * Cron script: reads recent events from event log (last 5 min),
 * dispatches each through the Dispatcher for rule matching.
 * 
 * Designed to be called by the "every 5 minutes event-dispatcher" cron job.
 */

const fs = require('fs');
const path = require('path');
const { Dispatcher } = require('./dispatcher');

const EVENTS_LOG = path.resolve(__dirname, 'events.jsonl');
const CURSOR_FILE = path.resolve(__dirname, '.cron-dispatch-cursor.json');
const WINDOW_MS = 5 * 60 * 1000; // 5 minutes

function readCursor() {
  try {
    return JSON.parse(fs.readFileSync(CURSOR_FILE, 'utf8'));
  } catch (_) {
    return { lastTimestamp: 0, lastId: null };
  }
}

function writeCursor(cursor) {
  fs.writeFileSync(CURSOR_FILE, JSON.stringify(cursor, null, 2));
}

function readRecentEvents(sinceTs) {
  if (!fs.existsSync(EVENTS_LOG)) return [];
  const content = fs.readFileSync(EVENTS_LOG, 'utf8').trim();
  if (!content) return [];
  
  const events = [];
  for (const line of content.split('\n')) {
    try {
      const evt = JSON.parse(line);
      if (evt.timestamp >= sinceTs) events.push(evt);
    } catch (_) { /* skip corrupt lines */ }
  }
  return events;
}

async function main() {
  const dispatcher = new Dispatcher();
  await dispatcher.init();

  const ruleCount = dispatcher.getRuleCount();
  console.log(`[cron-dispatch] Dispatcher initialized with ${ruleCount} rules`);

  if (ruleCount === 0) {
    console.log('[cron-dispatch] No rules loaded, exiting');
    return;
  }

  const cursor = readCursor();
  const cutoff = Math.max(cursor.lastTimestamp, Date.now() - WINDOW_MS);
  const events = readRecentEvents(cutoff);

  // Filter out already-processed events (by lastId dedup)
  let startIdx = 0;
  if (cursor.lastId) {
    const idx = events.findIndex(e => e.id === cursor.lastId);
    if (idx >= 0) startIdx = idx + 1;
  }

  const toProcess = events.slice(startIdx);
  console.log(`[cron-dispatch] ${toProcess.length} events to dispatch (since ${new Date(cutoff).toISOString()})`);

  let processed = 0;
  let lastEvt = null;

  for (const evt of toProcess) {
    try {
      await dispatcher.dispatch(evt.type, evt.payload || {});
      processed++;
      lastEvt = evt;
    } catch (e) {
      console.error(`[cron-dispatch] Failed to dispatch ${evt.id}: ${e.message}`);
    }
  }

  // Update cursor
  if (lastEvt) {
    writeCursor({ lastTimestamp: lastEvt.timestamp, lastId: lastEvt.id });
  }

  const stats = dispatcher.getStats();
  console.log(`[cron-dispatch] Done: ${processed}/${toProcess.length} dispatched, stats:`, JSON.stringify(stats));
}

main().catch(e => {
  console.error(`[cron-dispatch] Fatal: ${e.message}`);
  process.exit(1);
});
