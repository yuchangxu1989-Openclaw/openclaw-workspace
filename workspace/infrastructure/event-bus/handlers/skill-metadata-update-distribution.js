const fs = require('fs');
const path = require('path');

module.exports = async function handler(event, rule, context) {
  const { type, payload } = event;
  const skillId = payload?.skillId || payload?.skillPath || '';
  const distribution = payload?.distribution || 'private';
  const ts = new Date().toISOString();

  console.log(`[skill.metadata.update_distribution] ${ts} skill=${skillId} dist=${distribution}`);

  const record = { timestamp: ts, action: type, skillId, distribution, source: payload?.source || 'metadata_update' };
  const logPath = path.resolve(__dirname, '../data/events.jsonl');
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, JSON.stringify(record) + '\n');
  } catch (_) {}

  return { status: 'ok', skillId, distribution };
};
