'use strict';

/**
 * ISC Handler: intent-directive-dispatch
 * Rule: intent-directive-dispatch-001
 * Intent Directive → 本地任务编排 Task Dispatch
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

  const intentType = event?.type || event?.payload?.intentType || 'intent.directive';
  const payload = event?.payload || {};

  logger.info?.(`[intent-directive-dispatch] Processing ${intentType}`);

  const checks = [];

  // Check 1: dispatch script exists
  const scriptPath = path.join(root, 'scripts/isc-hooks/intent-directive-dispatch-001.sh');
  const scriptExists = checkFileExists(scriptPath);
  checks.push({
    name: 'dispatch_script_exists',
    ok: scriptExists,
    message: scriptExists ? 'Dispatch script found' : 'Dispatch script missing',
  });

  // Check 2: event has required payload
  const hasPayload = !!(payload.message || payload.directive || payload.task);
  checks.push({
    name: 'has_directive_payload',
    ok: hasPayload,
    message: hasPayload ? 'Directive payload present' : 'No directive payload found',
  });

  const result = gateResult('intent-directive-dispatch-001', checks);

  if (result.ok) {
    await emitEvent(bus, 'isc.task.dispatch', {
      ruleId: 'intent-directive-dispatch-001',
      intentType,
      payload,
      timestamp: new Date().toISOString(),
    });
  }

  const reportPath = path.join(root, 'reports', 'isc', `intent-directive-${Date.now()}.json`);
  writeReport(reportPath, { rule: 'intent-directive-dispatch-001', result });

  logger.info?.(`[intent-directive-dispatch] result=${result.status}`);
  return result;
};
