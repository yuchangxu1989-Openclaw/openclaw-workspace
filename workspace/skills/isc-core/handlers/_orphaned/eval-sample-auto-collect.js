'use strict';

/**
 * ISC Handler: eval-sample-auto-collect
 * Rule: rule.auto-collect-eval-from-conversation-001
 * Auto-collects complex user messages (IC3-IC5, >=40 chars) as eval samples.
 */

const fs = require('fs');
const path = require('path');
const {
  writeReport,
  emitEvent,
  checkFileExists,
  gateResult,
  gitExec,
} = require('../lib/handler-utils');

module.exports = async function (event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || context?.cwd || process.cwd();
  const bus = context?.bus;
  const actions = [];

  const payload = event?.payload || {};
  const message = payload.message || payload.text || '';
  const complexity = payload.complexity || null;
  const contentType = payload.content_type || null;

  logger.info?.(`[eval-sample-auto-collect] Evaluating message (${message.length} chars)`);

  const checks = [];

  // Check 1: message meets minimum length
  const MIN_LENGTH = 40;
  checks.push({
    name: 'min_length',
    ok: message.length >= MIN_LENGTH,
    message: `Message length: ${message.length} (min: ${MIN_LENGTH})`,
  });

  // Check 2: complexity level qualifies
  const qualifyingLevels = ['IC3', 'IC4', 'IC5'];
  const complexityOk = !complexity || qualifyingLevels.includes(complexity);
  checks.push({
    name: 'complexity_qualifies',
    ok: complexityOk && message.length >= MIN_LENGTH,
    message: complexity ? `Complexity: ${complexity}` : 'Complexity not specified (auto-qualify)',
  });

  // Check 3: verbatim preservation (message should not be truncated/modified)
  const isVerbatim = message === payload.original_message || !payload.original_message;
  checks.push({
    name: 'verbatim_preserved',
    ok: isVerbatim,
    message: isVerbatim ? 'Message is verbatim' : 'Message was modified from original',
  });

  // If qualifies, write to eval samples
  if (message.length >= MIN_LENGTH && complexityOk) {
    const samplesDir = path.join(root, 'tests', 'benchmarks', 'intent', 'eval-samples');
    const sampleFile = path.join(samplesDir, `sample-${Date.now()}.json`);
    writeReport(sampleFile, {
      message,
      complexity: complexity || 'unknown',
      content_type: contentType,
      context: payload.context || null,
      session_id: payload.session_id || null,
      collected_at: new Date().toISOString(),
      source: 'auto-collect',
    });
    actions.push(`sample_written:${sampleFile}`);
  }

  const result = gateResult(rule?.id || 'eval-sample-auto-collect', checks, { failClosed: false });

  const reportPath = path.join(root, 'reports', 'eval-sample-collect', `report-${Date.now()}.json`);
  writeReport(reportPath, {
    timestamp: new Date().toISOString(),
    handler: 'eval-sample-auto-collect',
    ruleId: rule?.id || null,
    messageLength: message.length,
    complexity,
    lastCommit: gitExec(root, 'log --oneline -1'),
    ...result,
  });
  actions.push(`report_written:${reportPath}`);

  await emitEvent(bus, 'eval-sample-auto-collect.completed', {
    ok: result.ok,
    collected: message.length >= MIN_LENGTH && complexityOk,
    actions,
  });

  return {
    ok: result.ok,
    autonomous: true,
    actions,
    message: result.ok
      ? `Eval sample collected (${message.length} chars, ${complexity || 'auto'})`
      : `Sample not collected: ${result.failed} checks failed`,
    ...result,
  };
};
