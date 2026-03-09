'use strict';

/**
 * ISC Handler: mece-naming-principle
 * Rule: rule.intent-mece命名原则-86o70p
 * Validates MECE naming principles across rules, events, and skills.
 */

const path = require('path');
const {
  writeReport,
  emitEvent,
  scanFiles,
  readRuleJson,
  gateResult,
} = require('../lib/handler-utils');

module.exports = async function(event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || context?.cwd || process.cwd();
  const bus = context?.bus;
  const checks = [];

  logger.info?.('[mece-naming-principle] Checking MECE naming compliance');

  const targetPath = event?.payload?.path || event?.payload?.file;
  const rulesDir = path.join(root, 'skills', 'isc-core', 'rules');

  // Collect rule files to check
  const ruleFiles = scanFiles(rulesDir, /^rule\..*\.json$/, null, { maxDepth: 1 });

  // Check 1: No duplicate prefixes (mutually exclusive)
  const idMap = new Map();
  const duplicates = [];
  for (const f of ruleFiles) {
    const r = readRuleJson(f);
    if (!r?.id) continue;
    const base = r.id.replace(/-\d{3}$/, '').replace(/-[a-z0-9]{6}$/, '');
    if (idMap.has(base)) {
      duplicates.push({ base, files: [idMap.get(base), f] });
    } else {
      idMap.set(base, f);
    }
  }
  checks.push({
    name: 'mutually_exclusive_names',
    ok: duplicates.length === 0,
    message: duplicates.length === 0
      ? `${idMap.size} unique rule name bases — no overlaps`
      : `${duplicates.length} potential naming overlaps detected`,
  });

  // Check 2: Naming convention compliance (lowercase, hyphen-separated)
  const badNames = [];
  for (const f of ruleFiles) {
    const r = readRuleJson(f);
    if (!r?.id) continue;
    if (/[A-Z]/.test(r.id) && !/[\u4e00-\u9fff]/.test(r.id)) {
      badNames.push(r.id);
    }
  }
  checks.push({
    name: 'naming_convention',
    ok: badNames.length === 0,
    message: badNames.length === 0
      ? 'All rule IDs follow lowercase-hyphen convention (Chinese allowed)'
      : `${badNames.length} rules have uppercase in ID without Chinese: ${badNames.slice(0, 3).join(', ')}`,
  });

  // Check 3: Collectively exhaustive — rules should have description
  const noDesc = ruleFiles.filter(f => {
    const r = readRuleJson(f);
    return r && (!r.description || r.description.trim().length < 5);
  });
  checks.push({
    name: 'collectively_exhaustive_descriptions',
    ok: noDesc.length === 0,
    message: noDesc.length === 0
      ? 'All rules have meaningful descriptions'
      : `${noDesc.length} rules lack meaningful description`,
  });

  const result = gateResult(rule?.id || 'mece-naming-principle', checks);

  const reportPath = path.join(root, 'reports', 'mece-naming-principle.json');
  writeReport(reportPath, result);

  await emitEvent(bus, 'handler:complete', {
    handler: 'mece-naming-principle',
    ruleId: rule?.id,
    result,
  });

  return result;
};
