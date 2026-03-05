/**
 * Report Snapshot Lock Mechanism
 * 
 * Prevents "ghost data" by fingerprinting data files referenced by reports.
 * Each report gets a .snapshot.json with SHA-256 hashes of its data dependencies.
 * Verification compares current file hashes against the snapshot to detect staleness.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function fileHash(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Create a snapshot for a report and its data dependencies.
 * @param {string} reportPath - Path to the report file
 * @param {string[]} dataFiles - Paths to data files the report depends on
 * @returns {object} The snapshot object
 */
function snapshot(reportPath, dataFiles = []) {
  const absReport = path.resolve(reportPath);
  if (!fs.existsSync(absReport)) {
    throw new Error(`Report not found: ${absReport}`);
  }

  const snap = {
    version: 1,
    reportPath: absReport,
    reportHash: fileHash(absReport),
    createdAt: new Date().toISOString(),
    dataFiles: {}
  };

  for (const f of dataFiles) {
    const absF = path.resolve(f);
    if (!fs.existsSync(absF)) {
      snap.dataFiles[absF] = { hash: null, error: 'FILE_NOT_FOUND' };
    } else {
      snap.dataFiles[absF] = { hash: fileHash(absF) };
    }
  }

  // Write snapshot alongside the report
  const snapshotPath = absReport + '.snapshot.json';
  fs.writeFileSync(snapshotPath, JSON.stringify(snap, null, 2) + '\n');
  return snap;
}

/**
 * Verify a snapshot against current file states.
 * @param {string} snapshotPath - Path to the .snapshot.json file
 * @returns {object} { status: 'VALID'|'STALE', changes: [] }
 */
function verify(snapshotPath) {
  const snap = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'));
  const changes = [];

  // Check report itself
  if (!fs.existsSync(snap.reportPath)) {
    changes.push({ file: snap.reportPath, reason: 'REPORT_DELETED' });
  } else {
    const current = fileHash(snap.reportPath);
    if (current !== snap.reportHash) {
      changes.push({ file: snap.reportPath, reason: 'REPORT_MODIFIED', expected: snap.reportHash, actual: current });
    }
  }

  // Check data files
  for (const [filePath, info] of Object.entries(snap.dataFiles)) {
    if (info.error === 'FILE_NOT_FOUND') {
      // Was already missing at snapshot time, check if still missing
      if (fs.existsSync(filePath)) {
        changes.push({ file: filePath, reason: 'FILE_APPEARED' });
      }
      continue;
    }

    if (!fs.existsSync(filePath)) {
      changes.push({ file: filePath, reason: 'FILE_DELETED' });
    } else {
      const current = fileHash(filePath);
      if (current !== info.hash) {
        changes.push({ file: filePath, reason: 'DATA_MODIFIED', expected: info.hash, actual: current });
      }
    }
  }

  return {
    status: changes.length === 0 ? 'VALID' : 'STALE',
    reportPath: snap.reportPath,
    snapshotCreatedAt: snap.createdAt,
    changes
  };
}

module.exports = { snapshot, verify, fileHash };
