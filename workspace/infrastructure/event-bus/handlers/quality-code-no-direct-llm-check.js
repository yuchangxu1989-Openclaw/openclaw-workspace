const fs = require('fs');
const path = require('path');

module.exports = async function handler(event, rule, context) {
  const { type, payload } = event;
  const filePath = payload?.filePath || payload?.path || '';
  const ts = new Date().toISOString();

  console.log(`[quality.code.no_direct_llm_check] ${ts} file=${filePath}`);

  // 检查代码是否直接调用LLM API（应通过抽象层）
  const violation = payload?.violation || false;
  const details = payload?.details || '';

  const record = { timestamp: ts, action: type, filePath, violation, details, source: payload?.source || 'quality_check' };
  const logPath = path.resolve(__dirname, '../data/events.jsonl');
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, JSON.stringify(record) + '\n');
  } catch (_) {}

  return { status: 'ok', violation, filePath };
};
