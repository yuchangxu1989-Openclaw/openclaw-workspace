'use strict';

/**
 * ISC命名规范检查：只做校验，不做工作区扫描/自动改名。
 * E2E 关注的是 isc.rule.created / isc.rule.modified 事件中的规则文件命名是否合法。
 */

const VALID_RULE_FILE = /^rule\.[a-z0-9]+(?:-[a-z0-9]+)*-\d{3}\.json$/;
const VALID_RULE_ID = /^rule\.[a-z0-9]+(?:-[a-z0-9]+)*-\d{3}$/;

module.exports = async function(event, rule, context) {
  const payload = event?.payload || {};
  const filename = payload.filename || payload.fileName || payload.path || '';
  const ruleId = payload.ruleId || payload.id || '';

  const violations = [];

  if (filename && !VALID_RULE_FILE.test(filename)) {
    violations.push({ field: 'filename', value: filename, expected: 'rule.<name>-<version>.json' });
  }

  if (ruleId && !VALID_RULE_ID.test(ruleId)) {
    violations.push({ field: 'ruleId', value: ruleId, expected: 'rule.<name>-<version>' });
  }

  const passed = violations.length === 0;

  if (!passed) {
    context?.logger?.info?.(`[naming-convention] blocked invalid ISC rule naming: ${JSON.stringify(violations)}`);
    return {
      success: false,
      result: 'block',
      violations,
      message: 'ISC规则命名不符合规范',
    };
  }

  return {
    success: true,
    result: 'pass',
    violations: [],
    message: 'ISC规则命名符合规范',
  };
};
