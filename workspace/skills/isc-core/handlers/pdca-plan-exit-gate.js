'use strict';
/**
 * ISC Handler: pdca-plan-exit-gate
 * Rule: ISC-PDCA-PLAN-EXIT-GATE-001
 * 任务离开Plan阶段前检查4要素完整性（业务目标/时效约束/成本边界/验收标准）
 */
const path = require('path');
const { writeReport, emitEvent, gateResult } = require('../lib/handler-utils');

const REQUIRED_FIELDS = ['goal', 'deadline', 'cost_boundary', 'acceptance_criteria'];

module.exports = async function (event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || process.cwd();
  const bus = context?.bus;
  const task = event?.payload?.task || event?.payload || {};

  logger.info?.(`[pdca-plan-exit-gate] checking plan completeness for task=${task.id || 'unknown'}`);

  const checks = [];

  // Check each of the 4 required plan elements
  for (const field of REQUIRED_FIELDS) {
    const value = task[field];
    const present = value !== undefined && value !== null && value !== '';
    checks.push({
      name: `plan_has_${field}`,
      ok: present,
      message: present
        ? `${field} present: ${String(value).slice(0, 80)}`
        : `Missing required plan element: ${field}`,
    });
  }

  // Check plan is not just a copy-paste template
  const goal = task.goal || '';
  const notTemplate = goal.length > 5 && !/^(TODO|TBD|placeholder|待定|待填)/i.test(goal);
  checks.push({
    name: 'plan_not_template',
    ok: notTemplate,
    message: notTemplate ? 'Goal has substantive content' : 'Goal appears to be a placeholder',
  });

  const result = gateResult('ISC-PDCA-PLAN-EXIT-GATE-001', checks);

  if (!result.ok) {
    const missing = checks.filter(c => !c.ok).map(c => c.name.replace('plan_has_', ''));
    await emitEvent(bus, 'pdca.plan.exit.blocked', {
      ruleId: 'ISC-PDCA-PLAN-EXIT-GATE-001',
      taskId: task.id,
      missingFields: missing,
      timestamp: new Date().toISOString(),
    });
  }

  const reportPath = path.join(root, 'reports', 'isc', `pdca-plan-exit-${task.id || Date.now()}.json`);
  writeReport(reportPath, { rule: 'ISC-PDCA-PLAN-EXIT-GATE-001', event: event?.type, result });

  logger.info?.(`[pdca-plan-exit-gate] result=${result.status} passed=${result.passed}/${result.total}`);
  return result;
};
