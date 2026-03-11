'use strict';
/**
 * ISC Handler: pdca-act-exit-gate
 * Rule: ISC-PDCA-ACT-EXIT-GATE-001
 * 离开Act阶段前确认改进措施已落到代码或ISC规则
 */
const path = require('path');
const { writeReport, emitEvent, gateResult } = require('../lib/handler-utils');

module.exports = async function (event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || process.cwd();
  const bus = context?.bus;
  const task = event?.payload?.task || event?.payload || {};

  logger.info?.(`[pdca-act-exit-gate] checking improvement actions for task=${task.id || 'unknown'}`);

  const checks = [];
  const actions = task.improvement_actions || task.actions || [];

  // Check 1: improvement actions exist
  const hasActions = Array.isArray(actions) && actions.length > 0;
  checks.push({
    name: 'has_improvement_actions',
    ok: hasActions,
    message: hasActions
      ? `${actions.length} improvement action(s) declared`
      : 'No improvement_actions — Act phase has no concrete actions',
  });

  // Check 2: each action has commit_hash or rule_id (code or rule landing)
  if (hasActions) {
    for (let i = 0; i < actions.length; i++) {
      const a = actions[i];
      const hasCommit = !!(a.commit_hash || a.commitHash || a.commit);
      const hasRule = !!(a.rule_id || a.ruleId);
      const landed = hasCommit || hasRule;
      const label = a.description || a.name || `action_${i}`;
      checks.push({
        name: `action_landed_${i}`,
        ok: landed,
        message: landed
          ? `"${label}" landed via ${hasCommit ? 'commit' : 'rule'}: ${a.commit_hash || a.commitHash || a.commit || a.rule_id || a.ruleId}`
          : `"${label}" has no commit_hash or rule_id — improvement is verbal only`,
      });
    }
  }

  const result = gateResult('ISC-PDCA-ACT-EXIT-GATE-001', checks);

  if (!result.ok) {
    await emitEvent(bus, 'pdca.act.exit.blocked', {
      ruleId: 'ISC-PDCA-ACT-EXIT-GATE-001',
      taskId: task.id,
      unlandedActions: checks.filter(c => !c.ok).map(c => c.message),
      timestamp: new Date().toISOString(),
    });
  }

  const reportPath = path.join(root, 'reports', 'isc', `pdca-act-exit-${task.id || Date.now()}.json`);
  writeReport(reportPath, { rule: 'ISC-PDCA-ACT-EXIT-GATE-001', event: event?.type, result });

  logger.info?.(`[pdca-act-exit-gate] result=${result.status} passed=${result.passed}/${result.total}`);
  return result;
};
