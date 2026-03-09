'use strict';

/**
 * ISC Handler: auto-qa-on-completion
 * Rule: ISC-AUTO-QA-001
 * 开发产出自动质量核查 — coder/writer/researcher完成任务后自动触发QA核查
 */

const path = require('path');
const {
  writeReport,
  emitEvent,
  checkFileExists,
  gateResult,
} = require('../lib/handler-utils');

const QA_EXEMPT_AGENTS = ['reviewer', 'analyst', 'scout'];

module.exports = async function(event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || context?.cwd || process.cwd();
  const bus = context?.bus;

  const agentId = event?.payload?.agentId || '';
  const status = event?.payload?.status || '';
  const taskLabel = event?.payload?.label || 'unknown';

  logger.info?.(`[auto-qa-on-completion] agentId=${agentId} status=${status} task=${taskLabel}`);

  const checks = [];

  // Check 1: agent requires QA
  const needsQa = !QA_EXEMPT_AGENTS.includes(agentId);
  checks.push({
    name: 'agent_requires_qa',
    ok: needsQa,
    message: needsQa ? `${agentId} requires QA review` : `${agentId} is exempt from QA`,
  });

  // Check 2: task did not fail
  const notFailed = status !== 'failed';
  checks.push({
    name: 'task_not_failed',
    ok: notFailed,
    message: notFailed ? 'Task completed successfully' : 'Task failed — skip QA',
  });

  // Check 3: QA script exists
  const scriptPath = path.join(root, 'scripts/isc-hooks/ISC-AUTO-QA-001.sh');
  const scriptExists = checkFileExists(scriptPath);
  checks.push({
    name: 'qa_script_exists',
    ok: scriptExists,
    message: scriptExists ? 'QA script found' : 'QA script missing',
  });

  const result = gateResult('ISC-AUTO-QA-001', checks);

  if (result.ok) {
    // Emit event to request QA review from a different agent
    await emitEvent(bus, 'isc.qa.requested', {
      ruleId: 'ISC-AUTO-QA-001',
      agentId,
      taskLabel,
      timestamp: new Date().toISOString(),
    });
  }

  const reportPath = path.join(root, 'reports', 'isc', `auto-qa-${taskLabel}-${Date.now()}.json`);
  writeReport(reportPath, { rule: 'ISC-AUTO-QA-001', event: event?.type, result });

  logger.info?.(`[auto-qa-on-completion] result=${result.status} passed=${result.passed}/${result.total}`);
  return result;
};
