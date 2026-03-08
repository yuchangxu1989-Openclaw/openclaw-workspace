/**
 * log-only handler: 仅记录事件，不执行动作
 * 别名: log_only
 */
const fs = require('fs');
const path = require('path');

module.exports = async function logOnly(event, rule, ctx) {
  const logPath = path.resolve(__dirname, '../../logs/handler-actions.jsonl');
  const entry = {
    handler: 'log-only',
    eventType: event?.type,
    ruleId: rule?.id,
    timestamp: new Date().toISOString(),
    note: 'log-only action'
  };
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, JSON.stringify(entry) + '\n');
  return { success: true, result: 'logged' };
};
