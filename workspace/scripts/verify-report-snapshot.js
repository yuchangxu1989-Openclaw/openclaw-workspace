#!/usr/bin/env node
/**
 * Verify all report snapshots in reports/*.snapshot.json
 * Usage: node scripts/verify-report-snapshot.js
 */

const fs = require('fs');
const path = require('path');
const { verify } = require('../infrastructure/report-snapshot');

const reportsDir = path.resolve(__dirname, '../reports');
const snapshots = fs.readdirSync(reportsDir).filter(f => f.endsWith('.snapshot.json'));

if (snapshots.length === 0) {
  console.log('No snapshots found in reports/');
  process.exit(0);
}

let allValid = true;

for (const snapFile of snapshots) {
  const snapPath = path.join(reportsDir, snapFile);
  const result = verify(snapPath);
  const reportName = path.basename(result.reportPath);

  if (result.status === 'VALID') {
    console.log(`✅ VALID  ${reportName} (snapshot: ${result.snapshotCreatedAt})`);
  } else {
    allValid = false;
    console.log(`❌ STALE  ${reportName} (snapshot: ${result.snapshotCreatedAt})`);
    for (const c of result.changes) {
      console.log(`   ⚠️  ${c.reason}: ${path.basename(c.file)}`);
      if (c.expected) console.log(`      expected: ${c.expected.slice(0, 16)}...`);
      if (c.actual) console.log(`      actual:   ${c.actual.slice(0, 16)}...`);
    }
  }
}

process.exit(allValid ? 0 : 1);
