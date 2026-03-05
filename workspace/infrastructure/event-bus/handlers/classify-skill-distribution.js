/**
 * classify-skill-distribution handler
 * 判断技能是publishable还是local
 */
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.resolve(__dirname, '../../logs/skill-distribution.jsonl');

const LOCAL_PATTERNS = [
  /\/root\//,
  /\/home\//,
  /~\//,
  /\.openclaw\//,
  /MEMORY\.md/,
  /memory\//,
  /skills\/isc-core\//
];

module.exports = async function(event, rule, context) {
  const payload = event.payload || {};
  const content = payload.skillContent || '';
  const hasStandardIO = payload.hasStandardIO || false;

  const localHits = LOCAL_PATTERNS.filter(p => p.test(content));
  const isLocal = localHits.length > 0 || !hasStandardIO;
  const classification = isLocal ? 'local' : 'publishable';

  const details = isLocal
    ? `分类为local：${localHits.length}个本地引用, 标准IO=${hasStandardIO}`
    : '分类为publishable：无本地引用，有标准IO接口';

  const record = {
    timestamp: new Date().toISOString(),
    handler: 'classify-skill-distribution',
    eventType: event.type,
    ruleId: rule.id,
    classification, details
  };

  const dir = path.dirname(LOG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(LOG_FILE, JSON.stringify(record) + '\n');

  return { success: true, result: classification, details };
};
