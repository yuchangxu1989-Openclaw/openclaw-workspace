'use strict';

/**
 * Event Dispatcher v2.0
 * 
 * Execution-layer entry point: after rule matching, dispatches tasks
 * to the corresponding handler for execution.
 * 
 * Core features:
 *   1. loadHandlers()        - load handler mapping from routes.json + convention
 *   2. dispatch(rule, event)  - execute handler with timeout control (30s default)
 *   3. Four-level priority routing: exact > prefix > suffix > wildcard
 *   4. Fault tolerance: retry once → manual queue
 *   5. Feature flag: DISPATCHER_ENABLED
 *   6. Decision log
 * 
 * CommonJS, pure Node.js, zero external dependencies.
 */

const fs = require('fs');
const path = require('path');

const { DispatchLayer } = require('./dispatch-layer');

// ── Dispatch Engine greyscale switch ─────────────────────────────────────────
// DISPATCH_ENGINE env var controls which engine is used:
//   'old'  → DispatchLayer only (original behaviour, default)
//   'new'  → DispatchEngine only (new 19-slot engine)
//   'dual' → Both record, only old executes (shadow mode for validation)
// Rollback: set DISPATCH_ENGINE=old and restart cron / gateway.
const DISPATCH_ENGINE_MODE = (process.env.DISPATCH_ENGINE || 'old').toLowerCase();
let _dispatchEngine = null;
function getDispatchEngine() {
  if (_dispatchEngine) return _dispatchEngine;
  try {
    const { DispatchEngine } = require('../../skills/public/multi-agent-dispatch/dispatch-engine');
    _dispatchEngine = new DispatchEngine({
      maxSlots: parseInt(process.env.DISPATCH_ENGINE_SLOTS || '3', 10), // greyscale: start with 3
    });
    return _dispatchEngine;
  } catch (e) {
    console.error('[dispatcher] Failed to load DispatchEngine:', e.message);
    return null;
  }
}

// Decision Logger — unified audit trail
let _decisionLogger = null;
try {
  _decisionLogger = require('../decision-log/decision-logger');
} catch (_) {
  // DecisionLogger unavailable — continue with local log only
}

// ─── Observability: Metrics ───
let _metrics = null;
try { _metrics = require('../observability/metrics'); } catch (_) {}

// ─── Paths ───────────────────────────────────────────────────────

const ROUTES_FILE = path.join(__dirname, 'routes.json');
const HANDLERS_DIR = path.join(__dirname, 'handlers');
const MANUAL_QUEUE_FILE = path.join(__dirname, 'manual-queue.jsonl');
const DECISION_LOG_FILE = path.join(__dirname, 'decision.log');
const DEFAULT_TIMEOUT_MS = 30000;

// ─── Route Cache ─────────────────────────────────────────────────

/** @type {Map<string, {pattern: string, config: object}|null>} */
const _routeCache = new Map();

// ─── Feature Flag ────────────────────────────────────────────────

function isEnabled() {
  const flag = process.env.DISPATCHER_ENABLED;
  // Default enabled; only disabled when explicitly set to 'false' or '0'
  if (flag === 'false' || flag === '0') return false;
  return true;
}

// ─── Decision Log ────────────────────────────────────────────────

function logDecision(entry) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    ...entry,
  });
  // 1. Local decision.log (module-level detail)
  try {
    fs.appendFileSync(DECISION_LOG_FILE, line + '\n');
  } catch (_) { /* best-effort */ }

  // 2. Unified DecisionLogger (cross-module audit trail)
  if (_decisionLogger && typeof _decisionLogger.log === 'function') {
    try {
      // Build detailed why with routing reasoning
      const whyParts = [];
      if (entry.matchedPattern) whyParts.push(`路由模式: ${entry.matchedPattern}`);
      if (entry.handler && entry.handler !== 'none') whyParts.push(`handler: ${entry.handler}`);
      if (entry.eventType) whyParts.push(`事件: ${entry.eventType}`);
      if (entry.reason) whyParts.push(`原因: ${entry.reason}`);
      if (entry.attempt) whyParts.push(`尝试次数: ${entry.attempt}`);
      if (entry.error) whyParts.push(`错误: ${entry.error}`);

      // Build alternatives considered from routing context
      const alternatives = [];
      if (entry._routeCandidates && Array.isArray(entry._routeCandidates)) {
        for (const c of entry._routeCandidates) {
          if (c.pattern !== entry.matchedPattern) {
            alternatives.push({
              id: `${c.pattern}→${c.handler || 'unknown'}`,
              priority: c.level,
              reason: `路由级别${c.level}低于选中的${entry._selectedLevel || '?'}`,
            });
          }
        }
      }

      _decisionLogger.log({
        phase: 'execution',
        component: 'Dispatcher',
        decision: `路由 ${entry.action || 'unknown'} → ${entry.handler || 'none'} (${entry.result || 'unknown'})`,
        what: `Dispatch ${entry.action || 'unknown'} → ${entry.result || 'unknown'}`,
        why: whyParts.join('; ') || `handler=${entry.handler || 'none'}, event=${entry.eventType || 'unknown'}`,
        confidence: 1.0,
        alternatives_considered: alternatives,
        decision_method: 'rule_match',
        input_summary: JSON.stringify(entry).slice(0, 500),
      });
    } catch (_) {
      // DecisionLogger failure is non-fatal
    }
  }
}

// ─── Manual Queue ────────────────────────────────────────────────

function enqueueManual(rule, event, error) {
  const record = JSON.stringify({
    ts: new Date().toISOString(),
    ruleId: rule.id || rule.action || 'unknown',
    action: rule.action,
    eventType: event.type || event.eventType || 'unknown',
    eventId: event.id || 'unknown',
    error: error instanceof Error ? error.message : String(error),
    event,
    rule,
  });
  try {
    fs.appendFileSync(MANUAL_QUEUE_FILE, record + '\n');
  } catch (_) { /* best-effort */ }
}

// ─── Handler Loading ─────────────────────────────────────────────

/**
 * Load handler mapping from:
 *   1. routes.json — explicit route → handler config
 *   2. handlers/ directory — convention-based: filename (without .js) maps to action name
 * 
 * Returns: Map<string, { handler: Function|null, config: object, source: string }>
 */
function loadHandlers() {
  const handlers = new Map();

  // 1. Load routes.json
  let routes = {};
  if (fs.existsSync(ROUTES_FILE)) {
    try {
      routes = JSON.parse(fs.readFileSync(ROUTES_FILE, 'utf8'));
    } catch (err) {
      logDecision({ level: 'error', msg: `Failed to parse routes.json: ${err.message}` });
    }
  }

  for (const [pattern, config] of Object.entries(routes)) {
    handlers.set(pattern, {
      handler: null, // lazy-loaded
      config,
      source: 'routes.json',
    });
  }

  // 2. Convention-based: scan handlers/ directory
  if (fs.existsSync(HANDLERS_DIR)) {
    try {
      const files = fs.readdirSync(HANDLERS_DIR).filter(f => f.endsWith('.js'));
      for (const file of files) {
        const name = path.basename(file, '.js');
        // Don't override explicit routes
        if (!handlers.has(name)) {
          const fullPath = path.join(HANDLERS_DIR, file);
          let handlerFn = null;
          try {
            handlerFn = require(fullPath);
            // Support module.exports = fn or module.exports = { handle: fn }
            if (typeof handlerFn !== 'function' && typeof handlerFn.handle === 'function') {
              handlerFn = handlerFn.handle;
            }
          } catch (err) {
            logDecision({ level: 'warn', msg: `Failed to load handler ${file}: ${err.message}` });
          }
          handlers.set(name, {
            handler: typeof handlerFn === 'function' ? handlerFn : null,
            config: { handler: name, description: `Convention-loaded from ${file}` },
            source: 'convention',
          });
        }
      }
    } catch (_) { /* handlers dir read error — non-fatal */ }
  }

  return handlers;
}

/**
 * Resolve a handler function by name.
 * Tries:
 *   1. Already-loaded function in handler map
 *   2. handlers/<name>.js file
 * 
 * Returns function or null.
 */
function resolveHandler(handlerName, handlerMap) {
  // Check if already in map with a loaded function
  if (handlerMap && handlerMap.has(handlerName)) {
    const entry = handlerMap.get(handlerName);
    if (typeof entry.handler === 'function') return entry.handler;
  }

  // If handlerName looks like a path, try resolving from workspace root
  if (handlerName.includes('/')) {
    const WORKSPACE = path.resolve(__dirname, '../..');
    const absPath = path.isAbsolute(handlerName)
      ? handlerName
      : path.resolve(WORKSPACE, handlerName);
    const candidate = absPath.endsWith('.js') ? absPath : `${absPath}.js`;
    if (fs.existsSync(candidate)) {
      try {
        let mod = require(candidate);
        if (typeof mod === 'function') return mod;
        if (mod && typeof mod.handle === 'function') return mod.handle;
        if (mod && typeof mod.execute === 'function') return mod.execute;
      } catch (_) { /* load failed */ }
    }
    // Fall through to basename short-name lookup
    const baseName = path.basename(handlerName, '.js');
    const fallbackPath = path.join(HANDLERS_DIR, `${baseName}.js`);
    if (fs.existsSync(fallbackPath)) {
      try {
        let mod = require(fallbackPath);
        if (typeof mod === 'function') return mod;
        if (mod && typeof mod.handle === 'function') return mod.handle;
      } catch (_) { /* load failed */ }
    }
  }

  // Try convention load from HANDLERS_DIR
  const handlerPath = path.join(HANDLERS_DIR, `${handlerName}.js`);
  if (fs.existsSync(handlerPath)) {
    try {
      let mod = require(handlerPath);
      if (typeof mod === 'function') return mod;
      if (mod && typeof mod.handle === 'function') return mod.handle;
    } catch (_) { /* load failed */ }
  }

  return null;
}

// ─── Four-Level Priority Routing ─────────────────────────────────

/**
 * Route classification for each pattern in routes.json:
 *   Level 1: Exact match     — "system.error" matches "system.error" only
 *   Level 2: Prefix match    — "isc.rule.*" matches "isc.rule.created", "isc.rule.updated"
 *   Level 3: Suffix match    — "*.completed" matches "aeo.assessment.completed"
 *   Level 4: Wildcard        — "*" matches everything
 */

function classifyPattern(pattern) {
  if (pattern === '*') return { level: 4, type: 'wildcard' };
  if (pattern.startsWith('*.')) return { level: 3, type: 'suffix', suffix: pattern.slice(2) };
  if (pattern.endsWith('.*')) return { level: 2, type: 'prefix', prefix: pattern.slice(0, -2) };
  return { level: 1, type: 'exact' };
}

function matchPattern(eventAction, pattern) {
  const cls = classifyPattern(pattern);
  switch (cls.type) {
    case 'exact':
      return eventAction === pattern;
    case 'prefix':
      return eventAction === cls.prefix || eventAction.startsWith(cls.prefix + '.');
    case 'suffix':
      return eventAction === cls.suffix || eventAction.endsWith('.' + cls.suffix);
    case 'wildcard':
      return true;
    default:
      return false;
  }
}

/**
 * Find the best matching route for an action string.
 * Uses four-level priority: exact > prefix > suffix > wildcard.
 * Results are cached for performance.
 * 
 * @param {string} action - The action/event-type string to match
 * @param {Object} routes - The routes object from routes.json
 * @returns {{ pattern: string, config: object } | null}
 */
function findRoute(action, routes) {
  // Check cache first
  if (_routeCache.has(action)) {
    return _routeCache.get(action);
  }

  const candidates = { 1: [], 2: [], 3: [], 4: [] };

  for (const [pattern, config] of Object.entries(routes)) {
    if (matchPattern(action, pattern)) {
      const cls = classifyPattern(pattern);
      candidates[cls.level].push({ pattern, config });
    }
  }

  let result = null;

  // Level 1: exact — should be at most one
  if (candidates[1].length > 0) {
    result = candidates[1][0];
  }
  // Level 2: prefix — pick longest prefix (most specific)
  else if (candidates[2].length > 0) {
    candidates[2].sort((a, b) => b.pattern.length - a.pattern.length);
    result = candidates[2][0];
  }
  // Level 3: suffix — pick longest suffix (most specific)
  else if (candidates[3].length > 0) {
    candidates[3].sort((a, b) => b.pattern.length - a.pattern.length);
    result = candidates[3][0];
  }
  // Level 4: wildcard
  else if (candidates[4].length > 0) {
    result = candidates[4][0];
  }

  // Cache the result (including null for no-match)
  _routeCache.set(action, result);
  return result;
}

/**
 * Clear the route cache. Call after routes.json is reloaded.
 */
function clearRouteCache() {
  _routeCache.clear();
}

// ─── Timeout Wrapper ─────────────────────────────────────────────

/**
 * Execute a function with a timeout.
 * Supports both sync and async handlers.
 * 
 * @param {Function} fn - Handler function
 * @param {Array} args - Arguments to pass
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise<any>}
 */
function withTimeout(fn, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Handler timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    try {
      const result = fn(...args);
      // Handle both sync and async
      if (result && typeof result.then === 'function') {
        result
          .then(val => { clearTimeout(timer); resolve(val); })
          .catch(err => { clearTimeout(timer); reject(err); });
      } else {
        clearTimeout(timer);
        resolve(result);
      }
    } catch (err) {
      clearTimeout(timer);
      reject(err);
    }
  });
}

// ─── Core Dispatch ───────────────────────────────────────────────

/**
 * Dispatch an event to the appropriate handler based on a matched rule.
 * 
 * @param {object} rule - The matched rule (must have .action)
 * @param {object} event - The event to process
 * @param {object} [options] - Options
 * @param {number} [options.timeoutMs=30000] - Handler timeout
 * @param {Map} [options.handlerMap] - Pre-loaded handler map
 * @param {Object} [options.routes] - Routes object (for routing)
 * @returns {Promise<{ success: boolean, result?: any, error?: string, handler: string, duration: number, retried: boolean }>}
 */
async function dispatch(rule, event, options = {}) {
  const startTime = Date.now();
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const handlerMap = options.handlerMap || null;
  const dispatchLayer = options.dispatchLayer || new DispatchLayer();

  // ── Greyscale: mirror enqueue to new engine when mode is 'new' or 'dual' ──
  const _newEngine = (DISPATCH_ENGINE_MODE === 'new' || DISPATCH_ENGINE_MODE === 'dual')
    ? getDispatchEngine() : null;

  // ─── Metrics: track dispatch attempt ───
  if (_metrics) _metrics.inc('dispatch_total');
  const dispatchTimer = _metrics ? _metrics.startTimer('dispatch') : null;

  // Handle ISC rule wrapper format: { rule: ISC_RULE, priority, match_type, pattern }
  // Normalize to ensure rule.action exists for routing
  if (!rule.action && rule.rule) {
    const iscRule = rule.rule;
    rule.action = (iscRule.trigger && iscRule.trigger.events && iscRule.trigger.events[0])
      || event.type || event.eventType || 'unknown';
    // Carry forward ISC rule info for handlers
    rule._iscRule = iscRule;
  } else if (!rule.action) {
    rule.action = event.type || event.eventType || 'unknown';
  }

  // Feature flag check
  if (!isEnabled()) {
    const decision = {
      action: rule.action,
      eventType: event.type || event.eventType || 'unknown',
      eventId: event.id || 'unknown',
      handler: 'none',
      result: 'skipped',
      reason: 'DISPATCHER_ENABLED=false',
      duration: Date.now() - startTime,
    };
    logDecision(decision);
    return {
      success: true,
      result: 'skipped (dispatcher disabled)',
      handler: 'none',
      duration: decision.duration,
      retried: false,
      skipped: true,
    };
  }

  // Resolve route
  const routes = options.routes || _loadRoutesOnce();
  const route = findRoute(rule.action, routes);
  const handlerName = route ? route.config.handler : (rule.handler || null);

  // Collect all candidate routes for decision logging
  const _routeCandidates = [];
  for (const [pattern, config] of Object.entries(routes)) {
    if (matchPattern(rule.action, pattern)) {
      const cls = classifyPattern(pattern);
      _routeCandidates.push({ pattern, handler: config.handler, level: cls.level || cls.type });
    }
  }
  const _selectedLevel = route ? classifyPattern(route.pattern).type : 'none';

  if (!handlerName) {
    try {
      dispatchLayer.enqueue({
        taskId: event.id || `manual_${Date.now()}`,
        title: rule.action,
        source: 'dispatcher.no_route',
        priority: 'normal',
        payload: { event, rule, error: 'No handler found for action: ' + rule.action }
      });
    } catch (_) {}
    const decision = {
      action: rule.action,
      eventType: event.type || event.eventType || 'unknown',
      handler: 'none',
      result: 'no_route',
      reason: `无匹配路由: 检查了${Object.keys(routes).length}条路由规则,无一匹配 action="${rule.action}"`,
      duration: Date.now() - startTime,
      _routeCandidates,
      _selectedLevel,
    };
    logDecision(decision);
    enqueueManual(rule, event, 'No handler found for action: ' + rule.action);
    return {
      success: false,
      error: 'No handler found for action: ' + rule.action,
      handler: 'none',
      duration: decision.duration,
      retried: false,
    };
  }

  // Resolve handler function
  const handlerFn = resolveHandler(handlerName, handlerMap);

  if (!handlerFn) {
    try {
      dispatchLayer.enqueue({
        taskId: event.id || `file_${Date.now()}`,
        title: rule.action,
        source: 'dispatcher.file_dispatched',
        priority: route && route.config && route.config.priority ? route.config.priority : 'normal',
        payload: { event, rule, handlerName, route: route ? route.config : null }
      });
      dispatchLayer.dispatchNext();
    } catch (_) {}
    // No executable handler — write dispatch record (file-based dispatch)
    const dispatchRecord = {
      event,
      rule,
      route: route ? route.config : null,
      handlerName,
      dispatchedAt: new Date().toISOString(),
      status: 'pending_execution',
    };

    const dispatchDir = path.join(__dirname, 'dispatched');
    fs.mkdirSync(dispatchDir, { recursive: true });
    const dispatchFile = path.join(dispatchDir, `${event.id || Date.now()}.json`);
    fs.writeFileSync(dispatchFile, JSON.stringify(dispatchRecord, null, 2));

    const duration = Date.now() - startTime;
    const decision = {
      action: rule.action,
      eventType: event.type || event.eventType || 'unknown',
      eventId: event.id || 'unknown',
      handler: handlerName,
      matchedPattern: route ? route.pattern : 'direct',
      result: 'file_dispatched',
      duration,
    };
    logDecision(decision);

    return {
      success: true,
      result: 'file_dispatched',
      handler: handlerName,
      duration,
      retried: false,
      dispatchFile,
    };
  }

  // Execute handler with retry
  const context = {
    rule,
    route: route ? route.config : null,
    handlerName,
    matchedPattern: route ? route.pattern : 'direct',
  };

  try {
    dispatchLayer.enqueue({
      taskId: event.id || `exec_${Date.now()}`,
      title: rule.action,
      source: 'dispatcher.execution',
      priority: route && route.config && route.config.priority ? route.config.priority : 'normal',
      payload: { eventType: event.type || event.eventType || 'unknown', handlerName }
    });
    dispatchLayer.dispatchNext();

    // ── Greyscale: shadow-enqueue to new engine ──
    if (_newEngine) {
      try {
        _newEngine.enqueue({
          taskId: event.id || `exec_${Date.now()}`,
          title: rule.action,
          source: 'dispatcher.execution.greyscale',
          priority: route && route.config && route.config.priority ? route.config.priority : 'normal',
          model: 'greyscale-shadow',
          payload: { eventType: event.type || event.eventType || 'unknown', handlerName }
        });
      } catch (shadowErr) {
        console.error('[dispatcher:greyscale] shadow enqueue failed:', shadowErr.message);
      }
    }
  } catch (_) {}

  let lastError = null;
  let retried = false;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await withTimeout(handlerFn, [event, context], timeoutMs);
      const duration = Date.now() - startTime;

      // Allow handler to override the reported handler name (for sub-routing)
      const reportedHandler = (result && result.handler) || handlerName;

      logDecision({
        action: rule.action,
        eventType: event.type || event.eventType || 'unknown',
        eventId: event.id || 'unknown',
        handler: reportedHandler,
        matchedPattern: route ? route.pattern : 'direct',
        result: 'success',
        attempt: attempt + 1,
        duration,
        _routeCandidates,
        _selectedLevel,
      });

      // ─── Metrics: dispatch success ───
      if (_metrics) _metrics.inc('dispatch_success');
      if (dispatchTimer) dispatchTimer.stop();

      try {
        dispatchLayer.markTask(event.id || `exec_${Date.now()}`, 'done', { result });
        dispatchLayer.dispatchNext();
      } catch (_) {}

      return {
        success: true,
        result,
        handler: reportedHandler,
        duration,
        retried: attempt > 0,
      };
    } catch (err) {
      lastError = err;
      if (attempt === 0) {
        retried = true;
        // ─── Metrics: dispatch retry ───
        if (_metrics) _metrics.inc('dispatch_retry');

        logDecision({
          action: rule.action,
          eventType: event.type || event.eventType || 'unknown',
          eventId: event.id || 'unknown',
          handler: handlerName,
          result: 'retry',
          attempt: 1,
          error: err.message,
          duration: Date.now() - startTime,
        });
      }
    }
  }

  // Both attempts failed → manual queue
  const duration = Date.now() - startTime;
  enqueueManual(rule, event, lastError);

  // ─── Metrics: dispatch failure ───
  if (_metrics) {
    _metrics.inc('dispatch_failed');
    if (lastError && lastError.message && lastError.message.includes('timed out')) {
      _metrics.inc('dispatch_timeout');
    }
  }
  if (dispatchTimer) dispatchTimer.stop();

  logDecision({
    action: rule.action,
    eventType: event.type || event.eventType || 'unknown',
    eventId: event.id || 'unknown',
    handler: handlerName,
    matchedPattern: route ? route.pattern : 'direct',
    result: 'failed',
    error: lastError ? lastError.message : 'unknown',
    duration,
  });

  try {
    dispatchLayer.markTask(event.id || `exec_${Date.now()}`, 'failed', {
      error: lastError ? lastError.message : 'unknown'
    });
    dispatchLayer.dispatchNext();
  } catch (_) {}

  return {
    success: false,
    error: lastError ? lastError.message : 'unknown',
    handler: handlerName,
    duration,
    retried: true,
  };
}

// ─── Lazy Routes Loader ──────────────────────────────────────────

let _cachedRoutes = null;

function _loadRoutesOnce() {
  if (_cachedRoutes) return _cachedRoutes;
  if (fs.existsSync(ROUTES_FILE)) {
    try {
      _cachedRoutes = JSON.parse(fs.readFileSync(ROUTES_FILE, 'utf8'));
    } catch (_) {
      _cachedRoutes = {};
    }
  } else {
    _cachedRoutes = {};
  }
  return _cachedRoutes;
}

/**
 * Force-reload routes (useful after routes.json changes).
 */
function reloadRoutes() {
  _cachedRoutes = null;
  clearRouteCache();
  return _loadRoutesOnce();
}

// ─── CLI Entry Point ─────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`Event Dispatcher v2.0

Usage:
  node dispatcher.js                        Process events from event bus
  node dispatcher.js --dry-run              Show what would be dispatched
  node dispatcher.js --status               Show dispatcher status
  node dispatcher.js --clear-cache          Clear route cache
  node dispatcher.js --manual-queue         Show manual queue entries

Environment:
  DISPATCHER_ENABLED=true|false   Feature flag (default: true)
`);
    return;
  }

  if (args.includes('--status')) {
    console.log(JSON.stringify({
      enabled: isEnabled(),
      routesFile: fs.existsSync(ROUTES_FILE),
      handlersDir: fs.existsSync(HANDLERS_DIR),
      routeCount: Object.keys(_loadRoutesOnce()).length,
      cacheSize: _routeCache.size,
      manualQueueExists: fs.existsSync(MANUAL_QUEUE_FILE),
    }, null, 2));
    return;
  }

  if (args.includes('--manual-queue')) {
    if (!fs.existsSync(MANUAL_QUEUE_FILE)) {
      console.log('Manual queue is empty.');
      return;
    }
    const lines = fs.readFileSync(MANUAL_QUEUE_FILE, 'utf8').trim().split('\n').filter(Boolean);
    console.log(`Manual queue: ${lines.length} entries`);
    for (const line of lines.slice(-10)) {
      try {
        const entry = JSON.parse(line);
        console.log(`  [${entry.ts}] ${entry.action} → ${entry.error}`);
      } catch (_) {
        console.log(`  ${line}`);
      }
    }
    return;
  }

  // Default: integrate with event bus for batch processing
  const dryRun = args.includes('--dry-run');

  let bus;
  try {
    bus = require('../event-bus/bus.js');
  } catch (err) {
    console.error(`[Dispatcher] Cannot load event bus: ${err.message}`);
    process.exit(1);
  }

  const CONSUMER_ID = 'dispatcher';
  const routes = reloadRoutes();
  const handlerMap = loadHandlers();

  let events;
  try {
    events = bus.consume(CONSUMER_ID, {});
  } catch (err) {
    console.error(`[Dispatcher] Failed to consume events: ${err.message}`);
    process.exit(1);
  }

  console.log(`[Dispatcher] Found ${events.length} unconsumed event(s), enabled=${isEnabled()}`);

  if (events.length === 0) return;

  let processed = 0, failed = 0, skipped = 0;

  for (const evt of events) {
    const rule = { action: evt.type, ...evt };

    if (dryRun) {
      const route = findRoute(evt.type, routes);
      console.log(`[DRY-RUN] ${evt.type} → ${route ? route.config.handler : 'NO ROUTE'}`);
      continue;
    }

    const result = await dispatch(rule, evt, { routes, handlerMap });

    if (result.skipped) {
      skipped++;
    } else if (result.success) {
      processed++;
    } else {
      failed++;
    }

    // Ack the event regardless (don't re-process failures forever)
    try { bus.ack(CONSUMER_ID, evt.id); } catch (_) {}
  }

  console.log(`[Dispatcher] Done: ${processed} dispatched, ${failed} failed, ${skipped} skipped`);
}

// ─── Exports ─────────────────────────────────────────────────────

module.exports = {
  // Core API
  dispatch,
  loadHandlers,
  resolveHandler,
  findRoute,
  clearRouteCache,
  reloadRoutes,

  // Utilities
  isEnabled,
  matchPattern,
  classifyPattern,
  withTimeout,
  enqueueManual,
  logDecision,

  // CLI
  main,

  // For testing: access internals
  _routeCache,
  ROUTES_FILE,
  HANDLERS_DIR,
  MANUAL_QUEUE_FILE,
  DECISION_LOG_FILE,
  DEFAULT_TIMEOUT_MS,
};

if (require.main === module) {
  main().catch(err => {
    console.error(`[Dispatcher] Fatal: ${err.message}`);
    process.exit(1);
  });
}
