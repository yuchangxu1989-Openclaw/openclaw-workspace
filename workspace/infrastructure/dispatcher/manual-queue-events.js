'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = '/root/.openclaw/workspace';
const EVENTS_FILE = path.join(ROOT, 'infrastructure/event-bus/events.jsonl');
const ALERTS_FILE = path.join(ROOT, 'infrastructure/logs/alerts.jsonl');
const MANUAL_QUEUE_FILE = path.join(ROOT, 'infrastructure/dispatcher/manual-queue.jsonl');

const DEFAULT_BACKLOG_THRESHOLD = parseInt(process.env.MANUAL_QUEUE_BACKLOG_THRESHOLD || '20', 10);
const DEFAULT_STALE_HOURS = parseInt(process.env.MANUAL_QUEUE_STALE_HOURS || '24', 10);

function ensureDir(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

function appendJsonl(file, record) {
  ensureDir(file);
  fs.appendFileSync(file, JSON.stringify(record) + '\n');
}

function safeJsonParse(line) {
  try { return JSON.parse(line); } catch (_) { return null; }
}

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(safeJsonParse).filter(Boolean);
}

function normalizeTs(value) {
  if (!value) return null;
  const n = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(n) ? n : null;
}

function makeEvent(type, payload = {}, options = {}) {
  const now = Date.now();
  return {
    id: options.id || `evt_manual_queue_${now}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    source: options.source || 'dispatcher.manual-queue',
    payload: {
      ...payload,
      _metadata: {
        trace_id: options.traceId || `trace_manual_queue_${now}`,
        chain_depth: options.chainDepth || 0,
        emitted_at: now,
        event_type: type,
      },
    },
    timestamp: now,
    consumed_by: [],
  };
}

function emitEvent(type, payload = {}, options = {}) {
  const evt = makeEvent(type, payload, options);
  appendJsonl(EVENTS_FILE, evt);
  return evt;
}

function appendAlert(eventType, severity, message, payload) {
  appendJsonl(ALERTS_FILE, {
    timestamp: new Date().toISOString(),
    handler: 'manual-queue-events',
    severity,
    eventType,
    eventId: payload.eventId || payload.queueItemId || payload.queueId || null,
    ruleId: payload.ruleId || 'manual-queue-events',
    message,
    payload,
    acknowledged: false,
    cleared: false,
  });
}

function analyzeQueue(lines = readJsonl(MANUAL_QUEUE_FILE), now = Date.now(), opts = {}) {
  const backlogThreshold = Number.isFinite(opts.backlogThreshold) ? opts.backlogThreshold : DEFAULT_BACKLOG_THRESHOLD;
  const staleHours = Number.isFinite(opts.staleHours) ? opts.staleHours : DEFAULT_STALE_HOURS;
  const staleMs = staleHours * 60 * 60 * 1000;
  const staleItems = lines.filter(item => {
    const ts = normalizeTs(item.ts || item.timestamp || item.createdAt);
    return ts && now - ts >= staleMs;
  });

  return {
    total: lines.length,
    backlogThreshold,
    backlogExceeded: lines.length >= backlogThreshold,
    staleHours,
    staleCount: staleItems.length,
    staleItems,
  };
}

async function escalateViaUnifiedLoop(event, payload = {}) {
  const handler = require('../event-bus/handlers/global-event-escalation');
  const rule = { id: 'manual-queue-unified-autonomy', action: event.type };
  return handler(event, rule, { source: 'manual-queue-events', payload });
}

async function emitManualQueueSignals(record, options = {}) {
  const queueItemId = record.eventId || record.ruleId || `manual_queue_${Date.now()}`;
  const queueSnapshot = analyzeQueue(options.queueLines, options.now, options);
  const createdPayload = {
    queueId: 'manual-queue',
    queueItemId,
    ruleId: record.ruleId,
    action: record.action,
    eventType: record.eventType,
    eventId: record.eventId,
    error: record.error,
    queueSize: queueSnapshot.total,
    backlogThreshold: queueSnapshot.backlogThreshold,
    subsystem: 'manual-queue',
    component: 'manual-queue',
    entityType: 'queue_item',
    entityId: queueItemId,
    severity: 'warning',
    sandbox: options.sandbox !== false,
    rootCause: record.error || 'manual queue item created',
    sourceRecordTs: record.ts,
  };

  const emitted = {
    created: emitEvent('manual.queue.item.created', createdPayload),
    backlog: null,
    stale: [],
    escalations: [],
  };

  if (options.escalateCreated) {
    emitted.escalations.push(await escalateViaUnifiedLoop(emitted.created, createdPayload));
  }

  if (queueSnapshot.backlogExceeded) {
    const backlogPayload = {
      queueId: 'manual-queue',
      subsystem: 'manual-queue',
      component: 'manual-queue',
      entityType: 'queue',
      entityId: 'manual-queue',
      severity: 'error',
      sandbox: options.sandbox !== false,
      backlogSize: queueSnapshot.total,
      backlogThreshold: queueSnapshot.backlogThreshold,
      staleCount: queueSnapshot.staleCount,
      rootCause: 'manual-queue anomaly for closed-loop validation',
      latestQueueItemId: queueItemId,
    };
    emitted.backlog = emitEvent('manual-queue.backlog.warning', backlogPayload);
    appendAlert('manual-queue.backlog.warning', 'error', 'manual queue backlog threshold exceeded', backlogPayload);
    emitted.escalations.push(await escalateViaUnifiedLoop(emitted.backlog, backlogPayload));
  }

  for (const staleItem of queueSnapshot.staleItems) {
    const staleQueueItemId = staleItem.eventId || staleItem.ruleId || `manual_queue_stale_${Date.now()}`;
    const stalePayload = {
      queueId: 'manual-queue',
      subsystem: 'manual-queue',
      component: 'manual-queue',
      entityType: 'queue_item',
      entityId: staleQueueItemId,
      queueItemId: staleQueueItemId,
      severity: 'warning',
      sandbox: options.sandbox !== false,
      staleHours: queueSnapshot.staleHours,
      sourceRecordTs: staleItem.ts,
      action: staleItem.action,
      eventType: staleItem.eventType,
      error: staleItem.error,
      rootCause: staleItem.error || 'manual queue item stale',
    };
    const staleEvent = emitEvent('manual-queue.item.stale', stalePayload);
    emitted.stale.push(staleEvent);
    emitted.escalations.push(await escalateViaUnifiedLoop(staleEvent, stalePayload));
  }

  return emitted;
}

module.exports = {
  emitEvent,
  analyzeQueue,
  emitManualQueueSignals,
};
