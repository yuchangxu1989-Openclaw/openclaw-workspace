#!/usr/bin/env node
/**
 * ISC Handler: Rule Identity Accuracy (N034)
 * Scans filesystem for actual rule files, cross-validates with parsed IDs,
 * and reports any count/identity mismatches. Uses handler-utils.
 */
'use strict';

const path = require('path');
const { scanFiles, readRuleJson, writeReport, gateResult } = require('../lib/handler-utils');

const RULES_DIR = path.resolve(__dirname, '../rules');
const REPORT_PATH = path.resolve(__dirname, '../../../reports/rule-accuracy-report.json');

function main() {
  const checks = [];

  // 1. Scan filesystem for rule files
  const ruleFiles = scanFiles(RULES_DIR, /^rule\..*\.json$/, null, { maxDepth: 1 });

  checks.push({
    name: 'filesystem_scan',
    ok: ruleFiles.length > 0,
    message: `Found ${ruleFiles.length} rule files on filesystem`,
  });

  // 2. Parse each rule and extract IDs
  const parsed = [];
  const parseErrors = [];
  for (const fp of ruleFiles) {
    const rule = readRuleJson(fp);
    if (!rule) {
      parseErrors.push(path.basename(fp));
    } else {
      const ruleId = rule.id || rule.ruleId || rule.name || path.basename(fp, '.json');
      parsed.push({ file: path.basename(fp), id: ruleId, domain: rule.domain || 'uncategorized' });
    }
  }

  checks.push({
    name: 'parse_all_rules',
    ok: parseErrors.length === 0,
    message: parseErrors.length === 0
      ? `All ${parsed.length} rules parsed successfully`
      : `Failed to parse: ${parseErrors.join(', ')}`,
  });

  // 3. Check for duplicate IDs
  const idCounts = {};
  for (const r of parsed) {
    idCounts[r.id] = (idCounts[r.id] || 0) + 1;
  }
  const duplicates = Object.entries(idCounts).filter(([, c]) => c > 1).map(([id]) => id);

  checks.push({
    name: 'no_duplicate_ids',
    ok: duplicates.length === 0,
    message: duplicates.length === 0
      ? 'No duplicate rule IDs'
      : `Duplicate IDs: ${duplicates.join(', ')}`,
  });

  // 4. Check required fields
  const missingFields = [];
  for (const fp of ruleFiles) {
    const rule = readRuleJson(fp);
    if (!rule) continue;
    const missing = ['id', 'name', 'domain'].filter(f => !rule[f]);
    if (missing.length) missingFields.push({ file: path.basename(fp), missing });
  }

  checks.push({
    name: 'required_fields_present',
    ok: missingFields.length === 0,
    message: missingFields.length === 0
      ? 'All rules have required fields (id, name, domain)'
      : `${missingFields.length} rules missing required fields`,
  });

  // 5. Categorize by domain
  const byDomain = {};
  for (const r of parsed) {
    byDomain[r.domain] = (byDomain[r.domain] || 0) + 1;
  }

  const result = gateResult('rule-identity-accuracy', checks);

  // Write report
  const report = {
    ...result,
    timestamp: new Date().toISOString(),
    total_rules: parsed.length,
    total_categories: Object.keys(byDomain).length,
    rules_by_category: byDomain,
    duplicates,
    parse_errors: parseErrors,
    missing_fields: missingFields,
  };

  writeReport(REPORT_PATH, report);
  console.log(JSON.stringify(report, null, 2));
  process.exit(result.exitCode);
}

main();
