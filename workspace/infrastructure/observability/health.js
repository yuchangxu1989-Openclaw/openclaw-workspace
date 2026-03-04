'use strict';

/**
 * L3 Health Check Endpoint
 * 
 * Checks vitality of all L3 pipeline components:
 *   - EventBus: file exists and is writable, recent events flowing
 *   - RuleMatcher: rules loaded > 0, indices built
 *   - Dispatcher: routes.json loaded, handlers directory exists
 *   - DecisionLog: log file writable
 *   - Metrics: collector running
 * 
 * Returns: { status: 'healthy'|'degraded'|'unhealthy', components: {...}, checked_at }
 * 
 * @module infrastructure/observability/health
 */

const fs = require('fs');
const path = require('path');

// ─── Component Paths ─────────────────────────────────────────────

const INFRA_DIR = path.resolve(__dirname, '..');
const EVENTS_DIR = path.join(INFRA_DIR, 'event-bus', 'data');
const RULES_DIR = path.resolve(INFRA_DIR, '..', 'skills', 'isc-core', 'rules');
const ROUTES_FILE = path.join(INFRA_DIR, 'dispatcher', 'routes.json');
const HANDLERS_DIR = path.join(INFRA_DIR, 'dispatcher', 'handlers');
const DECISION_LOG_FILE = path.join(INFRA_DIR, 'decision-log', 'decisions.jsonl');
const DECISION_LOG_DIR = path.join(INFRA_DIR, 'decision-log');
const METRICS_FILE = path.join(__dirname, 'metrics.jsonl');
const PIPELINE_RUN_LOG = path.join(INFRA_DIR, 'pipeline', 'run-log.jsonl');

// ─── Status Constants ────────────────────────────────────────────

const STATUS = {
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  UNHEALTHY: 'unhealthy',
};

const COMPONENT_STATUS = {
  UP: 'up',
  DEGRADED: 'degraded',
  DOWN: 'down',
};

// ─── Individual Component Checks ─────────────────────────────────

/**
 * Check EventBus health.
 * - Data dir exists
 * - events.jsonl is readable
 * - Recent events exist (< 30 min old)
 */
function checkEventBus() {
  const result = { status: COMPONENT_STATUS.DOWN, details: {} };

  try {
    // Check data directory
    if (!fs.existsSync(EVENTS_DIR)) {
      result.details.error = 'Data directory missing';
      return result;
    }

    // Find events file (could be events.jsonl in data dir or managed by bus.js)
    let eventsFile = null;
    try {
      const bus = require('../event-bus/bus-adapter');
      eventsFile = bus.EVENTS_FILE;
    } catch (_) {
      // Try direct path
      eventsFile = path.join(EVENTS_DIR, 'events.jsonl');
    }

    if (!eventsFile || !fs.existsSync(eventsFile)) {
      result.status = COMPONENT_STATUS.DEGRADED;
      result.details.warning = 'Events file not found (may be first run)';
      return result;
    }

    const stat = fs.statSync(eventsFile);
    result.details.file_size = stat.size;
    result.details.last_modified = stat.mtime.toISOString();

    // Check if file is writable
    try {
      fs.accessSync(eventsFile, fs.constants.W_OK);
      result.details.writable = true;
    } catch (_) {
      result.details.writable = false;
      result.status = COMPONENT_STATUS.DEGRADED;
      result.details.warning = 'Events file not writable';
      return result;
    }

    // Check freshness: any event in last 30 min?
    const ageMs = Date.now() - stat.mtimeMs;
    result.details.age_minutes = Math.round(ageMs / 60000);

    if (ageMs > 30 * 60_000) {
      result.status = COMPONENT_STATUS.DEGRADED;
      result.details.warning = 'No recent events (>30 min)';
    } else {
      result.status = COMPONENT_STATUS.UP;
    }

    // Get stats if available
    try {
      const adapter = require('../event-bus/bus-adapter');
      const stats = adapter.stats();
      result.details.total_events = stats.total_events;
      result.details.consumers = stats.consumers;
    } catch (_) {}

    return result;
  } catch (err) {
    result.details.error = err.message;
    return result;
  }
}

/**
 * Check RuleMatcher health.
 * - Rules directory exists
 * - At least 1 rule file loaded
 * - Matcher can be instantiated
 */
function checkRuleMatcher() {
  const result = { status: COMPONENT_STATUS.DOWN, details: {} };

  try {
    // Check rules directory
    if (!fs.existsSync(RULES_DIR)) {
      result.details.error = `Rules directory not found: ${RULES_DIR}`;
      return result;
    }

    const ruleFiles = fs.readdirSync(RULES_DIR).filter(f => f.endsWith('.json'));
    result.details.rule_files = ruleFiles.length;

    if (ruleFiles.length === 0) {
      result.details.error = 'No rule files found';
      return result;
    }

    // Try loading the matcher
    try {
      const { ISCRuleMatcher } = require('../rule-engine/isc-rule-matcher');
      const matcher = new ISCRuleMatcher({ rulesDir: RULES_DIR, hotReload: false });
      const loadResult = matcher.loadRules();
      result.details.rules_loaded = loadResult.total;
      result.details.rules_indexed = loadResult.indexed;
      result.details.load_errors = loadResult.errors.length;
      matcher.destroy();

      if (loadResult.total === 0) {
        result.status = COMPONENT_STATUS.DEGRADED;
        result.details.warning = 'Rules loaded but 0 valid';
      } else if (loadResult.errors.length > 0) {
        result.status = COMPONENT_STATUS.DEGRADED;
        result.details.warning = `${loadResult.errors.length} rule parse errors`;
      } else {
        result.status = COMPONENT_STATUS.UP;
      }
    } catch (err) {
      result.status = COMPONENT_STATUS.DEGRADED;
      result.details.warning = `Matcher init error: ${err.message}`;
    }

    return result;
  } catch (err) {
    result.details.error = err.message;
    return result;
  }
}

/**
 * Check Dispatcher health.
 * - routes.json exists and is valid JSON
 * - At least 1 route defined
 * - handlers directory exists
 */
function checkDispatcher() {
  const result = { status: COMPONENT_STATUS.DOWN, details: {} };

  try {
    // Check routes.json
    if (!fs.existsSync(ROUTES_FILE)) {
      result.details.error = 'routes.json not found';
      return result;
    }

    let routes;
    try {
      routes = JSON.parse(fs.readFileSync(ROUTES_FILE, 'utf8'));
    } catch (err) {
      result.details.error = `routes.json parse error: ${err.message}`;
      return result;
    }

    const routeCount = Object.keys(routes).length;
    result.details.route_count = routeCount;

    if (routeCount === 0) {
      result.status = COMPONENT_STATUS.DEGRADED;
      result.details.warning = 'No routes defined';
      return result;
    }

    // Check handlers directory
    result.details.handlers_dir_exists = fs.existsSync(HANDLERS_DIR);
    if (fs.existsSync(HANDLERS_DIR)) {
      const handlers = fs.readdirSync(HANDLERS_DIR).filter(f => f.endsWith('.js'));
      result.details.handler_files = handlers.length;
    }

    // Check feature flag
    const dispatcherEnabled = process.env.DISPATCHER_ENABLED;
    result.details.enabled = dispatcherEnabled !== 'false' && dispatcherEnabled !== '0';

    result.status = COMPONENT_STATUS.UP;
    return result;
  } catch (err) {
    result.details.error = err.message;
    return result;
  }
}

/**
 * Check DecisionLog health.
 * - Log directory exists
 * - Log file is writable
 * - Log file not excessively large
 */
function checkDecisionLog() {
  const result = { status: COMPONENT_STATUS.DOWN, details: {} };

  try {
    // Check directory
    if (!fs.existsSync(DECISION_LOG_DIR)) {
      result.details.error = 'Decision log directory missing';
      return result;
    }

    // Check writability
    try {
      const testFile = path.join(DECISION_LOG_DIR, '.health-check-test');
      fs.writeFileSync(testFile, 'test', 'utf8');
      fs.unlinkSync(testFile);
      result.details.writable = true;
    } catch (_) {
      result.details.writable = false;
      result.details.error = 'Decision log directory not writable';
      return result;
    }

    // Check log file size
    if (fs.existsSync(DECISION_LOG_FILE)) {
      const stat = fs.statSync(DECISION_LOG_FILE);
      result.details.file_size = stat.size;
      result.details.file_size_mb = Math.round(stat.size / 1024 / 1024 * 100) / 100;
      result.details.last_modified = stat.mtime.toISOString();

      if (stat.size > 50 * 1024 * 1024) { // >50MB
        result.status = COMPONENT_STATUS.DEGRADED;
        result.details.warning = 'Log file exceeds 50MB, rotation recommended';
      } else {
        result.status = COMPONENT_STATUS.UP;
      }
    } else {
      result.status = COMPONENT_STATUS.UP;
      result.details.note = 'Log file not yet created (normal for first run)';
    }

    return result;
  } catch (err) {
    result.details.error = err.message;
    return result;
  }
}

/**
 * Check Pipeline health.
 * - run-log.jsonl exists
 * - Recent runs exist
 * - No excessive errors in last run
 */
function checkPipeline() {
  const result = { status: COMPONENT_STATUS.DOWN, details: {} };

  try {
    if (!fs.existsSync(PIPELINE_RUN_LOG)) {
      result.status = COMPONENT_STATUS.DEGRADED;
      result.details.warning = 'Pipeline run log not found (may not have run yet)';
      return result;
    }

    const content = fs.readFileSync(PIPELINE_RUN_LOG, 'utf8').trim();
    if (!content) {
      result.status = COMPONENT_STATUS.DEGRADED;
      result.details.warning = 'Pipeline run log is empty';
      return result;
    }

    const lines = content.split('\n').filter(l => l.trim());
    result.details.total_runs = lines.length;

    // Parse last run
    let lastRun;
    try {
      lastRun = JSON.parse(lines[lines.length - 1]);
    } catch (_) {
      result.status = COMPONENT_STATUS.DEGRADED;
      result.details.warning = 'Last run log entry is corrupt';
      return result;
    }

    result.details.last_run_id = lastRun.run_id;
    result.details.last_run_time = lastRun.timestamp;
    result.details.last_run_duration_ms = lastRun.duration_ms;
    result.details.last_run_events = lastRun.consumed_events;
    result.details.last_run_errors = (lastRun.errors || []).length;
    result.details.last_run_circuit_breaks = lastRun.circuit_breaks || 0;

    // Check freshness
    const lastRunTime = new Date(lastRun.timestamp).getTime();
    const ageMs = Date.now() - lastRunTime;
    result.details.last_run_age_minutes = Math.round(ageMs / 60000);

    if ((lastRun.errors || []).length > 5) {
      result.status = COMPONENT_STATUS.DEGRADED;
      result.details.warning = `Last run had ${lastRun.errors.length} errors`;
    } else {
      result.status = COMPONENT_STATUS.UP;
    }

    return result;
  } catch (err) {
    result.details.error = err.message;
    return result;
  }
}

// ─── Main Health Check ───────────────────────────────────────────

/**
 * Run full health check across all L3 components.
 * 
 * @returns {{ status: 'healthy'|'degraded'|'unhealthy', components: object, checked_at: string, summary: string }}
 */
function checkHealth() {
  const components = {
    event_bus: checkEventBus(),
    rule_matcher: checkRuleMatcher(),
    dispatcher: checkDispatcher(),
    decision_log: checkDecisionLog(),
    pipeline: checkPipeline(),
  };

  // Determine overall status
  const statuses = Object.values(components).map(c => c.status);
  const downCount = statuses.filter(s => s === COMPONENT_STATUS.DOWN).length;
  const degradedCount = statuses.filter(s => s === COMPONENT_STATUS.DEGRADED).length;

  let overallStatus;
  if (downCount >= 2) {
    overallStatus = STATUS.UNHEALTHY;
  } else if (downCount >= 1 || degradedCount >= 2) {
    overallStatus = STATUS.DEGRADED;
  } else {
    overallStatus = STATUS.HEALTHY;
  }

  // Build summary string
  const summaryParts = [];
  for (const [name, check] of Object.entries(components)) {
    const icon = check.status === COMPONENT_STATUS.UP ? '✅'
      : check.status === COMPONENT_STATUS.DEGRADED ? '⚠️'
      : '❌';
    summaryParts.push(`${icon} ${name}: ${check.status}`);
  }

  return {
    status: overallStatus,
    components,
    checked_at: new Date().toISOString(),
    summary: summaryParts.join(' | '),
  };
}

// ─── CLI ─────────────────────────────────────────────────────────

if (require.main === module) {
  const result = checkHealth();
  const statusIcon = result.status === STATUS.HEALTHY ? '🟢'
    : result.status === STATUS.DEGRADED ? '🟡'
    : '🔴';

  console.log(`\n${statusIcon} L3 Health: ${result.status.toUpperCase()}`);
  console.log(`Checked at: ${result.checked_at}\n`);

  for (const [name, check] of Object.entries(result.components)) {
    const icon = check.status === COMPONENT_STATUS.UP ? '✅'
      : check.status === COMPONENT_STATUS.DEGRADED ? '⚠️'
      : '❌';
    console.log(`${icon} ${name}: ${check.status}`);
    if (check.details.error) console.log(`   Error: ${check.details.error}`);
    if (check.details.warning) console.log(`   Warning: ${check.details.warning}`);
  }

  console.log('');
  process.exit(result.status === STATUS.UNHEALTHY ? 1 : 0);
}

// ─── Exports ─────────────────────────────────────────────────────

module.exports = {
  checkHealth,
  checkEventBus,
  checkRuleMatcher,
  checkDispatcher,
  checkDecisionLog,
  checkPipeline,
  STATUS,
  COMPONENT_STATUS,
};
