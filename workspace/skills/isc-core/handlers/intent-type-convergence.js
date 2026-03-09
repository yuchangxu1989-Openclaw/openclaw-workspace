'use strict';

/**
 * ISC Handler: intent-type-convergence
 * Rule: rule.intent-type-convergence-001
 * Validates new intent types against the 5 converged categories.
 * Rejects registration if type doesn't fit any category.
 */

const path = require('path');
const {
  writeReport,
  emitEvent,
  gitExec,
  gateResult,
} = require('../lib/handler-utils');

const CONVERGED_TYPES = [
  { id: 'emotion', label: '正负向情绪意图', pattern: /emotion|情绪|sentiment|positive|negative|正向|负向/i },
  { id: 'rule_trigger', label: '规则触发意图', pattern: /rule|trigger|规则|触发|ruleify|enforcement/i },
  { id: 'complex', label: '复杂意图（5轮+上下文）', pattern: /complex|复杂|multi.?turn|多轮|上下文推理/i },
  { id: 'implicit', label: '隐含意图（需推理）', pattern: /implicit|隐含|infer|推理|暗示|间接/i },
  { id: 'multi_intent', label: '一句话多意图', pattern: /multi.?intent|多意图|compound|复合|组合/i },
];

module.exports = async function(event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || context?.cwd || process.cwd();
  const bus = context?.bus;
  const actions = [];

  const newType = event?.payload?.intentType || event?.payload?.type_name || '';
  const description = event?.payload?.description || '';
  logger.info?.(`[intent-type-convergence] Validating new intent type: "${newType}"`);

  const checks = [];

  // Check 1: type name provided
  const hasName = newType.length > 0;
  checks.push({
    name: 'type_name_provided',
    ok: hasName,
    message: hasName ? `Intent type name: "${newType}"` : 'No intent type name provided',
  });

  // Check 2: type must map to one of the 5 converged categories
  const combined = `${newType} ${description}`;
  const matchedCategories = CONVERGED_TYPES.filter(t => t.pattern.test(combined));
  const fitsCategory = matchedCategories.length > 0;
  checks.push({
    name: 'fits_converged_category',
    ok: fitsCategory,
    message: fitsCategory
      ? `Maps to: ${matchedCategories.map(c => c.label).join(', ')}`
      : `"${newType}" does not fit any of the 5 converged categories — registration rejected. Must MECE-reclassify.`,
  });

  // Check 3: should map to exactly one category (MECE)
  const meceCompliant = matchedCategories.length === 1;
  checks.push({
    name: 'mece_single_category',
    ok: meceCompliant,
    message: meceCompliant
      ? `MECE: maps to exactly 1 category`
      : matchedCategories.length === 0
        ? 'No category match'
        : `Ambiguous: maps to ${matchedCategories.length} categories — clarify classification`,
  });

  const result = gateResult(rule?.id || 'intent-type-convergence-001', checks);

  if (!result.ok) {
    actions.push('registration_rejected');
    await emitEvent(bus, 'intent.type.registration.rejected', {
      source: 'intent-type-convergence',
      intentType: newType,
      reason: result.checks.filter(c => !c.ok).map(c => c.message).join('; '),
    });
  } else {
    actions.push('registration_approved');
    await emitEvent(bus, 'intent.type.registration.approved', {
      source: 'intent-type-convergence',
      intentType: newType,
      category: matchedCategories[0]?.id,
    });
  }

  const reportPath = path.join(root, 'reports', 'intent-type-convergence', `report-${Date.now()}.json`);
  writeReport(reportPath, {
    timestamp: new Date().toISOString(),
    handler: 'intent-type-convergence',
    intentType: newType,
    matchedCategories: matchedCategories.map(c => c.id),
    lastCommit: gitExec(root, 'log --oneline -1'),
    ...result,
  });
  actions.push(`report_written:${reportPath}`);

  await emitEvent(bus, 'intent-type-convergence.completed', {
    ok: result.ok,
    status: result.status,
    actions,
  });

  return { ok: result.ok, autonomous: true, actions, ...result };
};
