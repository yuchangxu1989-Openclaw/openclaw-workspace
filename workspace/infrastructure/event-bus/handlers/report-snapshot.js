/**
 * report-snapshot handler
 * 锁定评测报告快照
 */
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.resolve(__dirname, '../../logs/report-snapshots.jsonl');
const SNAPSHOT_DIR = path.resolve(__dirname, '../../../reports/snapshots');

module.exports = async function(event, rule, context) {
  const payload = event.payload || {};
  const reportId = payload.reportId || `report_${Date.now()}`;
  const reportData = payload.reportData || {};

  if (!fs.existsSync(SNAPSHOT_DIR)) fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });

  const snapshotFile = path.join(SNAPSHOT_DIR, `${reportId}.json`);
  const snapshot = {
    id: reportId,
    lockedAt: new Date().toISOString(),
    checksum: Buffer.from(JSON.stringify(reportData)).toString('base64').slice(0, 32),
    data: reportData
  };

  fs.writeFileSync(snapshotFile, JSON.stringify(snapshot, null, 2));

  const record = {
    timestamp: new Date().toISOString(),
    handler: 'report-snapshot',
    eventType: event.type,
    ruleId: rule.id,
    reportId,
    snapshotFile
  };

  const dir = path.dirname(LOG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(LOG_FILE, JSON.stringify(record) + '\n');

  return { success: true, result: 'snapshot_locked', details: `Report ${reportId} locked at ${snapshot.lockedAt}` };
};
