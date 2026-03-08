const fs = require('fs');
const path = require('path');
const { Dispatcher } = require('./dispatcher');
const thresholdScanner = require('./sensors/threshold-scanner');

const WORKSPACE = '/root/.openclaw/workspace';
const TMP = path.join(WORKSPACE, 'tmp', 'day2-observability-global-escalation');
const TASKS_FILE = path.join(WORKSPACE, 'infrastructure/dispatcher/state/auto-repair-tasks.json');
const REVIEWS_FILE = path.join(WORKSPACE, 'infrastructure/dispatcher/state/auto-repair-reviews.json');
const ALERTS_FILE = path.join(WORKSPACE, 'infrastructure/logs/alerts.jsonl');
const REPORTS_FILE = path.join(WORKSPACE, 'infrastructure/logs/report-snapshots.jsonl');
const EXECUTIONS_FILE = path.join(WORKSPACE, 'infrastructure/logs/auto-repair-executions.jsonl');
const THRESHOLD_STATE_FILE = path.join(WORKSPACE, 'infrastructure/event-bus/sensors/.threshold-state.json');
const EVENTS_FILE = path.join(WORKSPACE, 'infrastructure/event-bus/events.jsonl');
const CONFIG_FILE = path.join(WORKSPACE, 'infrastructure/event-bus/config/threshold-config.json');
const ROUTES_FILE = path.join(WORKSPACE, 'infrastructure/dispatcher/routes.json');

function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }
function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return fallback; } }
function jsonlRead(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => {
    try { return JSON.parse(line); } catch (_) { return null; }
  }).filter(Boolean);
}
function tasks() { const store = readJson(TASKS_FILE, { items: [] }); return store.items || store.tasks || []; }
function reviews() { const store = readJson(REVIEWS_FILE, { items: [] }); return store.items || store.reviews || []; }
function last(arr, n = 5) { return arr.slice(Math.max(0, arr.length - n)); }

(async () => {
  ensureDir(TMP);

  const dispatcher = new Dispatcher({ rulesDir: path.join(WORKSPACE, 'infrastructure/event-bus/empty-rules-for-test') });
  ensureDir(path.join(WORKSPACE, 'infrastructure/event-bus/empty-rules-for-test'));
  await dispatcher.init();

  const routeRule = JSON.parse(fs.readFileSync(ROUTES_FILE, 'utf8')).routes.find(r => r.id === 'route.global-p1-system-signals-001');
  const globalHandler = require(path.join(WORKSPACE, 'infrastructure/event-bus/handlers/global-event-escalation.js'));
  const sandboxEvents = [
    {
      id: `evt_health_bus_${Date.now()}`,
      type: 'event-bus.health.failed',
      payload: {
        severity: 'error',
        source: 'day2-observability-verifier',
        subsystem: 'event-bus',
        component: 'event-bus',
        entityType: 'health_check',
        entityId: `event-bus-sandbox-health-${Date.now()}`,
        reason: 'sandbox injected health failure',
        sandbox: true,
        manualTest: true
      }
    },
    {
      id: `evt_health_generic_${Date.now()}`,
      type: 'health.check.failed',
      payload: {
        severity: 'error',
        source: 'day2-observability-verifier',
        subsystem: 'health',
        component: 'health',
        entityType: 'health_check',
        entityId: `health-sandbox-check-${Date.now()}`,
        reason: 'sandbox injected generic health check failure',
        sandbox: true,
        manualTest: true
      }
    },
    {
      id: `evt_backlog_${Date.now()}`,
      type: 'system.eventbus.backlog_threshold_crossed',
      payload: {
        severity: 'warning',
        source: 'day2-observability-verifier',
        subsystem: 'event-bus',
        component: 'event-bus',
        entityType: 'queue_metric',
        entityId: `sandbox-backlog-threshold-${Date.now()}`,
        metric: '未消费事件积压',
        value: 999,
        threshold: 100,
        operator: 'gt',
        reason: 'sandbox injected backlog threshold crossing',
        sandbox: true,
        manualTest: true
      }
    }
  ];

  const beforeTaskIds = new Set(tasks().map(t => t.id));
  const beforeReviewIds = new Set(reviews().map(r => r.id));
  const beforeAlerts = jsonlRead(ALERTS_FILE).length;
  const beforeReports = jsonlRead(REPORTS_FILE).length;
  const beforeExecs = jsonlRead(EXECUTIONS_FILE).length;

  const directClosedLoopResults = [];
  for (const evt of sandboxEvents) {
    const result = await globalHandler(evt, routeRule, {});
    directClosedLoopResults.push({ eventType: evt.type, result });
  }

  const thresholdConfigBackup = fs.readFileSync(CONFIG_FILE, 'utf8');
  const thresholdStateBackup = fs.existsSync(THRESHOLD_STATE_FILE) ? fs.readFileSync(THRESHOLD_STATE_FILE, 'utf8') : null;
  const eventsFileBackup = fs.existsSync(EVENTS_FILE) ? fs.readFileSync(EVENTS_FILE, 'utf8') : null;

  let thresholdScanSummary = null;
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({
      thresholds: [
        {
          id: 'sandbox-unconsumed-event-backlog',
          metric: '未消费事件积压',
          measure: 'unconsumed_backlog',
          threshold: -1,
          operator: 'gt',
          eventType: 'system.eventbus.backlog_threshold_crossed',
          cooldownMs: 0
        }
      ]
    }, null, 2));
    fs.writeFileSync(THRESHOLD_STATE_FILE, JSON.stringify({}, null, 2));
    const syntheticLine = JSON.stringify({
      id: `evt_sandbox_backlog_${Date.now()}`,
      type: 'sandbox.seed',
      source: 'day2-observability-verifier',
      payload: { sandbox: true },
      timestamp: Date.now(),
      consumed_by: []
    }) + '\n';
    fs.appendFileSync(EVENTS_FILE, syntheticLine);
    thresholdScanSummary = thresholdScanner.scan();
  } finally {
    fs.writeFileSync(CONFIG_FILE, thresholdConfigBackup);
    if (thresholdStateBackup === null) {
      try { fs.unlinkSync(THRESHOLD_STATE_FILE); } catch (_) {}
    } else {
      fs.writeFileSync(THRESHOLD_STATE_FILE, thresholdStateBackup);
    }
    if (eventsFileBackup === null) {
      try { fs.unlinkSync(EVENTS_FILE); } catch (_) {}
    } else {
      fs.writeFileSync(EVENTS_FILE, eventsFileBackup);
    }
  }

  const thresholdTriggered = (thresholdScanSummary?.details || []).filter(x => x.status === 'triggered');
  const simulatedThresholdResults = [];
  for (const item of thresholdTriggered) {
    const evt = {
      id: `evt_threshold_${item.id}_${Date.now()}`,
      type: 'system.eventbus.backlog_threshold_crossed',
      payload: {
        severity: 'warning',
        source: 'threshold-scanner',
        subsystem: 'event-bus',
        component: 'event-bus',
        entityType: 'queue_metric',
        entityId: `threshold-scanner-${item.id}-${Date.now()}`,
        metric: '未消费事件积压',
        value: item.value,
        threshold: -1,
        operator: 'gt',
        reason: 'threshold scanner sandbox trigger replayed into global-event-escalation',
        sandbox: true,
        manualTest: true
      }
    };
    const result = await globalHandler(evt, routeRule, {});
    simulatedThresholdResults.push({ eventType: evt.type, thresholdId: item.id, result });
  }

  const afterTasks = tasks();
  const afterReviews = reviews();
  const newTasks = afterTasks.filter(t => !beforeTaskIds.has(t.id));
  const newReviews = afterReviews.filter(r => !beforeReviewIds.has(r.id));
  const matchedTasks = newTasks.filter(t => [
    'event-bus.health.failed',
    'health.check.failed',
    'system.eventbus.backlog_threshold_crossed'
  ].includes(t.finding?.kind));

  const result = {
    routesFile: ROUTES_FILE,
    routeRulePresent: Boolean(routeRule),
    sandbox: true,
    dispatcher: {
      rulesLoaded: dispatcher.getRuleCount(),
      stats: dispatcher.getStats()
    },
    directClosedLoopResults,
    thresholdScanSummary,
    simulatedThresholdResults,
    verification: {
      newTaskCount: newTasks.length,
      newReviewCount: newReviews.length,
      newAlertCount: jsonlRead(ALERTS_FILE).length - beforeAlerts,
      newReportCount: jsonlRead(REPORTS_FILE).length - beforeReports,
      newExecutionCount: jsonlRead(EXECUTIONS_FILE).length - beforeExecs,
      matchedClosedLoopTasks: matchedTasks.map(t => ({
        id: t.id,
        title: t.title,
        subsystem: t.subsystem,
        kind: t.finding?.kind,
        severity: t.finding?.severity,
        entityId: t.finding?.entityId,
        verification: t.finding?.verification,
        closure: t.closure,
        tags: t.tags
      })),
      matchedReviews: newReviews.map(r => ({ id: r.id, taskId: r.taskId, status: r.status, eventType: r.evidence?.eventType, sandbox: r.evidence?.sandbox })),
      latestTasks: last(afterTasks, 8).map(t => ({ id: t.id, kind: t.finding?.kind, entityId: t.finding?.entityId, source: t.source, sandbox: t.sandbox })),
      pass: matchedTasks.some(t => t.finding?.kind === 'event-bus.health.failed')
        && matchedTasks.some(t => t.finding?.kind === 'health.check.failed')
        && matchedTasks.some(t => t.finding?.kind === 'system.eventbus.backlog_threshold_crossed')
    }
  };

  const out = path.join(TMP, 'verification-result.json');
  fs.writeFileSync(out, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
})();
