'use strict';

/**
 * ISC Handler: intent-reflect-consumption
 * Rule: rule.intent-reflect-consumption-001
 * Routes intent.reflect events to CRAS analysis/knowledge consolidation path.
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
  const sessionId = event?.payload?.sessionId || 'unknown';
  logger.info?.(`[intent-reflect-consumption] Processing reflect intent, session=${sessionId}`);

  const checks = [];

  // Check 1: intent type must be reflect
  const isReflect = intentType === 'reflect' || /reflect/i.test(intentType || '');
  checks.push({
    name: 'intent_type_valid',
    ok: isReflect,
    message: isReflect
      ? `Intent type "${intentType}" is reflect`
      : `Intent type "${intentType}" does not match reflect`,
  });

  // Check 2: event bus must be available for routing
  const busAvailable = !!bus?.emit;
  checks.push({
    name: 'event_bus_available',
    ok: busAvailable,
    message: busAvailable
      ? 'Event bus available for CRAS routing'
      : 'Event bus unavailable — cannot route to CRAS',
  });

  // Check 3: payload should contain context for analysis
  const hasContext = !!(event?.payload?.message || event?.payload?.context || event?.payload?.content);
  checks.push({
    name: 'payload_has_context',
    ok: hasContext,
    message: hasContext
      ? 'Reflect payload contains analysis context'
      : 'No message/context in payload — CRAS analysis may be incomplete',
  });

  const result = gateResult(rule?.id || 'intent-reflect-consumption-001', checks, { failClosed: false });

  // Route to CRAS if checks pass
  if (result.ok && busAvailable) {
    await emitEvent(bus, 'cras.analysis.requested', {
      source: 'intent-reflect-consumption',
      sessionId,
      payload: event?.payload,
    });
    actions.push('routed_to_cras_analysis');
  }

  const reportPath = path.join(root, 'reports', 'intent-reflect', `report-${Date.now()}.json`);
  writeReport(reportPath, {
    timestamp: new Date().toISOString(),
    handler: 'intent-reflect-consumption',
    intentType,
    sessionId,
    lastCommit: gitExec(root, 'log --oneline -1'),
    ...result,
  });
  actions.push(`report_written:${reportPath}`);

  await emitEvent(bus, 'intent-reflect-consumption.completed', {
    ok: result.ok,
    status: result.status,
    actions,
  });

  return { ok: result.ok, autonomous: true, actions, ...result };
};
