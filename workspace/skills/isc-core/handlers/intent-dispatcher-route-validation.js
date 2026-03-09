'use strict';

/**
 * ISC Handler: intent-dispatcher-route-validation
 * Rule: rule.intent-day2-gap2-dispatcher-intent-route-validation-t84891
 * Validates dispatcher can consume intent.ruleify through intent-event-handler.
 */

const path = require('path');
const fs = require('fs');
const {
  writeReport,
  emitEvent,
  gitExec,
  scanFiles,
  checkFileExists,
  gateResult,
} = require('../lib/handler-utils');

module.exports = async function (event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || context?.cwd || process.cwd();
  const bus = context?.bus;
  const actions = [];
  const checks = [];

  logger.info?.('[intent-dispatcher-route-validation] Validating dispatcher intent.ruleify route');

  const handlersDir = path.join(root, 'skills', 'isc-core', 'handlers');

  // Check 1: intent-event-handler exists
  const intentEventHandler = path.join(handlersDir, 'intent-event-handler.js');
  const hasIntentHandler = checkFileExists(intentEventHandler);
  checks.push({
    name: 'intent_event_handler_exists',
    ok: hasIntentHandler,
    message: hasIntentHandler
      ? 'intent-event-handler.js found'
      : 'intent-event-handler.js missing — dispatcher cannot route intent.ruleify',
  });

  // Check 2: Handler references intent.ruleify event
  if (hasIntentHandler) {
    try {
      const content = fs.readFileSync(intentEventHandler, 'utf8');
      const handlesRuleify = /intent\.ruleify|ruleify/i.test(content);
      checks.push({
        name: 'handles_ruleify_event',
        ok: handlesRuleify,
        message: handlesRuleify
          ? 'Handler references intent.ruleify event'
          : 'Handler does not reference intent.ruleify — route may be broken',
      });
    } catch {
      checks.push({ name: 'handles_ruleify_event', ok: false, message: 'Could not read intent-event-handler.js' });
    }
  } else {
    checks.push({ name: 'handles_ruleify_event', ok: false, message: 'Skipped — handler file missing' });
  }

  // Check 3: Dispatcher/routing config references intent.ruleify
  let routeConfigFound = false;
  const configDirs = [
    path.join(root, 'skills', 'isc-core', 'lib'),
    path.join(root, 'skills', 'isc-core'),
  ];
  for (const dir of configDirs) {
    if (!checkFileExists(dir)) continue;
    scanFiles(dir, /\.(js|json)$/i, (fp) => {
      if (routeConfigFound) return;
      try {
        const content = fs.readFileSync(fp, 'utf8');
        if (/intent\.ruleify/.test(content) && /dispatch|route|handler/i.test(content)) {
          routeConfigFound = true;
        }
      } catch { /* skip */ }
    }, { maxDepth: 1 });
  }
  checks.push({
    name: 'route_config_exists',
    ok: routeConfigFound,
    message: routeConfigFound
      ? 'Dispatcher routing config references intent.ruleify'
      : 'No dispatcher config found routing intent.ruleify',
  });

  // Check 4: Rules consuming intent.ruleify exist
  const rulesDir = path.join(root, 'skills', 'isc-core', 'rules');
  let ruleifyConsumers = 0;
  scanFiles(rulesDir, /\.json$/i, (fp) => {
    try {
      const content = fs.readFileSync(fp, 'utf8');
      if (/intent\.ruleify/.test(content)) ruleifyConsumers++;
    } catch { /* skip */ }
  }, { maxDepth: 1 });
  checks.push({
    name: 'ruleify_consumers_exist',
    ok: ruleifyConsumers > 0,
    message: ruleifyConsumers > 0
      ? `${ruleifyConsumers} rule(s) consume intent.ruleify`
      : 'No rules found consuming intent.ruleify event',
  });

  const result = gateResult(rule?.id || 'intent-day2-gap2-dispatcher-intent-route-validation-t84891', checks);

  const reportPath = path.join(root, 'reports', 'dispatcher-route-validation', `report-${Date.now()}.json`);
  writeReport(reportPath, {
    timestamp: new Date().toISOString(),
    handler: 'intent-dispatcher-route-validation',
    ruleifyConsumers,
    lastCommit: gitExec(root, 'log --oneline -1'),
    ...result,
  });
  actions.push(`report_written:${reportPath}`);

  await emitEvent(bus, 'intent-dispatcher-route-validation.completed', { ok: result.ok, status: result.status, actions });

  return { ok: result.ok, autonomous: true, actions, ...result };
};
