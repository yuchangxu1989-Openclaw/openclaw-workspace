'use strict';
/**
 * ISC Handler: pdca-do-entry-gate
 * Rule: ISC-PDCA-DO-ENTRY-GATE-001
 * 进入Do阶段前确认Plan准出已通过
 */
const path = require('path');
const { writeReport, emitEvent, gateResult } = require('../lib/handler-utils');

module.exports = async function (event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || process.cwd();
  const bus = context?.bus;
  const task = event?.payload?.task || event?.payload || {};

  logger.info?.(`[pdca-do-entry-gate] checking plan exit status for task=${task.id || 'unknown'}`);

  const checks = [];

  // Check 1: plan_exit_passed must be explicitly true
  const planPassed = task.plan_exit_passed === true;
  checks.push({
    name: 'plan_exit_passed',
    ok: planPassed,
    message: planPassed
      ? 'Plan exit gate was passed'
      : `Plan exit gate not passed (value=${JSON.stringify(task.plan_exit_passed)})`,
  });

  // Check 2: plan phase timestamp exists (proves plan phase actually ran)
  const hasPlanTimestamp = !!(task.plan_completed_at || task.plan_exit_at);
  checks.push({
    name: 'plan_phase_completed',
    ok: hasPlanTimestamp,
    message: hasPlanTimestamp
      ? `Plan completed at ${task.plan_completed_at || task.plan_exit_at}`
      : 'No plan completion timestamp — plan phase may have been skipped',
  });

  const result = gateResult('ISC-PDCA-DO-ENTRY-GATE-001', checks);

  if (!result.ok) {
    await emitEvent(bus, 'pdca.do.entry.blocked', {
      ruleId: 'ISC-PDCA-DO-ENTRY-GATE-001',
      taskId: task.id,
      reason: 'Plan exit gate not passed',
      timestamp: new Date().toISOString(),
    });
  }

  const reportPath = path.join(root, 'reports', 'isc', `pdca-do-entry-${task.id || Date.now()}.json`);
  writeReport(reportPath, { rule: 'ISC-PDCA-DO-ENTRY-GATE-001', event: event?.type, result });

  logger.info?.(`[pdca-do-entry-gate] result=${result.status} passed=${result.passed}/${result.total}`);
  return result;
};
