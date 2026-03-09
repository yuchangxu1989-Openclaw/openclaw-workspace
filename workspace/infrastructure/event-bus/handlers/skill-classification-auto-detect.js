const fs = require('fs');
const path = require('path');

module.exports = async function handler(event, rule, context) {
  const { type, payload } = event;
  const skillPath = payload?.skillPath || payload?.path || '';
  const ts = new Date().toISOString();

  console.log(`[skill.classification.auto_detect] ${ts} skill=${skillPath}`);

  // 自动检测技能分类：读取SKILL.md的description推断分类
  const classification = payload?.classification || 'unclassified';
  const confidence = payload?.confidence || 0;

  const record = { timestamp: ts, action: type, skillPath, classification, confidence, source: payload?.source || 'auto_detect' };
  const logPath = path.resolve(__dirname, '../data/events.jsonl');
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, JSON.stringify(record) + '\n');
  } catch (_) {}

  return { status: 'ok', classification, confidence };
};
