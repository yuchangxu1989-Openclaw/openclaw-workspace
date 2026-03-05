#!/usr/bin/env node
/**
 * Unified Gate Runner — runs all 6 validation gates
 * Usage: node run-all-gates.js [--gate N]
 */
const path = require('path');

const gates = [
  require('./data-source-gate'),
  require('./isc-compliance-gate'),
  require('./entry-point-smoke-gate'),
  require('./feature-flag-audit-gate'),
  require('./report-integrity-gate'),
  require('./independent-qa-gate'),
];

function main() {
  const args = process.argv.slice(2);
  const gateIdx = args.indexOf('--gate');
  const singleGate = gateIdx >= 0 ? parseInt(args[gateIdx + 1], 10) : null;

  const results = [];
  let allPassed = true;

  const toRun = singleGate ? [{ idx: singleGate, gate: gates[singleGate - 1] }]
    : gates.map((gate, i) => ({ idx: i + 1, gate }));

  for (const { idx, gate } of toRun) {
    if (!gate) {
      console.error(`Gate ${idx} not found`);
      process.exit(1);
    }
    const result = gate.run();
    results.push(result);
    const icon = result.passed ? '✅' : '❌';
    console.log(`${icon} Gate ${idx}: ${result.name} — ${result.passed ? 'PASSED' : 'FAILED'}`);
    if (!result.passed) {
      allPassed = false;
      for (const e of result.errors) {
        console.log(`   → ${e.message || JSON.stringify(e)}`);
      }
    }
  }

  console.log(`\n${allPassed ? '✅ All gates passed' : '❌ Some gates failed'}`);
  process.exit(allPassed ? 0 : 1);
}

main();
