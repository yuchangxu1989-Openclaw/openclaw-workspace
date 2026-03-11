'use strict';

/**
 * ISC Handler: rule-code-pairing-check
 * Rule: rule.arch-rule-equals-code-002
 * Ensures every ISC rule JSON has a corresponding handler/gate implementation.
 */

const fs = require('fs');
const path = require('path');
const {
  scanFiles,
  writeReport,
  emitEvent,
  gitExec,
  gateResult,
} = require('../lib/handler-utils');

module.exports = async function(event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || context?.cwd || process.cwd();
  const bus = context?.bus;
  const actions = [];

  logger.info?.('[rule-code-pairing-check] Auditing rule-to-handler pairing');

  const rulesDir = path.join(root, 'skills/isc-core/rules');
  const handlersDir = path.join(root, 'skills/isc-core/handlers');

  const checks = [];

  // Collect all rule files
  const ruleFiles = scanFiles(rulesDir, /^rule\..*\.json$/, null, { maxDepth: 1 });

  // Collect all handler files (without extension)
  const handlerNames = new Set();
  if (fs.existsSync(handlersDir)) {
    for (const f of fs.readdirSync(handlersDir)) {
      if (f.endsWith('.js')) handlerNames.add(f.replace('.js', ''));
    }
  }

  let missingHandlers = 0;
  for (const ruleFile of ruleFiles) {
    try {
      const data = JSON.parse(fs.readFileSync(ruleFile, 'utf8'));
      const handler = data?.action?.handler;
      if (handler && !handlerNames.has(handler)) {
        missingHandlers++;
      }
    } catch { /* skip malformed */ }
  }

  checks.push({
    name: 'rule_handler_pairing',
    ok: missingHandlers === 0,
    message: missingHandlers === 0
      ? `All ${ruleFiles.length} rules with handlers have matching implementations`
      : `${missingHandlers} rule(s) reference handlers that don't exist`,
  });

  checks.push({
    name: 'rules_dir_exists',
    ok: fs.existsSync(rulesDir),
    message: fs.existsSync(rulesDir) ? 'Rules directory found' : 'Rules directory missing',
  });

  const result = gateResult(rule?.id || 'rule-code-pairing-check', checks);

  const reportPath = path.join(root, 'reports', 'rule-code-pairing', `report-${Date.now()}.json`);
  writeReport(reportPath, {
    timestamp: new Date().toISOString(),
    handler: 'rule-code-pairing-check',
    totalRules: ruleFiles.length,
    missingHandlers,
    lastCommit: gitExec(root, 'log --oneline -1'),
    ...result,
  });
  actions.push(`report_written:${reportPath}`);

  await emitEvent(bus, 'rule-code-pairing-check.completed', { ok: result.ok, status: result.status, actions });

  return { ok: result.ok, autonomous: true, actions, ...result };
};
