/**
 * document-structure-check handler
 * 检查文档结构是否符合标准
 */
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.resolve(__dirname, '../../logs/document-structure.jsonl');

module.exports = async function(event, rule, context) {
  const payload = event.payload || {};
  const sections = payload.sections || [];
  const hasTLDR = payload.hasTLDR || false;
  const tldrLength = payload.tldrLength || 0;
  const topLevelCount = payload.topLevelSections || sections.length;

  const issues = [];
  if (topLevelCount > 5) issues.push(`一级目录${topLevelCount}章，超过上限5章`);
  if (!hasTLDR) issues.push('缺少TL;DR');
  if (hasTLDR && tldrLength > 150) issues.push(`TL;DR ${tldrLength}字，超过150字上限`);

  const result = issues.length === 0 ? 'pass' : 'block';
  const details = result === 'pass'
    ? '文档结构检查通过'
    : `文档结构问题：${issues.join('; ')}`;

  const record = {
    timestamp: new Date().toISOString(),
    handler: 'document-structure-check',
    eventType: event.type,
    ruleId: rule.id,
    result, details, issues
  };

  const dir = path.dirname(LOG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(LOG_FILE, JSON.stringify(record) + '\n');

  return { success: result === 'pass', result, details };
};
