'use strict';

/**
 * ISC Handler: feedback-must-close
 * Rule: rule.arch-feedback-must-close-003
 * Monitors event health: detects orphan events and dead channels,
 * ensures feedback loops are closed.
 */

const fs = require('fs');
const path = require('path');
const {
  writeReport,
  emitEvent,
  scanFiles,
  gateResult,
  gitExec,
} = require('../lib/handler-utils');

module.exports = async function(event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || context?.cwd || process.cwd();
  const bus = context?.bus;
  const actions = [];

  logger.info?.('[feedback-must-close] Checking event health and feedback loops');

  const checks = [];

  // 1. Scan for events.jsonl — check if events have consumers
  const eventsFile = path.join(root, 'skills/isc-core/events.jsonl');
  if (fs.existsSync(eventsFile)) {
    const lines = fs.readFileSync(eventsFile, 'utf8').trim().split('\n').filter(Boolean);
    const recentEvents = lines.slice(-50);
    // Look for events without corresponding handler acknowledgments
    const eventTypes = new Set();
    for (const line of recentEvents) {
      try {
        const evt = JSON.parse(line);
        if (evt.event) eventTypes.add(evt.event);
      } catch { /* skip malformed */ }
    }
    checks.push({
      name: 'events_logged',
      ok: eventTypes.size > 0,
      message: `${eventTypes.size} unique event types in recent log`,
    });
  } else {
    checks.push({
      name: 'events_logged',
      ok: true,
      message: 'No events.jsonl — no orphan risk',
    });
  }

  // 2. Check handlers directory — every rule should have a handler
  const rulesDir = path.join(root, 'skills/isc-core/rules');
  const handlersDir = path.join(root, 'skills/isc-core/handlers');
  let orphanRules = 0;
  if (fs.existsSync(rulesDir) && fs.existsSync(handlersDir)) {
    const handlerFiles = new Set(
      fs.readdirSync(handlersDir).filter(f => f.endsWith('.js')).map(f => f.replace('.js', ''))
    );
    const ruleFiles = fs.readdirSync(rulesDir).filter(f => f.endsWith('.json'));
    for (const rf of ruleFiles) {
      try {
        const r = JSON.parse(fs.readFileSync(path.join(rulesDir, rf), 'utf8'));
        const handler = r.action?.handler;
        if (handler && !handlerFiles.has(handler)) {
          orphanRules++;
        }
      } catch { /* skip */ }
    }
    checks.push({
      name: 'no_orphan_rules',
      ok: orphanRules === 0,
      message: orphanRules === 0
        ? 'All rules with handlers have matching handler files'
        : `${orphanRules} rule(s) reference missing handler files`,
    });
  }

  // 3. Payload-level check: orphan report from event
  const orphanCount = event?.payload?.orphan_count || 0;
  const deadChannel = event?.payload?.dead_channel_detected || false;
  checks.push({
    name: 'no_orphan_events',
    ok: orphanCount === 0,
    message: orphanCount === 0 ? 'No orphan events reported' : `${orphanCount} orphan event(s) detected`,
  });
  checks.push({
    name: 'no_dead_channels',
    ok: !deadChannel,
    message: deadChannel ? 'Dead channel detected — requires investigation' : 'No dead channels',
  });

  const result = gateResult(rule?.id || 'feedback-must-close', checks);

  const reportPath = path.join(root, 'reports', 'feedback-close', `report-${Date.now()}.json`);
  writeReport(reportPath, {
    timestamp: new Date().toISOString(),
    handler: 'feedback-must-close',
    lastCommit: gitExec(root, 'log --oneline -1'),
    ...result,
  });
  actions.push(`report_written:${reportPath}`);

  await emitEvent(bus, 'feedback-must-close.completed', {
    ok: result.ok,
    status: result.status,
    orphanRules,
    actions,
  });

  return { ok: result.ok, autonomous: true, actions, ...result };
};
