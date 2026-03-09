#!/usr/bin/env node
/**
 * ISC Handler: Auto AEO Evaluation Standard Generation
 * Rule: rule.n023-auto-aeo-evaluation-standard-generation-023
 *
 * Triggered on skill_created / skill_major_update / aeo_evaluation_required.
 * Auto-generates or updates AEO evaluation standards when skills change.
 * Uses handler-utils.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { checkFileExists, writeReport, scanFiles, gateResult } = require('../lib/handler-utils');

const WORKSPACE = process.env.WORKSPACE || path.resolve(__dirname, '../../..');
const EVAL_DIR = path.join(WORKSPACE, 'eval');
const REPORT_PATH = path.join(WORKSPACE, 'reports/n023-aeo-eval-standard-report.json');

/**
 * Check if a skill has an associated AEO evaluation standard.
 * @param {string} skillName - skill identifier
 * @returns {{exists: boolean, path: string}}
 */
function findEvalStandard(skillName) {
  const candidates = [
    path.join(EVAL_DIR, `${skillName}.eval.json`),
    path.join(EVAL_DIR, `${skillName}/eval-standard.json`),
    path.join(EVAL_DIR, 'standards', `${skillName}.json`),
  ];
  for (const p of candidates) {
    if (checkFileExists(p)) return { exists: true, path: p };
  }
  return { exists: false, path: candidates[0] };
}

/**
 * Generate a skeleton AEO evaluation standard for a skill.
 * @param {string} skillName
 * @returns {object} the generated standard
 */
function generateStandard(skillName) {
  return {
    skill: skillName,
    version: '1.0.0',
    generated_at: new Date().toISOString(),
    dimensions: [
      { name: 'accuracy', weight: 0.3, description: 'Output correctness' },
      { name: 'completeness', weight: 0.3, description: 'Coverage of requirements' },
      { name: 'efficiency', weight: 0.2, description: 'Resource and time efficiency' },
      { name: 'user_satisfaction', weight: 0.2, description: 'User feedback alignment' },
    ],
    thresholds: { pass: 0.7, excellent: 0.9 },
    status: 'auto_generated',
  };
}

function main() {
  const skillName = process.argv[2] || 'unknown-skill';
  const checks = [];

  // Check 1: Eval directory
  const evalDirExists = checkFileExists(EVAL_DIR);
  checks.push({
    name: 'eval_dir_exists',
    ok: true,
    message: evalDirExists ? `Eval dir exists: ${EVAL_DIR}` : 'Eval dir will be created on write',
  });

  // Check 2: Existing standard
  const existing = findEvalStandard(skillName);
  checks.push({
    name: 'existing_standard_check',
    ok: true,
    message: existing.exists
      ? `Existing standard found at ${existing.path}`
      : `No existing standard for "${skillName}", will generate`,
  });

  // Check 3: Generate/validate standard
  if (!existing.exists) {
    const standard = generateStandard(skillName);
    writeReport(existing.path, standard);
    checks.push({
      name: 'standard_generated',
      ok: true,
      message: `Generated AEO eval standard at ${existing.path}`,
    });
  } else {
    checks.push({
      name: 'standard_exists',
      ok: true,
      message: 'Standard already exists, no generation needed',
    });
  }

  const result = gateResult('n023-aeo-eval-standard-generation', checks);
  const report = { ...result, timestamp: new Date().toISOString(), skillName };

  writeReport(REPORT_PATH, report);
  console.log(JSON.stringify(report, null, 2));
  process.exit(result.exitCode);
}

main();
