/**
 * dedup-scan handler
 * 触发规则去重扫描
 */
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.resolve(__dirname, '../../logs/dedup-scan.jsonl');

module.exports = async function(event, rule, context) {
  const payload = event.payload || {};
  const ruleId = payload.ruleId || 'unknown';
  const changedFields = payload.changedFields || [];

  // Simulate dedup scan
  const details = `去重扫描触发：规则${ruleId}，变更字段：${changedFields.join(', ') || 'N/A'}`;

  const record = {
    timestamp: new Date().toISOString(),
    handler: 'dedup-scan',
    eventType: event.type,
    ruleId: rule.id,
    targetRule: ruleId,
    changedFields,
    result: 'scanned'
  };

  const dir = path.dirname(LOG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(LOG_FILE, JSON.stringify(record) + '\n');

  return { success: true, result: 'scanned', details };
};
