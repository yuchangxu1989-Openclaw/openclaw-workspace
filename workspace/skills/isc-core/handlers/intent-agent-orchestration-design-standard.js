'use strict';

/**
 * ISC Handler: intent-agent-orchestration-design-standard
 * Rule: rule.intent-agent-orchestration-design-standard-p3nxat
 * Enforces: diagnosis must auto-expand into concrete execution queues.
 */

const path = require('path');
const fs = require('fs');
const {
  writeReport,
  emitEvent,
  gitExec,
  scanFiles,
  checkFileExists,
  gateResult,
} = require('../lib/handler-utils');

module.exports = async function (event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || context?.cwd || process.cwd();
  const bus = context?.bus;
  const actions = [];
  const checks = [];

  logger.info?.('[intent-agent-orchestration-design-standard] Checking agent orchestration design standards');

  // Check 1: Orchestration handlers exist (dispatch/orchestration files)
  const handlersDir = path.join(root, 'skills', 'isc-core', 'handlers');
  const orchFiles = scanFiles(handlersDir, /orchestrat|dispatch|queue/i, null, { maxDepth: 1 });
  checks.push({
    name: 'orchestration_handlers_exist',
    ok: orchFiles.length > 0,
    message: orchFiles.length > 0
      ? `${orchFiles.length} orchestration-related handler(s) found`
      : 'No orchestration/dispatch handlers found',
  });

  // Check 2: Diagnostic-to-queue expansion pattern present
  const skillsDir = path.join(root, 'skills');
  let hasExpansionPattern = false;
  scanFiles(skillsDir, /\.(js|md)$/i, (fp) => {
    if (hasExpansionPattern) return;
    try {
      const content = fs.readFileSync(fp, 'utf8');
      if (/expand.*queue|diagnosis.*execution|auto.*expand/i.test(content)) {
        hasExpansionPattern = true;
      }
    } catch { /* skip */ }
  }, { maxDepth: 3 });
  checks.push({
    name: 'diagnostic_expansion_pattern',
    ok: hasExpansionPattern,
    message: hasExpansionPattern
      ? 'Diagnostic-to-execution-queue expansion pattern detected'
      : 'No auto-expand from diagnosis to execution queue found',
  });

  // Check 3: Subagent spawning mechanism available
  const hasSubagentPattern = checkFileExists(path.join(handlersDir, 'parallel-subagent-orchestration.js'))
    || scanFiles(handlersDir, /subagent|spawn/i, null, { maxDepth: 1 }).length > 0;
  checks.push({
    name: 'subagent_spawning_available',
    ok: hasSubagentPattern,
    message: hasSubagentPattern
      ? 'Subagent spawning mechanism found'
      : 'No subagent spawning handler detected',
  });

  const result = gateResult(rule?.id || 'intent-agent-orchestration-design-standard-p3nxat', checks);

  const reportPath = path.join(root, 'reports', 'agent-orchestration-standard', `report-${Date.now()}.json`);
  writeReport(reportPath, {
    timestamp: new Date().toISOString(),
    handler: 'intent-agent-orchestration-design-standard',
    lastCommit: gitExec(root, 'log --oneline -1'),
    ...result,
  });
  actions.push(`report_written:${reportPath}`);

  await emitEvent(bus, 'intent-agent-orchestration-design-standard.completed', { ok: result.ok, status: result.status, actions });

  return { ok: result.ok, autonomous: true, actions, ...result };
};
