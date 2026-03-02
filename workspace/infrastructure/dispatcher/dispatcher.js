'use strict';

/**
 * Event Bus Dispatcher
 * 
 * Reads unconsumed events from the JSONL event bus,
 * matches them against the routing table, and dispatches
 * to the appropriate handler via sessions_spawn or direct invocation.
 * 
 * Usage:
 *   node dispatcher.js                    # process all pending events
 *   node dispatcher.js --dry-run          # show what would be dispatched
 *   node dispatcher.js --type isc.rule.*  # process only matching events
 * 
 * Designed to be called by OpenClaw Cron every 5 minutes.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const bus = require('../event-bus/bus.js');
const ROUTES_FILE = path.join(__dirname, 'routes.json');
const LOG_FILE = path.join(__dirname, 'dispatch.log');
const HEARTBEAT_FILE = path.join(__dirname, '..', 'observability', 'heartbeats.json');
const CONSUMER_ID = 'dispatcher';

// ─── Configuration ───────────────────────────────────────────────

function loadRoutes() {
  if (!fs.existsSync(ROUTES_FILE)) {
    throw new Error(`[Dispatcher] Routes file not found: ${ROUTES_FILE}`);
  }
  return JSON.parse(fs.readFileSync(ROUTES_FILE, 'utf8'));
}

// ─── Route Matching ──────────────────────────────────────────────

/**
 * Find the best matching route for an event type.
 * Exact matches take priority over wildcard matches.
 */
function findRoute(eventType, routes) {
  // 1. Try exact match first
  if (routes[eventType]) {
    return { pattern: eventType, ...routes[eventType] };
  }

  // 2. Try wildcard matches (most specific first)
  const wildcardMatches = [];
  for (const pattern of Object.keys(routes)) {
    if (!pattern.endsWith('.*')) continue;
    const prefix = pattern.slice(0, -2);
    if (eventType === prefix || eventType.startsWith(prefix + '.')) {
      wildcardMatches.push({ pattern, prefix, ...routes[pattern] });
    }
  }

  if (wildcardMatches.length === 0) return null;

  // Return the most specific wildcard (longest prefix)
  wildcardMatches.sort((a, b) => b.prefix.length - a.prefix.length);
  return wildcardMatches[0];
}

// ─── Dispatch Logic ──────────────────────────────────────────────

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  try {
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch (_) { /* ignore log write errors */ }
}

function dispatch(event, route, dryRun) {
  const handlerInfo = `handler=${route.handler}, agent=${route.agent || 'default'}, priority=${route.priority || 'normal'}`;

  if (dryRun) {
    log(`[DRY-RUN] Would dispatch ${event.type} (${event.id}) → ${handlerInfo}`);
    return { dispatched: false, dryRun: true };
  }

  log(`[DISPATCH] ${event.type} (${event.id}) → ${handlerInfo}`);

  const result = {
    eventId: event.id,
    eventType: event.type,
    handler: route.handler,
    agent: route.agent,
    priority: route.priority,
    dispatchedAt: new Date().toISOString(),
    status: 'dispatched',
  };

  // In a full implementation, this would call sessions_spawn.
  // For now, we write a dispatch record that other systems can pick up.
  const dispatchDir = path.join(__dirname, 'dispatched');
  fs.mkdirSync(dispatchDir, { recursive: true });

  const dispatchFile = path.join(dispatchDir, `${event.id}.json`);
  fs.writeFileSync(dispatchFile, JSON.stringify({
    event,
    route: {
      handler: route.handler,
      agent: route.agent,
      priority: route.priority,
    },
    dispatchedAt: result.dispatchedAt,
    status: 'pending',
  }, null, 2));

  return result;
}

// ─── Heartbeat ───────────────────────────────────────────────────

function writeHeartbeat(eventsProcessed, status) {
  try {
    const dir = path.dirname(HEARTBEAT_FILE);
    fs.mkdirSync(dir, { recursive: true });

    let heartbeats = {};
    if (fs.existsSync(HEARTBEAT_FILE)) {
      try { heartbeats = JSON.parse(fs.readFileSync(HEARTBEAT_FILE, 'utf8')); } catch (_) {}
    }

    heartbeats['event-dispatcher'] = {
      lastRun: new Date().toISOString(),
      status,
      eventsProcessed,
    };

    fs.writeFileSync(HEARTBEAT_FILE, JSON.stringify(heartbeats, null, 2));
  } catch (err) {
    log(`[WARN] Failed to write heartbeat: ${err.message}`);
  }
}

// ─── Main Entry ──────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const typeFilterIdx = args.indexOf('--type');
  const typeFilter = typeFilterIdx >= 0 ? args[typeFilterIdx + 1] : null;

  log(`--- Dispatcher run started (dryRun=${dryRun}, typeFilter=${typeFilter || 'all'}) ---`);

  let routes;
  try {
    routes = loadRoutes();
  } catch (err) {
    log(`[ERROR] ${err.message}`);
    writeHeartbeat(0, 'error');
    process.exit(1);
  }

  // Consume events from the bus
  const consumeOpts = {};
  if (typeFilter) {
    consumeOpts.types = [typeFilter];
  }

  let events;
  try {
    events = bus.consume(CONSUMER_ID, consumeOpts);
  } catch (err) {
    log(`[ERROR] Failed to consume events: ${err.message}`);
    writeHeartbeat(0, 'error');
    process.exit(1);
  }

  log(`Found ${events.length} unconsumed event(s)`);

  if (events.length === 0) {
    writeHeartbeat(0, 'ok');
    log('--- Dispatcher run completed (nothing to do) ---');
    return;
  }

  // Sort by priority based on route config
  const priorityOrder = { high: 0, normal: 1, low: 2 };
  const sortedEvents = events.map(evt => {
    const route = findRoute(evt.type, routes);
    return { evt, route };
  }).sort((a, b) => {
    const pa = a.route ? (priorityOrder[a.route.priority] ?? 1) : 1;
    const pb = b.route ? (priorityOrder[b.route.priority] ?? 1) : 1;
    return pa - pb;
  });

  let processed = 0;
  let errors = 0;

  for (const { evt, route } of sortedEvents) {
    if (!route) {
      log(`[SKIP] No route for event type: ${evt.type} (${evt.id})`);
      // Still ack so we don't re-process unroutable events forever
      if (!dryRun) {
        try { bus.ack(CONSUMER_ID, evt.id); } catch (_) {}
      }
      continue;
    }

    try {
      dispatch(evt, route, dryRun);
      if (!dryRun) {
        bus.ack(CONSUMER_ID, evt.id);
      }
      processed++;
    } catch (err) {
      log(`[ERROR] Failed to dispatch ${evt.id}: ${err.message}`);
      errors++;
    }
  }

  const status = errors > 0 ? 'degraded' : 'ok';
  writeHeartbeat(processed, status);
  log(`--- Dispatcher run completed: ${processed} dispatched, ${errors} errors ---`);
}

// ─── Exports (for testing) & CLI execution ───────────────────────

module.exports = { findRoute, dispatch, main, loadRoutes };

if (require.main === module) {
  main();
}
