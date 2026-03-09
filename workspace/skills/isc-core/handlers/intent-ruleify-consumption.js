'use strict';

/**
 * ISC Handler: intent-ruleify-consumption
 * Rule: rule.intent-ruleify-consumption-001
 * Routes intent.ruleify events to create ISC rule drafts.
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
  const message = event?.payload?.message || event?.payload?.content || '';
  logger.info?.(`[intent-ruleify-consumption] Processing ruleify intent, session=${sessionId}`);

  const checks = [];

  // Check 1: intent type must be ruleify
  const isRuleify = intentType === 'ruleify' || /ruleify/i.test(intentType || '');
  checks.push({
    name: 'intent_type_valid',
    ok: isRuleify,
    message: isRuleify
      ? `Intent type "${intentType}" is ruleify`
      : `Intent type "${intentType}" does not match ruleify`,
  });

  // Check 2: message content sufficient for rule draft
  const hasContent = message.length > 10;
  checks.push({
    name: 'content_sufficient',
    ok: hasContent,
    message: hasContent
      ? `Message has ${message.length} chars — sufficient for rule draft`
      : 'Message too short to derive a meaningful rule draft',
  });

  // Check 3: event bus available for rule creation pipeline
  const busAvailable = !!bus?.emit;
  checks.push({
    name: 'event_bus_available',
    ok: busAvailable,
    message: busAvailable
      ? 'Event bus available for rule creation pipeline'
      : 'Event bus unavailable — cannot trigger rule draft creation',
  });

  const result = gateResult(rule?.id || 'intent-ruleify-consumption-001', checks);

  if (result.ok && busAvailable) {
    await emitEvent(bus, 'isc.rule.draft.requested', {
      source: 'intent-ruleify-consumption',
      sessionId,
      message,
      payload: event?.payload,
    });
    actions.push('routed_to_rule_draft_creation');
  }

  const reportPath = path.join(root, 'reports', 'intent-ruleify', `report-${Date.now()}.json`);
  writeReport(reportPath, {
    timestamp: new Date().toISOString(),
    handler: 'intent-ruleify-consumption',
    intentType,
    sessionId,
    contentLength: message.length,
    lastCommit: gitExec(root, 'log --oneline -1'),
    ...result,
  });
  actions.push(`report_written:${reportPath}`);

  await emitEvent(bus, 'intent-ruleify-consumption.completed', {
    ok: result.ok,
    status: result.status,
    actions,
  });

  return { ok: result.ok, autonomous: true, actions, ...result };
};
