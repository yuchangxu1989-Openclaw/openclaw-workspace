'use strict';

/**
 * ISC Handler: handler-missing-auto-correction
 * Rule: rule.auto-correction-规则存在但handler缺失-mmgbaua1
 * Detects rules without handlers and reports for auto-correction.
 */

const fs = require('fs');
const path = require('path');
const {
  writeReport,
  emitEvent,
  scanFiles,
  checkFileExists,
  readRuleJson,
  gateResult,
  gitExec,
} = require('../lib/handler-utils');

module.exports = async function (event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || context?.cwd || process.cwd();
  const bus = context?.bus;
  const actions = [];

  logger.info?.('[handler-missing-auto-correction] Scanning for rules without handlers');

  const rulesDir = path.join(root, 'skills', 'isc-core', 'rules');
  const handlersDir = path.join(root, 'skills', 'isc-core', 'handlers');

  const checks = [];
  const missingHandlers = [];

  const ruleFiles = scanFiles(rulesDir, /^rule\..*\.json$/, null, { maxDepth: 1 });
  const handlerFiles = checkFileExists(handlersDir)
    ? new Set(fs.readdirSync(handlersDir).filter(f => f.endsWith('.js')).map(f => f.replace(/\.js$/, '')))
    : new Set();

  for (const rf of ruleFiles) {
    const ruleObj = readRuleJson(rf);
    if (!ruleObj) continue;

    const handlerName = ruleObj.action?.handler;
    const scriptPath = ruleObj.action?.script;

    const hasHandler = handlerName && handlerFiles.has(handlerName);
    const hasScript = scriptPath && checkFileExists(path.resolve(root, scriptPath));

    if (!hasHandler && !hasScript) {
      missingHandlers.push({
        file: path.basename(rf),
        id: ruleObj.id || ruleObj.rule_id || path.basename(rf, '.json'),
        declaredHandler: handlerName || null,
        declaredScript: scriptPath || null,
      });
    }
  }

  checks.push({
    name: 'all_rules_have_handlers',
    ok: missingHandlers.length === 0,
    message: `${missingHandlers.length} rules missing handlers out of ${ruleFiles.length} total`,
  });

  // Emit correction events for each missing handler
  for (const missing of missingHandlers.slice(0, 20)) {
    await emitEvent(bus, 'isc.rule.handler_missing', {
      ruleId: missing.id,
      ruleFile: missing.file,
    });
    actions.push(`correction_event:${missing.id}`);
  }

  const result = gateResult(rule?.id || 'handler-missing-auto-correction', checks, { failClosed: false });

  const reportPath = path.join(root, 'reports', 'handler-missing', `report-${Date.now()}.json`);
  writeReport(reportPath, {
    timestamp: new Date().toISOString(),
    handler: 'handler-missing-auto-correction',
    ruleId: rule?.id || null,
    totalRules: ruleFiles.length,
    missingCount: missingHandlers.length,
    missingSample: missingHandlers.slice(0, 20),
    lastCommit: gitExec(root, 'log --oneline -1'),
    ...result,
  });
  actions.push(`report_written:${reportPath}`);

  await emitEvent(bus, 'handler-missing-auto-correction.completed', {
    ok: result.ok,
    missingCount: missingHandlers.length,
    actions,
  });

  return {
    ok: result.ok,
    autonomous: true,
    actions,
    message: result.ok
      ? `All ${ruleFiles.length} rules have handler implementations`
      : `${missingHandlers.length} rules need handler creation`,
    ...result,
  };
};
