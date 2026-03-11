#!/usr/bin/env node
/**
 * ISC Handler: Rule Trigger Completeness (N035)
 * Monitors all rules for trigger field completeness and reports untriggered/misconfigured rules.
 * Uses handler-utils.
 */
'use strict';

const path = require('path');
const { scanFiles, readRuleJson, writeReport, gateResult } = require('../lib/handler-utils');

const RULES_DIR = path.resolve(__dirname, '../rules');
const REPORT_PATH = path.resolve(__dirname, '../../../reports/rule-trigger-summary.json');

function main() {
  const checks = [];

  // 1. Load all rules
  const ruleFiles = scanFiles(RULES_DIR, /\.json$/, null, { maxDepth: 1 });
  const rules = [];
  for (const fp of ruleFiles) {
    const rule = readRuleJson(fp);
    if (rule) rules.push({ file: path.basename(fp), ...rule });
  }

  checks.push({
    name: 'rules_loaded',
    ok: rules.length > 0,
    message: `Loaded ${rules.length} rules from filesystem`,
  });

  // 2. Check trigger field presence
  const missingTrigger = rules.filter(r => !r.trigger);
  const hasTrigger = rules.filter(r => r.trigger);

  checks.push({
    name: 'trigger_field_present',
    ok: missingTrigger.length === 0,
    message: missingTrigger.length === 0
      ? `All ${rules.length} rules have trigger definitions`
      : `${missingTrigger.length} rules missing trigger field: ${missingTrigger.map(r => r.file).join(', ')}`,
  });

  // 3. Check trigger has event
  const missingEvent = hasTrigger.filter(r => !r.trigger.event && (!r.trigger.events || r.trigger.events.length === 0));

  checks.push({
    name: 'trigger_has_event',
    ok: missingEvent.length === 0,
    message: missingEvent.length === 0
      ? 'All triggered rules have event definitions'
      : `${missingEvent.length} rules have trigger but no event: ${missingEvent.map(r => r.file).join(', ')}`,
  });

  // 4. Check enforcement field
  const missingEnforcement = rules.filter(r => !r.enforcement && !r.enforcement_tier);

  checks.push({
    name: 'enforcement_defined',
    ok: missingEnforcement.length === 0,
    message: missingEnforcement.length === 0
      ? 'All rules have enforcement definitions'
      : `${missingEnforcement.length} rules missing enforcement`,
  });

  const triggerRate = rules.length > 0 ? ((hasTrigger.length / rules.length) * 100).toFixed(1) : 0;
  const result = gateResult('rule-trigger-completeness', checks);

  const report = {
    ...result,
    timestamp: new Date().toISOString(),
    total_rules: rules.length,
    triggered_rules: hasTrigger.length,
    untriggered_rules: missingTrigger.map(r => r.file),
    trigger_rate: `${triggerRate}%`,
    missing_event: missingEvent.map(r => r.file),
    missing_enforcement: missingEnforcement.map(r => r.file),
  };

  writeReport(REPORT_PATH, report);
  console.log(JSON.stringify(report, null, 2));
  process.exit(result.exitCode);
}

main();
