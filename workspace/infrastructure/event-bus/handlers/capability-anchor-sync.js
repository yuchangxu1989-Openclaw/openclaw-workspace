/**
 * capability-anchor-sync handler — 触发能力锚点重建
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.resolve(__dirname, '../../logs/capability-anchor-sync.jsonl');
const REGEN_SCRIPT = path.resolve(__dirname, '../../../scripts/regenerate-capability-anchor.sh');

module.exports = async function(event, rule, context) {
  let result;
  
  if (fs.existsSync(REGEN_SCRIPT)) {
    try {
      const output = execSync(`bash ${REGEN_SCRIPT}`, {
        timeout: 30000,
        encoding: 'utf8',
        cwd: '/root/.openclaw/workspace'
      });
      result = { executed: true, output: output.slice(0, 500) };
    } catch (e) {
      result = { executed: false, error: e.message.slice(0, 300) };
    }
  } else {
    result = { executed: false, error: `Script not found: ${REGEN_SCRIPT}` };
  }

  const record = {
    timestamp: new Date().toISOString(),
    handler: 'capability-anchor-sync',
    eventType: event.type,
    ruleId: rule.id,
    result
  };

  const dir = path.dirname(LOG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(LOG_FILE, JSON.stringify(record) + '\n');

  return { success: result.executed !== false || result.error?.includes('Script not found'), result };
};
