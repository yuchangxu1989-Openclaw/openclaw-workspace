/**
 * notify-alert handler — 写入alerts.jsonl，可被heartbeat读取
 */
const fs = require('fs');
const path = require('path');

const ALERTS_FILE = path.resolve(__dirname, '../../logs/alerts.jsonl');

module.exports = async function(event, rule, context) {
  const alert = {
    timestamp: new Date().toISOString(),
    handler: 'notify-alert',
    severity: rule.severity || 'info',
    eventType: event.type,
    eventId: event.id,
    ruleId: rule.id,
    ruleName: rule.rule_name || rule.name || rule.id,
    message: `Rule ${rule.id} triggered by ${event.type}`,
    payload: event.payload,
    acknowledged: false
  };

  const dir = path.dirname(ALERTS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(ALERTS_FILE, JSON.stringify(alert) + '\n');

  return { success: true, result: `Alert written: ${alert.message}` };
};
