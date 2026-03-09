'use strict';

/**
 * ISC Handler: intent-ruleify-dispatch
 * Rule: intent-ruleify-dispatch-001
 * Intent Ruleify → ISC Rule Draft Dispatch
 */

const path = require('path');
const {
  writeReport,
  emitEvent,
  checkFileExists,
  gateResult,
} = require('../lib/handler-utils');

module.exports = async function(event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || context?.cwd || process.cwd();
  const bus = context?.bus;

  const intentType = event?.type || event?.payload?.intentType || 'intent.ruleify';
  const payload = event?.payload || {};

  logger.info?.(`[intent-ruleify-dispatch] Processing ${intentType}`);

  const checks = [];

  // Check 1: dispatch script exists
  const scriptPath = path.join(root, 'scripts/isc-hooks/intent-ruleify-dispatch-001.sh');
  const scriptExists = checkFileExists(scriptPath);
  checks.push({
    name: 'dispatch_script_exists',
    ok: scriptExists,
    message: scriptExists ? 'Ruleify dispatch script found' : 'Ruleify dispatch script missing',
  });

  // Check 2: event has ruleify payload
  const hasPayload = !!(payload.message || payload.ruleDescription || payload.pattern);
  checks.push({
    name: 'has_ruleify_payload',
    ok: hasPayload,
    message: hasPayload ? 'Ruleify payload present' : 'No ruleify payload found',
  });

  const result = gateResult('intent-ruleify-dispatch-001', checks);

  if (result.ok) {
    await emitEvent(bus, 'isc.rule.draft.requested', {
      ruleId: 'intent-ruleify-dispatch-001',
      intentType,
      payload,
      timestamp: new Date().toISOString(),
    });
  }

  const reportPath = path.join(root, 'reports', 'isc', `intent-ruleify-${Date.now()}.json`);
  writeReport(reportPath, { rule: 'intent-ruleify-dispatch-001', result });

  logger.info?.(`[intent-ruleify-dispatch] result=${result.status}`);
  return result;
};
