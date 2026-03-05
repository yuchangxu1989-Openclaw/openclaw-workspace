/**
 * Gate 5 — Report Integrity Gate
 * Verifies reports have valid snapshots
 */
const fs = require('fs');
const path = require('path');

function run(options = {}) {
  const errors = [];
  const reportsDir = path.resolve(options.root || '.', 'reports');

  if (!fs.existsSync(reportsDir)) {
    return { gate: 5, name: 'Report Integrity Gate', passed: true, errors: [] };
  }

  // Find reports that have snapshots and verify them
  const reportFiles = [];
  function scan(dir) {
    for (const f of fs.readdirSync(dir)) {
      const full = path.join(dir, f);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) scan(full);
      else if (f.endsWith('.snapshot.json')) reportFiles.push(full);
    }
  }
  scan(reportsDir);

  const snapshotModule = path.resolve(options.root || '.', 'infrastructure/report-snapshot.js');
  if (reportFiles.length > 0 && !fs.existsSync(snapshotModule)) {
    errors.push({ message: 'report-snapshot.js module not found but snapshots exist' });
    return { gate: 5, name: 'Report Integrity Gate', passed: false, errors };
  }

  if (reportFiles.length > 0) {
    const { verify } = require(snapshotModule);
    for (const snapFile of reportFiles) {
      try {
        const result = verify(snapFile);
        if (result.status === 'STALE') {
          errors.push({ snapshot: snapFile, status: 'STALE', changes: result.changes });
        }
      } catch (e) {
        errors.push({ snapshot: snapFile, message: `Verify error: ${e.message}` });
      }
    }
  }

  const passed = errors.length === 0;
  return { gate: 5, name: 'Report Integrity Gate', passed, errors };
}

if (require.main === module) {
  const result = run();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.passed ? 0 : 1);
}

module.exports = { run };
