/**
 * naming-convention-check handler
 * 检查ISC规则命名是否符合规范
 */
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.resolve(__dirname, '../../logs/naming-convention.jsonl');

module.exports = async function(event, rule, context) {
  const payload = event.payload || {};
  const filename = payload.filename || '';

  // rule.{category}-{name}-{version}.json
  const validPattern = /^rule\.[a-z][a-z0-9-]+-\d{3}\.json$/;
  const result = validPattern.test(filename) ? 'pass' : 'block';
  const details = result === 'pass'
    ? `命名${filename}符合规范`
    : `命名${filename}不符合规范，应为 rule.{category}-{name}-{nnn}.json`;

  const record = {
    timestamp: new Date().toISOString(),
    handler: 'naming-convention-check',
    eventType: event.type,
    ruleId: rule.id,
    filename, result, details
  };

  const dir = path.dirname(LOG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(LOG_FILE, JSON.stringify(record) + '\n');

  return { success: result === 'pass', result, details };
};
