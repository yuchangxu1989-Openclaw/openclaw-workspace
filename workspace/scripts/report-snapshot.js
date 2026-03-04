#!/usr/bin/env node
'use strict';

/**
 * Condition 5: Report Snapshot Locking Mechanism
 * 
 * Generates timestamped read-only snapshots of reports.
 * Prevents data inconsistency from post-hoc modifications.
 * 
 * Usage:
 *   node report-snapshot.js                     # Snapshot all day* reports
 *   node report-snapshot.js path/to/report.md   # Snapshot specific report
 *   node report-snapshot.js --all               # Snapshot everything in reports/
 */

const fs = require('fs');
const path = require('path');

const REPORTS_DIR = path.resolve(__dirname, '../reports');
const SNAPSHOTS_DIR = path.join(REPORTS_DIR, 'snapshots');

function getTimestamp() {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function createSnapshot(reportPath) {
  if (!fs.existsSync(reportPath)) {
    console.log(`  ⚠️  Not found: ${reportPath}`);
    return null;
  }

  const stat = fs.statSync(reportPath);
  if (stat.isDirectory()) return null;

  const basename = path.basename(reportPath, path.extname(reportPath));
  const ext = path.extname(reportPath);
  const timestamp = getTimestamp();
  const snapshotName = `${basename}_${timestamp}${ext}`;
  const snapshotPath = path.join(SNAPSHOTS_DIR, snapshotName);

  // Create snapshots dir
  fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });

  // Copy content
  const content = fs.readFileSync(reportPath);
  fs.writeFileSync(snapshotPath, content);

  // Make read-only (444)
  fs.chmodSync(snapshotPath, 0o444);

  console.log(`  ✅ ${path.basename(reportPath)} → snapshots/${snapshotName} (read-only)`);
  return snapshotPath;
}

function snapshotDayReports() {
  console.log('═══ Report Snapshot Generator ═══\n');
  console.log(`Reports dir: ${REPORTS_DIR}`);
  console.log(`Snapshots dir: ${SNAPSHOTS_DIR}\n`);

  const args = process.argv.slice(2);
  let files = [];

  if (args.length > 0 && args[0] !== '--all') {
    // Specific file(s)
    files = args.map(a => path.resolve(a));
  } else if (args[0] === '--all') {
    // All reports
    files = fs.readdirSync(REPORTS_DIR)
      .filter(f => f.endsWith('.md') || f.endsWith('.json'))
      .filter(f => !f.startsWith('.'))
      .map(f => path.join(REPORTS_DIR, f));
  } else {
    // Default: all day* reports
    files = fs.readdirSync(REPORTS_DIR)
      .filter(f => f.startsWith('day') && (f.endsWith('.md') || f.endsWith('.json')))
      .map(f => path.join(REPORTS_DIR, f));
  }

  if (files.length === 0) {
    console.log('No reports found to snapshot.');
    return [];
  }

  console.log(`Snapshotting ${files.length} report(s):\n`);
  const snapshots = [];

  for (const file of files) {
    const result = createSnapshot(file);
    if (result) snapshots.push(result);
  }

  console.log(`\n═══ Done: ${snapshots.length} snapshot(s) created ═══`);

  // Write manifest
  const manifest = {
    timestamp: new Date().toISOString(),
    snapshot_count: snapshots.length,
    snapshots: snapshots.map(s => ({
      path: s,
      name: path.basename(s),
      permissions: '444 (read-only)',
    })),
  };

  const manifestPath = path.join(SNAPSHOTS_DIR, 'snapshot-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  return snapshots;
}

snapshotDayReports();
