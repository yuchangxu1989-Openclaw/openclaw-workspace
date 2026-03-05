/**
 * check-version-integrity handler
 * 检查技能版本号是否与代码成熟度匹配
 */
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.resolve(__dirname, '../../logs/version-integrity.jsonl');

module.exports = async function(event, rule, context) {
  const payload = event.payload || {};
  const version = payload.version || '0.1.0';
  const codeLines = payload.codeLines || 0;
  const hasTests = payload.hasTests || false;
  const hasErrorHandling = payload.hasErrorHandling || false;

  const major = parseInt(version.replace(/^v?/, '').split('.')[0], 10) || 0;

  let result = 'pass';
  let details = '';

  // v2+ needs >200 lines + error handling
  if (major >= 2 && (codeLines < 200 || !hasErrorHandling)) {
    result = 'block';
    details = `版本${version}要求>=200行代码+错误处理，实际${codeLines}行, errorHandling=${hasErrorHandling}`;
  }
  // v3+ needs tests
  if (major >= 3 && !hasTests) {
    result = 'block';
    details = `版本${version}要求测试覆盖，实际无测试`;
  }
  // v5+ with <100 lines is clearly inflated
  if (major >= 5 && codeLines < 100) {
    result = 'block';
    details = `版本${version}虚标：仅${codeLines}行代码`;
  }
  // Version jump check
  if (payload.previousVersion) {
    const prevMajor = parseInt(payload.previousVersion.replace(/^v?/, '').split('.')[0], 10) || 0;
    if (major - prevMajor > 1) {
      result = 'block';
      details = `版本跳级：从${payload.previousVersion}到${version}，不允许major跳级>1`;
    }
  }

  if (result === 'pass') {
    details = `版本${version}与代码成熟度匹配（${codeLines}行）`;
  }

  const record = {
    timestamp: new Date().toISOString(),
    handler: 'check-version-integrity',
    eventType: event.type,
    ruleId: rule.id,
    version, codeLines, result, details
  };

  const dir = path.dirname(LOG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(LOG_FILE, JSON.stringify(record) + '\n');

  return { success: result === 'pass', result, details };
};
