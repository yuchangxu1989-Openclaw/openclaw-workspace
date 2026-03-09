'use strict';

/**
 * ISC Handler: intent-reflect-dispatch
 * Rule: intent-reflect-dispatch-001
 * Dispatches reflect-classified intents to CRAS analysis/knowledge convergence.
 */

const path = require('path');
const {
  writeReport,
  emitEvent,
  gitExec,
  gateResult,
} = require('../lib/handler-utils');

module.exports = async function(event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || context?.cwd || process.cwd();
  const bus = context?.bus;
  const actions = [];

  const intentType = event?.payload?.intent || event?.payload?.type;
  const source = event?.payload?.source || 'unknown';
  logger.info?.(`[intent-reflect-dispatch] Dispatching reflect intent from ${source}`);

  const checks = [];

  // Check 1: event type matches intent.reflect
  const eventMatch = event?.type === 'intent.reflect' || /reflect/i.test(intentType || '');
  checks.push({
    name: 'event_type_match',
    ok: eventMatch,
    message: eventMatch
      ? 'Event type matches intent.reflect'
      : `Event type "${event?.type}" does not match intent.reflect`,
  });

  // Check 2: dispatch target is resolvable
  const hasTarget = !!(bus?.emit);
  checks.push({
    name: 'dispatch_target_resolvable',
    ok: hasTarget,
    message: hasTarget
      ? 'CRAS dispatch target available via event bus'
      : 'No event bus — cannot dispatch to CRAS handler',
  });

  const result = gateResult(rule?.id || 'intent-reflect-dispatch-001', checks, { failClosed: false });

  if (result.ok) {
    await emitEvent(bus, 'intent.reflect.routed', {
      source: 'intent-reflect-dispatch',
      originalEvent: event?.type,
      payload: event?.payload,
    });
    actions.push('dispatched_to_cras');
  }

  const reportPath = path.join(root, 'reports', 'intent-reflect-dispatch', `report-${Date.now()}.json`);
  writeReport(reportPath, {
    timestamp: new Date().toISOString(),
    handler: 'intent-reflect-dispatch',
    source,
    lastCommit: gitExec(root, 'log --oneline -1'),
    ...result,
  });
  actions.push(`report_written:${reportPath}`);

  await emitEvent(bus, 'intent-reflect-dispatch.completed', {
    ok: result.ok,
    status: result.status,
    actions,
  });

  return { ok: result.ok, autonomous: true, actions, ...result };
};
