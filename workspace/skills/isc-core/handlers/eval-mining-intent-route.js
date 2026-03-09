'use strict';

/**
 * ISC Handler: eval-mining-intent-route
 * Rule: rule.eval-mining-intent-route-001
 * Routes eval mining intents to the eval-mining skill.
 */

const path = require('path');
const {
  writeReport,
  emitEvent,
  checkFileExists,
  gateResult,
} = require('../lib/handler-utils');

const MINING_KEYWORDS = ['挖掘评测', '补充评测集', '生成评测', 'C2用例', '评测数据', '挖数据', '评测集补全'];
const TARGET_SKILL = 'skills/public/eval-mining/';

module.exports = async function(event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || context?.cwd || process.cwd();
  const bus = context?.bus;
  const actions = [];

  const userMessage = event?.payload?.message || event?.payload?.text || '';
  const intent = event?.payload?.intent || '';
  logger.info?.(`[eval-mining-intent-route] Checking intent: ${intent || 'from message'}`);

  const checks = [];

  // Check 1: Detect eval mining intent
  const isEvalMiningIntent = intent === 'user.intent.eval_mining' ||
    MINING_KEYWORDS.some(kw => userMessage.includes(kw));

  checks.push({
    name: 'eval_mining_intent_detected',
    ok: isEvalMiningIntent,
    message: isEvalMiningIntent
      ? 'Eval mining intent detected'
      : 'No eval mining intent found in message',
  });

  // Check 2: Target skill exists
  if (isEvalMiningIntent) {
    const skillPath = path.join(root, TARGET_SKILL);
    const skillExists = checkFileExists(skillPath);
    checks.push({
      name: 'target_skill_exists',
      ok: skillExists,
      message: skillExists
        ? `Target skill found: ${TARGET_SKILL}`
        : `Target skill not found: ${TARGET_SKILL}`,
    });

    actions.push(`route_to_skill:${TARGET_SKILL}`);
  }

  const result = gateResult(rule?.id || 'eval-mining-intent-route', checks, { failClosed: false });

  const reportPath = path.join(root, 'reports', 'eval-mining-intent-route', `report-${Date.now()}.json`);
  writeReport(reportPath, {
    timestamp: new Date().toISOString(),
    handler: 'eval-mining-intent-route',
    intentDetected: isEvalMiningIntent,
    targetSkill: TARGET_SKILL,
    ...result,
  });
  actions.push(`report_written:${reportPath}`);

  await emitEvent(bus, 'eval-mining-intent-route.completed', {
    ok: result.ok,
    routed: isEvalMiningIntent,
    targetSkill: isEvalMiningIntent ? TARGET_SKILL : null,
  });

  return { ok: result.ok, autonomous: true, actions, ...result };
};
