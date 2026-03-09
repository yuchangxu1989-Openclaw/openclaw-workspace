#!/usr/bin/env node
/**
 * ISC Handler: Badcase Auto Flip
 * Rule: ISC-BADCASE-AUTO-FLIP-001
 *
 * Monitors badcase files and generates corresponding goodcase files
 * by flipping expected outcomes. Validates the flip is complete.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { writeReport, gateResult, checkFileExists } = require('../lib/handler-utils');

const WORKSPACE = process.env.WORKSPACE || path.resolve(__dirname, '../../..');

const DEFAULT_BADCASE_PATH = path.join(
  WORKSPACE, 'tests/benchmarks/intent/c2-golden/00-real-badcases.json'
);

/**
 * Flip a badcase entry to a goodcase by inverting expected outcomes
 */
function flipCase(entry) {
  const flipped = { ...entry };
  // Invert expected result
  if ('expected' in flipped) {
    if (typeof flipped.expected === 'boolean') {
      flipped.expected = !flipped.expected;
    } else if (typeof flipped.expected === 'string') {
      flipped.expected = flipped.expected === 'pass' ? 'fail' : 'pass';
    }
  }
  if ('is_badcase' in flipped) {
    flipped.is_badcase = false;
  }
  flipped._flipped_from = entry.id || entry.name || 'unknown';
  flipped._flipped_at = new Date().toISOString();
  return flipped;
}

function main() {
  const badcasePath = process.argv[2] || DEFAULT_BADCASE_PATH;
  const checks = [];

  // Check badcase file exists
  if (!checkFileExists(badcasePath)) {
    checks.push({
      name: 'badcase-file-exists',
      ok: false,
      message: `Badcase file not found: ${badcasePath}`,
    });
    const gate = gateResult('badcase-auto-flip', checks);
    console.log(JSON.stringify(gate, null, 2));
    process.exit(gate.exitCode);
  }

  checks.push({ name: 'badcase-file-exists', ok: true, message: 'Badcase file found' });

  // Read and parse
  let badcases;
  try {
    badcases = JSON.parse(fs.readFileSync(badcasePath, 'utf8'));
    if (!Array.isArray(badcases)) badcases = [badcases];
  } catch (err) {
    checks.push({ name: 'parse-badcases', ok: false, message: err.message });
    const gate = gateResult('badcase-auto-flip', checks);
    console.log(JSON.stringify(gate, null, 2));
    process.exit(gate.exitCode);
  }

  checks.push({
    name: 'parse-badcases',
    ok: true,
    message: `Parsed ${badcases.length} badcase entries`,
  });

  // Flip cases
  const goodcases = badcases.map(flipCase);

  // Write goodcase output
  const goodcasePath = badcasePath.replace(/badcase/gi, 'goodcase');
  const reportDir = path.join(WORKSPACE, 'reports', 'isc');

  try {
    fs.mkdirSync(path.dirname(goodcasePath), { recursive: true });
    fs.writeFileSync(goodcasePath, JSON.stringify(goodcases, null, 2) + '\n');
    checks.push({
      name: 'write-goodcases',
      ok: true,
      message: `Wrote ${goodcases.length} goodcases to ${path.basename(goodcasePath)}`,
    });
  } catch (err) {
    checks.push({ name: 'write-goodcases', ok: false, message: err.message });
  }

  writeReport(path.join(reportDir, 'badcase-auto-flip.json'), {
    handler: 'badcase-auto-flip',
    ruleId: 'ISC-BADCASE-AUTO-FLIP-001',
    timestamp: new Date().toISOString(),
    badcaseFile: badcasePath,
    goodcaseFile: goodcasePath,
    count: goodcases.length,
  });

  const gate = gateResult('badcase-auto-flip', checks);
  console.log(JSON.stringify(gate, null, 2));
  process.exit(gate.exitCode);
}

main();
