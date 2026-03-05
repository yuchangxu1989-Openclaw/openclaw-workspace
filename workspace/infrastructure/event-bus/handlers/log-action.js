/**
 * log-action handler — 通用日志，将action记录到JSONL
 */
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.resolve(__dirname, '../../logs/handler-actions.jsonl');

module.exports = async function(event, rule, context) {
  const record = {
    timestamp: new Date().toISOString(),
    handler: 'log-action',
    eventType: event.type,
    eventId: event.id,
    ruleId: rule.id,
    payload: event.payload,
    source: event.source
  };
  const dir = path.dirname(LOG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(LOG_FILE, JSON.stringify(record) + '\n');
  return { success: true, result: `Logged to ${LOG_FILE}` };
};
