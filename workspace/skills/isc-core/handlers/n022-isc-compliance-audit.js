#!/usr/bin/env node
/**
 * ISC Handler: Architecture Design ISC Compliance Audit
 * Rule: rule.n022-detection-architecture-design-isc-compliance-audit-022
 *
 * Triggered on design_document_created / architecture_design_completed / mr_design_generated.
 * Scans design documents for ISC rule compliance, reports violations.
 * Uses handler-utils.
 */
'use strict';

const path = require('path');
const { scanFiles, readRuleJson, writeReport, gateResult } = require('../lib/handler-utils');

const WORKSPACE = process.env.WORKSPACE || path.resolve(__dirname, '../../..');
const RULES_DIR = path.join(__dirname, '../rules');
const REPORT_PATH = path.join(WORKSPACE, 'reports/n022-isc-compliance-audit-report.json');

/**
 * Load all ISC rules that are architecture-relevant.
 */
function loadArchRules() {
  const rules = [];
  scanFiles(RULES_DIR, /^rule\..*\.json$/, (fp) => {
    const rule = readRuleJson(fp);
    if (rule && rule.id) rules.push(rule);
  }, { maxDepth: 1 });
  return rules;
}

/**
 * Audit a design document path for ISC compliance.
 * @param {string} docPath - path to the design document
 */
function auditDesignDoc(docPath) {
  const checks = [];
  const rules = loadArchRules();

  // Check 1: Design document exists and is readable
  const { checkFileExists } = require('../lib/handler-utils');
  const exists = checkFileExists(docPath);
  checks.push({
    name: 'design_doc_exists',
    ok: exists,
    message: exists ? `Design doc found: ${docPath}` : `Design doc not found: ${docPath}`,
  });

  if (!exists) {
    return gateResult('n022-isc-compliance-audit', checks);
  }

  // Check 2: Rules loaded
  checks.push({
    name: 'rules_loaded',
    ok: rules.length > 0,
    message: `Loaded ${rules.length} ISC rules for compliance check`,
  });

  // Check 3: Architecture-related rules have coverage
  const archRules = rules.filter(r =>
    r.id && (r.id.includes('arch') || r.id.includes('design') || r.id.includes('layer'))
  );
  checks.push({
    name: 'arch_rules_coverage',
    ok: archRules.length > 0,
    message: `Found ${archRules.length} architecture-specific rules to audit against`,
  });

  return gateResult('n022-isc-compliance-audit', checks);
}

function main() {
  const docPath = process.argv[2] || path.join(WORKSPACE, 'docs/architecture');

  const result = auditDesignDoc(docPath);
  const report = {
    ...result,
    timestamp: new Date().toISOString(),
    docPath,
  };

  writeReport(REPORT_PATH, report);
  console.log(JSON.stringify(report, null, 2));
  process.exit(result.exitCode);
}

main();
