#!/usr/bin/env node
/**
 * ISC Runtime Enforcement Engine - Unified Gate Runner
 * Usage: node enforce.js <gate_name> <target_path>
 * Gates: skill-publish, benchmark-submit, report-generate
 */
const { execFileSync } = require('child_process');
const path = require('path');

const GATES = {
  'skill-publish': 'gate-check-skill-md.js',
  'benchmark-submit': 'gate-check-benchmark-data.js',
  'report-generate': 'gate-check-report-validation.js'
};

const gate = process.argv[2];
const target = process.argv[3];

if (!gate || !target || !GATES[gate]) {
  console.error(`Usage: node enforce.js <gate> <target>\nGates: ${Object.keys(GATES).join(', ')}`);
  process.exit(1);
}

const script = path.join(__dirname, GATES[gate]);
try {
  execFileSync('node', [script, target], { stdio: 'inherit' });
} catch (e) {
  process.exit(e.status || 1);
}
