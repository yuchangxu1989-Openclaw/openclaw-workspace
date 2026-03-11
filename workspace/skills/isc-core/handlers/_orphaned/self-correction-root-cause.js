'use strict';

/**
 * ISC Handler: self-correction-root-cause
 * Rule: rule.pipeline-benchmark-defect-acknowledged-001
 * Triggers on agent.behavior.defect_acknowledged — drives self-correction ruleification.
 */

const path = require('path');
const {
  gitExec,
  writeReport,
  emitEvent,
  scanFiles,
  checkFileExists,
  readRuleJson,
  gateResult,
} = require('../lib/handler-utils');

module.exports = async function(event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || context?.cwd || process.cwd();
  const bus = context?.bus;
  const actions = [];

  logger.info?.(`[self-correction-root-cause] Defect acknowledged: ${event?.payload?.defect_id || 'unknown'}`);

  const checks = [];

  // Check 1: defect payload has root cause
  const rootCause = event?.payload?.root_cause || event?.payload?.rootCause;
  checks.push({
    name: 'root_cause_provided',
    ok: !!rootCause,
    message: rootCause ? `Root cause: ${rootCause}` : 'No root cause in defect payload',
  });

  // Check 2: corrective action specified
  const correctiveAction = event?.payload?.corrective_action || event?.payload?.fix;
  checks.push({
    name: 'corrective_action_specified',
    ok: !!correctiveAction,
    message: correctiveAction ? 'Corrective action defined' : 'No corrective action specified',
  });

  // Check 3: check if a rule already exists for this defect pattern
  const rulesDir = path.join(root, 'skills', 'isc-core', 'rules');
  const defectId = event?.payload?.defect_id || '';
  const existingRules = scanFiles(rulesDir, /\.json$/i, null, { maxDepth: 1 });
  const duplicateRule = existingRules.some(f => {
    const r = readRuleJson(f);
    return r?.tags?.includes(defectId) || r?.description?.includes(defectId);
  });
  checks.push({
    name: 'no_duplicate_rule',
    ok: !duplicateRule,
    message: duplicateRule ? `Existing rule already covers defect ${defectId}` : 'No duplicate rule found',
  });

  // Check 4: git blame available for traceability
  const lastCommit = gitExec(root, 'log --oneline -1');
  checks.push({
    name: 'git_traceability',
    ok: !!lastCommit,
    message: lastCommit ? `Last commit: ${lastCommit}` : 'No git history available',
  });

  const result = gateResult(rule?.id || 'self-correction-root-cause', checks);

  const reportPath = path.join(root, 'reports', 'self-correction', `report-${Date.now()}.json`);
  writeReport(reportPath, {
    timestamp: new Date().toISOString(),
    handler: 'self-correction-root-cause',
    eventType: event?.type || null,
    ruleId: rule?.id || null,
    defectId,
    rootCause: rootCause || null,
    ...result,
  });
  actions.push(`report_written:${reportPath}`);

  await emitEvent(bus, 'self-correction-root-cause.completed', {
    ok: result.ok,
    status: result.status,
    defectId,
    actions,
  });

  return {
    ok: result.ok,
    autonomous: true,
    actions,
    message: result.ok
      ? `Defect ${defectId} root-cause analysis passed all ${result.total} checks`
      : `${result.failed}/${result.total} self-correction checks failed`,
    ...result,
  };
};
