/**
 * auto-fix handler — 简单自动修复（如文件格式规范化）
 */
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.resolve(__dirname, '../../logs/auto-fix.jsonl');

module.exports = async function(event, rule, context) {
  const fixes = [];
  const payload = event.payload || {};

  // Fix 1: If a file path is provided, check JSON formatting
  if (payload.file && payload.file.endsWith('.json')) {
    const filePath = path.resolve('/root/.openclaw/workspace', payload.file);
    if (fs.existsSync(filePath)) {
      try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        const formatted = JSON.stringify(parsed, null, 2) + '\n';
        if (raw !== formatted) {
          fs.writeFileSync(filePath, formatted);
          fixes.push({ type: 'json_format', file: payload.file, status: 'fixed' });
        } else {
          fixes.push({ type: 'json_format', file: payload.file, status: 'already_ok' });
        }
      } catch (e) {
        fixes.push({ type: 'json_format', file: payload.file, status: 'error', error: e.message });
      }
    }
  }

  const record = {
    timestamp: new Date().toISOString(),
    handler: 'auto-fix',
    eventType: event.type,
    ruleId: rule.id,
    fixesApplied: fixes.length,
    fixes
  };

  const dir = path.dirname(LOG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(LOG_FILE, JSON.stringify(record) + '\n');

  return { success: true, result: { fixesApplied: fixes.length, fixes } };
};
