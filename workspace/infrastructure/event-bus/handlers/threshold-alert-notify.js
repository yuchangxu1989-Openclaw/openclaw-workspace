const fs = require('fs');
const path = require('path');

module.exports = async function handler(event, rule, context) {
  const { type, payload } = event;
  const metric = payload?.metric || 'unknown';
  const value = payload?.value;
  const threshold = payload?.threshold;
  const ts = new Date().toISOString();

  console.log(`[threshold.alert.notify] ${ts} metric=${metric} value=${value} threshold=${threshold}`);

  const record = {
    timestamp: ts,
    action: type,
    metric,
    value,
    threshold,
    severity: payload?.severity || 'warning',
    source: payload?.source || 'threshold_scanner'
  };
  const logPath = path.resolve(__dirname, '../data/events.jsonl');
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, JSON.stringify(record) + '\n');
  } catch (_) {}

  return { status: 'ok', metric, alerted: true };
};
