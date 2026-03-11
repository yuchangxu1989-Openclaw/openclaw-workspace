'use strict';

/**
 * ISC Handler: rule-equals-code-audit
 * Rule: rule.arch-rule-equals-code-002
 * Ensures every ISC rule JSON has a corresponding handler/gate implementation.
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

  logger.info?.('[rule-equals-code-audit] Checking rule-to-handler pairing');

  const rulesDir = path.join(root, 'skills', 'isc-core', 'rules');
  const handlersDir = path.join(root, 'skills', 'isc-core', 'handlers');

  const checks = [];

  // Scan all rule JSONs
  const ruleFiles = scanFiles(rulesDir, /^rule\..*\.json$/, null, { maxDepth: 1 });
  const handlerFiles = checkFileExists(handlersDir)
    ? fs.readdirSync(handlersDir).filter(f => f.endsWith('.js'))
    : [];

  let paired = 0;
  let unpaired = 0;
  const unpairedList = [];

  for (const rf of ruleFiles) {
    const ruleObj = readRuleJson(rf);
    if (!ruleObj) continue;
    const handlerName = ruleObj.action?.handler;
    if (!handlerName) {
      // No handler declared — check if script exists
      const scriptPath = ruleObj.action?.script;
      if (scriptPath && checkFileExists(path.join(root, scriptPath))) {
        paired++;
      } else {
        unpaired++;
        unpairedList.push(path.basename(rf));
      }
      continue;
    }
    // Check handler file exists
    const handlerFile = handlerFiles.find(h => h.replace(/\.js$/, '') === handlerName);
    if (handlerFile) {
      paired++;
    } else {
      unpaired++;
      unpairedList.push(path.basename(rf));
    }
  }

  checks.push({
    name: 'rule_handler_pairing',
    ok: unpaired === 0,
    message: `${paired} paired, ${unpaired} unpaired. Unpaired: ${unpairedList.slice(0, 10).join(', ') || 'none'}`,
  });

  // Check enforcement rate
  const total = paired + unpaired;
  const rate = total > 0 ? (paired / total * 100).toFixed(1) : 100;
  checks.push({
    name: 'enforcement_rate_100',
    ok: Number(rate) >= 100,
    message: `Enforcement rate: ${rate}%`,
  });

  const result = gateResult(rule?.id || 'rule-equals-code-audit', checks, { failClosed: false });

  const reportPath = path.join(root, 'reports', 'rule-equals-code', `report-${Date.now()}.json`);
  writeReport(reportPath, {
    timestamp: new Date().toISOString(),
    handler: 'rule-equals-code-audit',
    ruleId: rule?.id || null,
    totalRules: total,
    paired,
    unpaired,
    unpairedSample: unpairedList.slice(0, 20),
    lastCommit: gitExec(root, 'log --oneline -1'),
    ...result,
  });
  actions.push(`report_written:${reportPath}`);

  await emitEvent(bus, 'rule-equals-code-audit.completed', {
    ok: result.ok,
    status: result.status,
    enforcementRate: rate,
    actions,
  });

  return {
    ok: result.ok,
    autonomous: true,
    actions,
    message: result.ok
      ? `All ${total} rules have handler implementations`
      : `${unpaired}/${total} rules lack handler implementations (${rate}% coverage)`,
    ...result,
  };
};
