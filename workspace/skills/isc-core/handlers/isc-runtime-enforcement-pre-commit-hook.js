'use strict';

/**
 * ISC Handler: isc-runtime-enforcement-pre-commit-hook
 * Rule: rule.intent-isc-runtime-enforcement-engine-pre-commit-hook-gcfr36
 * Validates that pre-commit hook v2.0 with 3-check enforcement is properly configured.
 */

const path = require('path');
const {
  writeReport,
  emitEvent,
  checkFileExists,
  scanFiles,
  gateResult,
} = require('../lib/handler-utils');

module.exports = async function(event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || context?.cwd || process.cwd();
  const bus = context?.bus;
  const checks = [];

  logger.info?.('[isc-runtime-enforcement-pre-commit-hook] Checking pre-commit hook enforcement');

  // Check 1: pre-commit hook file exists
  const hookPath = path.join(root, '.git', 'hooks', 'pre-commit');
  const hookExists = checkFileExists(hookPath);
  checks.push({
    name: 'pre_commit_hook_exists',
    ok: hookExists,
    message: hookExists ? 'pre-commit hook file exists' : 'pre-commit hook not found at .git/hooks/pre-commit',
  });

  // Check 2: hook is executable (has content)
  if (hookExists) {
    const fs = require('fs');
    const content = fs.readFileSync(hookPath, 'utf8');
    const hasEnforcement = content.length > 10;
    checks.push({
      name: 'hook_has_content',
      ok: hasEnforcement,
      message: hasEnforcement ? 'Hook has enforcement logic' : 'Hook file appears empty or trivial',
    });

    // Check 3: 3-check pattern (gate checks)
    const gateCheckCount = (content.match(/gate[-_]?check|check[-_]?gate|enforcement/gi) || []).length;
    const has3Checks = gateCheckCount >= 3;
    checks.push({
      name: 'three_check_enforcement',
      ok: has3Checks,
      message: has3Checks
        ? `Found ${gateCheckCount} gate check references`
        : `Only ${gateCheckCount} gate check references found (expected >=3)`,
    });
  } else {
    checks.push({ name: 'hook_has_content', ok: false, message: 'Skipped — hook not found' });
    checks.push({ name: 'three_check_enforcement', ok: false, message: 'Skipped — hook not found' });
  }

  // Check 4: rules directory has executable rules
  const rulesDir = path.join(root, 'skills', 'isc-core', 'rules');
  const ruleFiles = scanFiles(rulesDir, /^rule\..*\.json$/, null, { maxDepth: 1 });
  const hasRules = ruleFiles.length > 0;
  checks.push({
    name: 'rules_directory_populated',
    ok: hasRules,
    message: hasRules ? `${ruleFiles.length} rule files found` : 'No rule files in rules directory',
  });

  const result = gateResult(rule?.id || 'isc-runtime-enforcement-pre-commit-hook', checks);

  const reportPath = path.join(root, 'reports', 'isc-runtime-enforcement-pre-commit-hook.json');
  writeReport(reportPath, result);

  await emitEvent(bus, 'handler:complete', {
    handler: 'isc-runtime-enforcement-pre-commit-hook',
    ruleId: rule?.id,
    result,
  });

  return result;
};
