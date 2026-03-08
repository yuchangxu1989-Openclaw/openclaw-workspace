#!/usr/bin/env node
/**
 * Publish silence watchdog
 *
 * 目标：治理“发布静默”——检测超过阈值未发布窗口，自动告警，并自动补发/重试。
 * 支持：
 *   1) cron 主动巡检
 *   2) 事件触发 on-demand 检查
 *   3) 自动补发缺失发布请求
 *   4) 失败时写通知落盘 + EventBus 告警事件
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { WORKSPACE, ensureDir, writeJson, readJson } = require('../shared/paths');

let bus = null;
try { bus = require('../../infrastructure/event-bus/bus-adapter'); } catch (_) {}

const WATCHDOG_DIR = path.join(WORKSPACE, 'infrastructure', 'publish-watchdog');
const STATE_FILE = path.join(WATCHDOG_DIR, 'state.json');
const REPORT_FILE = path.join(WATCHDOG_DIR, 'last-run.json');
const PUBLISHER_CLI = path.join(__dirname, 'index.js');

const DEFAULTS = {
  thresholdMinutes: parseInt(process.env.EP_SILENCE_THRESHOLD_MINUTES || '180', 10),
  lookbackHours: parseInt(process.env.EP_SILENCE_LOOKBACK_HOURS || '72', 10),
  autoReplayLimit: parseInt(process.env.EP_SILENCE_AUTO_REPLAY_LIMIT || '20', 10),
  alertCooldownMinutes: parseInt(process.env.EP_SILENCE_ALERT_COOLDOWN_MINUTES || '30', 10),
  eventTypes: [
    'evomap.publish.requested',
    'skill.version.changed',
    'skill.version.detected',
    'isc.version.changed',
    'dto.publish.requested'
  ]
};

function nowIso() {
  return new Date().toISOString();
}

function parseJsonl(file) {
  if (!fs.existsSync(file)) return [];
  const content = fs.readFileSync(file, 'utf8');
  return content.split('\n').filter(Boolean).map(line => {
    try { return JSON.parse(line); } catch (_) { return null; }
  }).filter(Boolean);
}

function readEvents(lookbackHours) {
  const eventsFile = path.join(WORKSPACE, 'infrastructure', 'event-bus', 'events.jsonl');
  const since = Date.now() - lookbackHours * 3600 * 1000;
  return parseJsonl(eventsFile).filter(evt => Number(evt.timestamp || 0) >= since);
}

function getState() {
  return readJson(STATE_FILE, {
    alerts: {},
    replays: {},
    lastRunAt: null
  });
}

function saveState(state) {
  ensureDir(path.dirname(STATE_FILE));
  writeJson(STATE_FILE, state);
}

function inferSkillId(evt) {
  return evt?.payload?.skillId
    || evt?.payload?.skill_id
    || evt?.payload?.name
    || evt?.payload?.skill
    || evt?.skillId
    || null;
}

function inferVersion(evt) {
  return evt?.payload?.version
    || evt?.payload?.detectedVersion
    || evt?.payload?.toVersion
    || evt?.payload?.newVersion
    || evt?.version
    || 'latest';
}

function collectPendingCandidates(events, config) {
  const requestedMap = new Map();
  const publishedMap = new Map();

  for (const evt of events) {
    const type = evt.type || '';
    const skillId = inferSkillId(evt);
    if (!skillId) continue;

    if (config.eventTypes.includes(type)) {
      const current = requestedMap.get(skillId);
      if (!current || evt.timestamp > current.timestamp) {
        requestedMap.set(skillId, {
          skillId,
          version: inferVersion(evt),
          requestType: type,
          requestEventId: evt.id,
          timestamp: evt.timestamp,
          isoTime: new Date(evt.timestamp).toISOString()
        });
      }
    }

    if (type === 'evomap.publish.succeeded' || type === 'evomap.publish.completed') {
      const current = publishedMap.get(skillId);
      if (!current || evt.timestamp > current.timestamp) {
        publishedMap.set(skillId, {
          skillId,
          version: inferVersion(evt),
          timestamp: evt.timestamp,
          isoTime: new Date(evt.timestamp).toISOString(),
          eventId: evt.id
        });
      }
    }
  }

  const thresholdMs = config.thresholdMinutes * 60 * 1000;
  const now = Date.now();
  const pending = [];

  for (const [skillId, req] of requestedMap.entries()) {
    const pub = publishedMap.get(skillId);
    const silent = !pub || pub.timestamp < req.timestamp;
    const silenceDurationMs = now - req.timestamp;
    if (silent && silenceDurationMs >= thresholdMs) {
      pending.push({
        skillId,
        version: req.version,
        requestType: req.requestType,
        requestEventId: req.requestEventId,
        requestedAt: req.isoTime,
        lastPublishedAt: pub?.isoTime || null,
        lastPublishedVersion: pub?.version || null,
        silenceMinutes: Math.floor(silenceDurationMs / 60000)
      });
    }
  }

  return pending.sort((a, b) => b.silenceMinutes - a.silenceMinutes);
}

function notify(message, detail) {
  ensureDir(WATCHDOG_DIR);
  const line = JSON.stringify({ timestamp: nowIso(), message, detail }) + '\n';
  fs.appendFileSync(path.join(WATCHDOG_DIR, 'alerts.jsonl'), line, 'utf8');

  if (bus && typeof bus.emit === 'function') {
    try {
      bus.emit('evomap.publish.silence.alert', { message, detail }, 'publish-silence-watchdog', {
        layer: 'l3',
        severity: 'high'
      });
    } catch (_) {}
  }
}

function replayPublish(skillId, version) {
  execFileSync(process.execPath, [PUBLISHER_CLI, 'publish', skillId, '--version', version, '--priority', 'high'], {
    cwd: __dirname,
    stdio: 'pipe',
    timeout: 60000,
    env: process.env,
  });
}

function run(config = {}) {
  const finalConfig = { ...DEFAULTS, ...config };
  ensureDir(WATCHDOG_DIR);

  const state = getState();
  const events = readEvents(finalConfig.lookbackHours);
  const pending = collectPendingCandidates(events, finalConfig);
  const summary = {
    timestamp: nowIso(),
    config: finalConfig,
    scannedEvents: events.length,
    pendingCount: pending.length,
    alerted: [],
    replayed: [],
    replayFailed: []
  };

  const alertCooldownMs = finalConfig.alertCooldownMinutes * 60 * 1000;
  const now = Date.now();

  for (const item of pending.slice(0, finalConfig.autoReplayLimit)) {
    const alertKey = `${item.skillId}@${item.version}`;
    const lastAlertTs = Number(state.alerts[alertKey] || 0);
    if (!lastAlertTs || now - lastAlertTs >= alertCooldownMs) {
      notify(`检测到发布静默窗口: ${item.skillId}@${item.version}`, item);
      state.alerts[alertKey] = now;
      summary.alerted.push(alertKey);
    }

    try {
      replayPublish(item.skillId, item.version);
      state.replays[alertKey] = {
        lastReplayAt: nowIso(),
        requestedAt: item.requestedAt,
        silenceMinutes: item.silenceMinutes
      };
      summary.replayed.push(alertKey);

      if (bus && typeof bus.emit === 'function') {
        try {
          bus.emit('evomap.publish.retry.requested', {
            skillId: item.skillId,
            version: item.version,
            reason: 'publish_silence_window_detected',
            silenceMinutes: item.silenceMinutes,
            requestEventId: item.requestEventId
          }, 'publish-silence-watchdog', { layer: 'l3' });
        } catch (_) {}
      }
    } catch (error) {
      const err = error && error.message ? error.message : String(error);
      summary.replayFailed.push({ key: alertKey, error: err });
      notify(`发布静默自动补发失败: ${alertKey}`, { ...item, error: err });
    }
  }

  state.lastRunAt = summary.timestamp;
  saveState(state);
  writeJson(REPORT_FILE, summary);
  return summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0] || 'run';
  if (command === 'run') {
    const result = run();
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.replayFailed.length > 0 ? 2 : 0);
  }
  if (command === 'check') {
    const result = run({ autoReplayLimit: 0 });
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }
  console.error('Usage: node index.js [run|check]');
  process.exit(1);
}

module.exports = {
  run,
  collectPendingCandidates,
  readEvents,
  inferSkillId,
  inferVersion,
};
