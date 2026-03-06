'use strict';

const fs = require('fs');
const path = require('path');

function appendJsonl(filePath, record) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`, 'utf8');
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

module.exports = async function crasDualChannel(event, rule, context = {}) {
  const workspace = context.workspace || '/root/.openclaw/workspace';
  const payload = event.payload || {};
  const stateFile = path.join(workspace, 'memory', 'cras-dual-channel-state.json');
  const reportFile = path.join(workspace, 'infrastructure', 'logs', 'cras-dual-channel.jsonl');

  const state = readJson(stateFile) || { fast_channel: {}, slow_channel: {}, last_event: null, updated_at: null };
  const now = new Date().toISOString();
  let channel = 'unknown';

  if (event.type === 'cras.scan.completed') {
    channel = 'fast';
    state.fast_channel = {
      interval: '5min',
      mode: 'realtime',
      output: 'atomic_intent_events',
      last_event_id: event.id,
      last_payload_summary: {
        intents: Array.isArray(payload.intents) ? payload.intents.length : undefined,
        source: payload.source || null,
      },
      updated_at: now,
    };
  } else if (event.type === 'cras.report.generated') {
    channel = 'slow';
    state.slow_channel = {
      interval: 'daily',
      mode: 'aggregation',
      output: 'pattern_events',
      last_event_id: event.id,
      last_payload_summary: {
        report_id: payload.report_id || null,
        patterns: Array.isArray(payload.patterns) ? payload.patterns.length : undefined,
      },
      updated_at: now,
    };
  }

  state.last_event = { id: event.id, type: event.type };
  state.updated_at = now;
  writeJson(stateFile, state);

  const verified = readJson(stateFile) || {};
  const verificationPassed = (channel === 'fast' && verified.fast_channel?.last_event_id === event.id)
    || (channel === 'slow' && verified.slow_channel?.last_event_id === event.id)
    || channel === 'unknown';

  appendJsonl(reportFile, {
    timestamp: now,
    handler: 'cras-dual-channel',
    ruleId: rule.id,
    eventType: event.type,
    eventId: event.id,
    channel,
    stateFile,
    verificationPassed,
  });

  if (verificationPassed && context.bus?.emit && channel !== 'unknown') {
    await context.bus.emit('cras.channel.verified', {
      source_event: event.id,
      source_type: event.type,
      channel,
      state_file: stateFile,
      rule_id: rule.id,
    }, 'cras-dual-channel');
  }

  return { ok: verificationPassed, autonomous: true, channel, stateFile };
};
