const fs = require('fs');
const path = require('path');

module.exports = async function handler(event, rule, context) {
  const { type, payload } = event;
  const ruleId = payload?.ruleId || rule?.id || 'unknown';
  const ts = new Date().toISOString();

  console.log(`[isc.rule.triggered] ${ts} rule=${ruleId} event=${payload?.originalEventType || type}`);

  const record = {
    timestamp: ts,
    action: type,
    ruleId,
    originalEvent: payload?.originalEventType || '',
    severity: payload?.severity || 'info',
    source: payload?.source || 'isc'
  };
  const logPath = path.resolve(__dirname, '../data/events.jsonl');
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, JSON.stringify(record) + '\n');
  } catch (_) {}

  return { status: 'ok', ruleId };
};
