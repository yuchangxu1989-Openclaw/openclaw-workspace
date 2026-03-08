const fs = require('fs');
const path = require('path');
const { Dispatcher } = require('./dispatcher');
const thresholdScanner = require('./sensors/threshold-scanner');
const globalEscalation = require('./handlers/global-event-escalation');

const WORKSPACE = '/root/.openclaw/workspace';
const TMP = path.join(WORKSPACE, 'tmp', 'pipeline-health-autonomy');
const TASKS_FILE = path.join(WORKSPACE, 'infrastructure/dispatcher/state/auto-repair-tasks.json');
const REVIEWS_FILE = path.join(WORKSPACE, 'infrastructure/dispatcher/state/auto-repair-reviews.json');
const ALERTS_FILE = path.join(WORKSPACE, 'infrastructure/logs/alerts.jsonl');
const REPORTS_FILE = path.join(WORKSPACE, 'infrastructure/logs/report-snapshots.jsonl');
const EXECUTIONS_FILE = path.join(WORKSPACE, 'infrastructure/logs/auto-repair-executions.jsonl');
const ROUTES_FILE = path.join(WORKSPACE, 'infrastructure/dispatcher/routes.json');
const THRESHOLD_STATE_FILE = path.join(WORKSPACE, 'infrastructure/event-bus/sensors/.threshold-state.json');
const EVENTS_FILE = path.join(WORKSPACE, 'infrastructure/event-bus/events.jsonl');
const CONFIG_FILE = path.join(WORKSPACE, 'infrastructure/event-bus/config/threshold-config.json');

function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }
function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return fallback; } }
function writeJson(file, data) { ensureDir(path.dirname(file)); fs.writeFileSync(file, JSON.stringify(data, null, 2)); }
function countJsonl(file) {
  if (!fs.existsSync(file)) return 0;
  const fd = fs.openSync(file, 'r');
  const bufferSize = 1024 * 1024;
  const buffer = Buffer.alloc(bufferSize);
  let count = 0;
  try {
    let bytesRead = 0;
    do {
      bytesRead = fs.readSync(fd, buffer, 0, bufferSize, null);
      for (let i = 0; i < bytesRead; i++) {
        if (buffer[i] === 10) count++;
      }
    } while (bytesRead === bufferSize);
  } finally {
    fs.closeSync(fd);
  }
  return count;
}
function tailJsonl(file, n = 8) {
  const items = [];
  if (!fs.existsSync(file)) return items;
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  return lines.slice(-n).map(line => { try { return JSON.parse(line); } catch (_) { return null; } }).filter(Boolean);
}
function tasks() { const store = readJson(TASKS_FILE, { items: [] }); return store.items || []; }
function reviews() { const store = readJson(REVIEWS_FILE, { items: [] }); return store.items || []; }
function last(arr, n = 8) { return arr.slice(Math.max(0, arr.length - n)); }

function routePatterns(routeRule) {
  return (((routeRule || {}).trigger || {}).events || []).map(String);
}

function wildcardToRegExp(pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

function matches(patterns, type) {
  return patterns.some(p => wildcardToRegExp(p).test(type));
}

(async () => {
  ensureDir(TMP);
  ensureDir(path.join(WORKSPACE, 'infrastructure/event-bus/empty-rules-for-test'));

  const routesData = readJson(ROUTES_FILE, {});
  const routeRule = (routesData.routes || []).find(r => r.id === 'route.global-p1-system-signals-001');
  const patterns = routePatterns(routeRule);

  const inventoryTypes = [
    'event-bus.health.failed',
    'health.check.failed',
    'system.eventbus.backlog_threshold_crossed',
    'pipeline.health.failed',
    'pipeline.stage.failed',
    'pipeline.queue.backlog.warning'
  ];

  const inventory = inventoryTypes.map(type => ({
    type,
    coveredByGlobalP1Route: matches(patterns, type),
    rationale: matches(patterns, type)
      ? 'matched by existing wildcard/explicit route patterns'
      : 'not matched by existing global P1 route patterns'
  }));

  const missingStandardEvents = inventory.filter(x => !x.coveredByGlobalP1Route).map(x => x.type);

  const tasksBefore = new Set(tasks().map(t => t.id));
  const reviewsBefore = new Set(reviews().map(r => r.id));
  const alertsBefore = countJsonl(ALERTS_FILE);
  const reportsBefore = countJsonl(REPORTS_FILE);
  const executionsBefore = countJsonl(EXECUTIONS_FILE);

  const pipelineHealthEvent = {
    id: `evt_pipeline_health_${Date.now()}`,
    type: 'pipeline.health.failed',
    source: 'pipeline-health-autonomy-verifier',
    payload: {
      severity: 'error',
      subsystem: 'pipeline',
      component: 'pipeline-health',
      entityType: 'pipeline_run',
      entityId: `pipeline-run-${Date.now()}`,
      reason: 'sandbox injected pipeline health failure for autonomous queue verification',
      sandbox: true,
      manualTest: true
    }
  };

  const pipelineQueueBacklogEvent = {
    id: `evt_pipeline_queue_${Date.now()}`,
    type: 'pipeline.queue.backlog.warning',
    source: 'pipeline-health-autonomy-verifier',
    payload: {
      severity: 'error',
      subsystem: 'pipeline',
      component: 'pipeline-queue',
      entityType: 'queue',
      entityId: 'pipeline-queue',
      backlogSize: 42,
      threshold: 10,
      reason: 'sandbox injected pipeline queue backlog warning for autonomous queue verification',
      sandbox: true,
      manualTest: true
    }
  };

  const directResults = [];
  for (const evt of [pipelineHealthEvent, pipelineQueueBacklogEvent]) {
    const result = await globalEscalation(evt, routeRule || { id: 'route.global-p1-system-signals-001' }, {});
    directResults.push({ eventType: evt.type, result });
  }

  const thresholdConfigBackup = fs.readFileSync(CONFIG_FILE, 'utf8');
  const thresholdStateBackup = fs.existsSync(THRESHOLD_STATE_FILE) ? fs.readFileSync(THRESHOLD_STATE_FILE, 'utf8') : null;
  const eventsFileBackup = fs.existsSync(EVENTS_FILE) ? fs.readFileSync(EVENTS_FILE, 'utf8') : null;
  let thresholdReplay = null;
  try {
    writeJson(CONFIG_FILE, {
      thresholds: [
        {
          id: 'sandbox-pipeline-backlog-check',
          metric: '未消费事件积压',
          measure: 'unconsumed_backlog',
          threshold: -1,
          operator: 'gt',
          eventType: 'system.eventbus.backlog_threshold_crossed',
          cooldownMs: 0
        }
      ]
    });
    writeJson(THRESHOLD_STATE_FILE, {});
    fs.appendFileSync(EVENTS_FILE, JSON.stringify({
      id: `evt_pipeline_seed_${Date.now()}`,
      type: 'pipeline.seed',
      source: 'pipeline-health-autonomy-verifier',
      payload: { sandbox: true },
      timestamp: Date.now(),
      consumed_by: []
    }) + '\n');
    const scan = thresholdScanner.scan();
    const triggered = (scan.details || []).filter(x => x.status === 'triggered');
    thresholdReplay = { scan, replayed: [] };
    for (const item of triggered) {
      const evt = {
        id: `evt_threshold_pipeline_${Date.now()}`,
        type: 'system.eventbus.backlog_threshold_crossed',
        source: 'threshold-scanner',
        payload: {
          severity: 'warning',
          subsystem: 'event-bus',
          component: 'event-bus',
          entityType: 'queue_metric',
          entityId: `threshold-${item.id}-${Date.now()}`,
          metric: '未消费事件积压',
          value: item.value,
          threshold: -1,
          operator: 'gt',
          reason: 'threshold scanner sandbox trigger replayed into autonomous repair queue verification',
          sandbox: true,
          manualTest: true
        }
      };
      const result = await globalEscalation(evt, routeRule || { id: 'route.global-p1-system-signals-001' }, {});
      thresholdReplay.replayed.push({ eventType: evt.type, thresholdId: item.id, result });
    }
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

  const tasksAfter = tasks();
  const reviewsAfter = reviews();
  const newTasks = tasksAfter.filter(t => !tasksBefore.has(t.id));
  const newReviews = reviewsAfter.filter(r => !reviewsBefore.has(r.id));

  const proofTaskKinds = newTasks.map(t => t.finding?.kind).filter(Boolean);
  const proof = {
    generatedTaskQueue: newTasks.map(t => ({
      id: t.id,
      title: t.title,
      kind: t.finding?.kind,
      severity: t.finding?.severity,
      entityId: t.finding?.entityId,
      source: t.source,
      status: t.status,
      closure: t.closure
    })),
    generatedReviews: newReviews.map(r => ({ id: r.id, taskId: r.taskId, status: r.status, eventType: r.evidence?.eventType })),
    counters: {
      newTaskCount: newTasks.length,
      newReviewCount: newReviews.length,
      newAlertCount: countJsonl(ALERTS_FILE) - alertsBefore,
      newReportCount: countJsonl(REPORTS_FILE) - reportsBefore,
      newExecutionCount: countJsonl(EXECUTIONS_FILE) - executionsBefore
    },
    pass: proofTaskKinds.includes('pipeline.health.failed')
      && proofTaskKinds.includes('pipeline.queue.backlog.warning')
      && proofTaskKinds.includes('system.eventbus.backlog_threshold_crossed')
  };

  const result = {
    routeRulePresent: Boolean(routeRule),
    routePatterns: patterns,
    inventory,
    gapAnalysis: {
      missingStandardEvents,
      recommendation: missingStandardEvents.length
        ? '应将缺失的 pipeline/health 标准事件加入 global-p1-system-signals 路由，确保异常自动进 auto-repair task queue'
        : '当前盘点范围内 pipeline/health 标准异常已被全局 P1 升级路由覆盖'
    },
    directResults,
    thresholdReplay,
    proof,
    latestTasks: last(tasksAfter).map(t => ({ id: t.id, kind: t.finding?.kind, entityId: t.finding?.entityId, source: t.source })),
    latestReviews: last(reviewsAfter).map(r => ({ id: r.id, taskId: r.taskId, eventType: r.evidence?.eventType }))
  };

  const out = path.join(TMP, 'verification-result.json');
  fs.writeFileSync(out, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
})();
