'use strict';

/**
 * ISC Handler: skill-creator-route-001
 * 路由skill-creator请求到实际的skill-creator/index.js执行
 * Trigger: skill.creator.requested
 */

const path = require('path');
const {
  writeReport,
  emitEvent,
  gateResult,
} = require('../lib/handler-utils');

// skill-creator的run()函数
const skillCreatorRun = require('../../skill-creator');

module.exports = async function(event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || context?.cwd || process.cwd();
  const bus = context?.bus;
  const actions = [];
  const checks = [];

  const payload = event?.payload || {};
  const action = payload.action;
  const skillPath = payload.skillPath;

  logger.info?.(`[skill-creator-route] action=${action} skillPath=${skillPath}`);

  // Check 1: action必须有效
  const VALID_ACTIONS = ['validate', 'eval', 'improve', 'package', 'post-create'];
  const actionValid = action && VALID_ACTIONS.includes(action);
  checks.push({
    name: 'action_valid',
    ok: !!actionValid,
    message: actionValid
      ? `Action: ${action}`
      : `Invalid action: ${action}. Must be one of: ${VALID_ACTIONS.join(', ')}`,
  });

  // Check 2: skillPath必须存在
  checks.push({
    name: 'skill_path_provided',
    ok: !!skillPath,
    message: skillPath ? `SkillPath: ${skillPath}` : 'Missing skillPath in event payload',
  });

  let creatorResult = null;

  // 只有校验通过才执行
  if (actionValid && skillPath) {
    try {
      const input = {
        action,
        skillPath,
        model: payload.model || undefined,
        maxIterations: payload.maxIterations || undefined,
        holdout: payload.holdout ?? undefined,
        outputDir: payload.outputDir || undefined,
      };

      creatorResult = await skillCreatorRun(input, { logger });

      checks.push({
        name: 'skill_creator_executed',
        ok: !!creatorResult?.ok,
        message: creatorResult?.ok
          ? `skill-creator ${action} succeeded (${creatorResult.duration_ms}ms)`
          : `skill-creator ${action} failed: ${creatorResult?.error || 'unknown error'}`,
      });
      actions.push(`skill_creator_${action}_executed`);
    } catch (err) {
      checks.push({
        name: 'skill_creator_executed',
        ok: false,
        message: `skill-creator threw: ${err.message}`,
      });
      logger.error?.(`[skill-creator-route] ${err.message}`);
    }
  }

  const result = gateResult(rule?.id || 'skill-creator-route-001', checks);

  // 写报告
  const reportPath = path.join(root, 'reports', 'skill-creator', `route-${Date.now()}.json`);
  writeReport(reportPath, {
    timestamp: new Date().toISOString(),
    handler: 'skill-creator-route',
    eventType: event?.type || 'skill.creator.requested',
    ruleId: rule?.id || null,
    action,
    skillPath,
    creatorResult,
    ...result,
  });
  actions.push(`report_written:${reportPath}`);

  await emitEvent(bus, 'skill-creator-route.completed', {
    ok: result.ok,
    action,
    skillPath,
    creatorResult,
    actions,
  });

  return {
    ok: result.ok,
    autonomous: true,
    actions,
    message: result.ok
      ? `skill-creator ${action} on "${skillPath}" completed successfully`
      : `skill-creator route failed: ${result.failed}/${result.total} checks failed`,
    creatorResult,
    ...result,
  };
};
