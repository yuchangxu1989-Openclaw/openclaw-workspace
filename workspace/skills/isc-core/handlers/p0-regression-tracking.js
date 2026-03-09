'use strict';

/**
 * ISC Handler: p0-regression-tracking
 * Rule: rule.intent-p0-regression-tracking-qmsnw4
 * Tracks P0-level regression issues (e.g. subagent default-model parse failures).
 */

const fs = require('fs');
const path = require('path');
const {
  writeReport,
  emitEvent,
  checkFileExists,
  gateResult,
} = require('../lib/handler-utils');

const REGRESSION_LOG = 'reports/p0-regressions.jsonl';

module.exports = async function(event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || context?.cwd || process.cwd();
  const bus = context?.bus;
  const checks = [];

  logger.info?.('[p0-regression-tracking] Evaluating P0 regression');

  const payload = event?.payload || {};
  const severity = payload.severity || payload.level || 'unknown';
  const description = payload.description || payload.message || '';
  const component = payload.component || payload.source || 'unknown';

  // Check 1: Severity is P0
  const isP0 = /p0|critical|blocker/i.test(severity);
  checks.push({
    name: 'severity_is_p0',
    ok: isP0,
    message: isP0 ? `Confirmed P0 severity: ${severity}` : `Severity "${severity}" is not P0 — may not require tracking`,
  });

  // Check 2: Description is meaningful
  const hasDesc = description.length >= 10;
  checks.push({
    name: 'description_provided',
    ok: hasDesc,
    message: hasDesc ? 'Regression description provided' : 'Description too short or missing',
  });

  // Check 3: Component identified
  const hasComponent = component !== 'unknown';
  checks.push({
    name: 'component_identified',
    ok: hasComponent,
    message: hasComponent ? `Component: ${component}` : 'Component not specified',
  });

  // Record regression entry
  if (isP0) {
    const logPath = path.join(root, REGRESSION_LOG);
    const entry = {
      timestamp: new Date().toISOString(),
      severity,
      component,
      description,
      ruleId: rule?.id,
      status: 'open',
    };
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, JSON.stringify(entry) + '\n');
    checks.push({
      name: 'regression_logged',
      ok: true,
      message: `P0 regression logged to ${REGRESSION_LOG}`,
    });
  }

  const result = gateResult(rule?.id || 'p0-regression-tracking', checks, { failClosed: false });

  const reportPath = path.join(root, 'reports', 'p0-regression-tracking.json');
  writeReport(reportPath, result);

  await emitEvent(bus, 'handler:complete', {
    handler: 'p0-regression-tracking',
    ruleId: rule?.id,
    result,
  });

  return result;
};
