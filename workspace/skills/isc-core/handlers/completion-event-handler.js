'use strict';

/**
 * ISC Handler: completion-event-handler
 * Rule: ISC-COMPLETION-HANDLER-001
 * Triggers on agent.task.completed — ensures completion events are processed
 * programmatically via completion-handler.sh before any user reply.
 */

const path = require('path');
const { execSync } = require('child_process');
const {
  writeReport,
  emitEvent,
  checkFileExists,
  gateResult,
} = require('../lib/handler-utils');

module.exports = async function(event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || context?.cwd || process.cwd();
  const bus = context?.bus;
  const actions = [];

  const label = event?.payload?.label || 'unknown';
  const status = event?.payload?.status || 'done';
  const summary = event?.payload?.summary || '';

  logger.info?.(`[completion-event-handler] Processing completion: label=${label} status=${status}`);

  const checks = [];

  // Check 1: completion-handler.sh exists
  const scriptPath = path.join(root, 'scripts/completion-handler.sh');
  const scriptExists = checkFileExists(scriptPath);
  checks.push({
    name: 'completion_script_exists',
    ok: scriptExists,
    message: scriptExists ? 'completion-handler.sh found' : 'completion-handler.sh missing',
  });

  // Check 2: Execute the script if it exists
  if (scriptExists) {
    try {
      const output = execSync(
        `bash "${scriptPath}" "${label}" "${status}" "${summary.replace(/"/g, '\\"')}"`,
        { encoding: 'utf8', timeout: 15000, cwd: root }
      ).trim();
      checks.push({
        name: 'completion_script_executed',
        ok: true,
        message: `Script executed successfully: ${output.slice(0, 200)}`,
      });
      actions.push('completion_script_executed');
    } catch (err) {
      checks.push({
        name: 'completion_script_executed',
        ok: false,
        message: `Script execution failed: ${err.message}`,
      });
    }
  } else {
    checks.push({
      name: 'completion_script_executed',
      ok: false,
      message: 'Skipped — script not found',
    });
  }

  // Check 3: label must be provided
  checks.push({
    name: 'label_provided',
    ok: label !== 'unknown',
    message: label !== 'unknown' ? `Label: ${label}` : 'No label in completion event',
  });

  const result = gateResult(rule?.id || 'ISC-COMPLETION-HANDLER-001', checks);

  const reportPath = path.join(root, 'reports', 'completion-handler', `report-${Date.now()}.json`);
  writeReport(reportPath, {
    timestamp: new Date().toISOString(),
    handler: 'completion-event-handler',
    eventType: event?.type || 'agent.task.completed',
    ruleId: rule?.id || null,
    label,
    status,
    ...result,
  });
  actions.push(`report_written:${reportPath}`);

  await emitEvent(bus, 'completion-event-handler.completed', {
    ok: result.ok,
    status: result.status,
    label,
    actions,
  });

  return {
    ok: result.ok,
    autonomous: true,
    actions,
    message: result.ok
      ? `Completion event for "${label}" processed successfully`
      : `Completion event processing failed: ${result.failed}/${result.total} checks failed`,
    ...result,
  };
};
