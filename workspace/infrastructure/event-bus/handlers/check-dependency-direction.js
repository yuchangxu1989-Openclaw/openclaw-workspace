/**
 * check-dependency-direction handler
 * 检查依赖方向：skills不得引用infrastructure
 */
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.resolve(__dirname, '../../logs/dependency-direction.jsonl');

module.exports = async function(event, rule, context) {
  const payload = event.payload || {};
  const references = payload.references || [];
  
  const violations = references.filter(ref => {
    // skills层引用infrastructure层 = 违规
    return ref.from && ref.to &&
      ref.from.startsWith('skills/') && ref.to.startsWith('infrastructure/');
  });

  const result = violations.length === 0 ? 'pass' : 'block';
  const details = result === 'pass'
    ? '依赖方向检查通过，无违规引用'
    : `发现${violations.length}处依赖方向违规：${violations.map(v => `${v.from}→${v.to}`).join(', ')}`;

  const record = {
    timestamp: new Date().toISOString(),
    handler: 'check-dependency-direction',
    eventType: event.type,
    ruleId: rule.id,
    result, details, violations
  };

  const dir = path.dirname(LOG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(LOG_FILE, JSON.stringify(record) + '\n');

  return { success: result === 'pass', result, details };
};
