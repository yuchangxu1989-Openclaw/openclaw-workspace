'use strict';

/**
 * ISC Handler: deep-think-auto-delegate
 * Rule: deep-think-auto-delegate-001
 * 深度思考意图自动委派子Agent — 预估处理>30s时必须spawn子Agent
 */

const path = require('path');
const {
  writeReport,
  emitEvent,
  checkFileExists,
  readRuleJson,
  gateResult,
} = require('../lib/handler-utils');

const PROCESSING_THRESHOLD_SECONDS = 30;

module.exports = async function(event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || context?.cwd || process.cwd();
  const bus = context?.bus;

  const message = event?.payload?.message || '';
  const estimatedSeconds = event?.payload?.estimatedProcessingTime || 0;

  logger.info?.(`[deep-think-auto-delegate] estimated=${estimatedSeconds}s`);

  const checks = [];

  // Check 1: keywords config exists
  const keywordsPath = path.join(root, 'config/deep-think-keywords.json');
  const keywordsExist = checkFileExists(keywordsPath);
  checks.push({
    name: 'keywords_config_exists',
    ok: keywordsExist,
    message: keywordsExist ? 'Keywords config found' : 'Keywords config missing',
  });

  // Check 2: detection script exists
  const detectScript = path.join(root, 'scripts/detect-deep-think-intent.sh');
  const detectExists = checkFileExists(detectScript);
  checks.push({
    name: 'detection_script_exists',
    ok: detectExists,
    message: detectExists ? 'Detection script found' : 'Detection script missing',
  });

  // Check 3: processing time exceeds threshold
  const exceedsThreshold = estimatedSeconds > PROCESSING_THRESHOLD_SECONDS;
  checks.push({
    name: 'exceeds_processing_threshold',
    ok: true, // informational — not a gate blocker
    message: exceedsThreshold
      ? `${estimatedSeconds}s > ${PROCESSING_THRESHOLD_SECONDS}s threshold — delegation required`
      : `${estimatedSeconds}s <= ${PROCESSING_THRESHOLD_SECONDS}s threshold — direct processing OK`,
  });

  const result = gateResult('deep-think-auto-delegate-001', checks);

  if (result.ok && exceedsThreshold) {
    await emitEvent(bus, 'isc.delegation.required', {
      ruleId: 'deep-think-auto-delegate-001',
      reason: 'deep_think_intent',
      estimatedSeconds,
      timestamp: new Date().toISOString(),
    });
  }

  const reportPath = path.join(root, 'reports', 'isc', `deep-think-delegate-${Date.now()}.json`);
  writeReport(reportPath, { rule: 'deep-think-auto-delegate-001', result });

  logger.info?.(`[deep-think-auto-delegate] result=${result.status}`);
  return result;
};
