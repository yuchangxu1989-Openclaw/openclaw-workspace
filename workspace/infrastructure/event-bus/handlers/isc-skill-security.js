const fs = require('fs');
const path = require('path');

/**
 * ISC技能安全门禁 - 标准handler映射
 * 感知：isc.rule.matched / isc.category.matched
 * 执行：委托给已有的完备实现 isc-skill-security-gate-030.js
 */

// 委托给已有的完备实现
const securityGate = require('./isc-skill-security-gate-030');

module.exports = async function(event, rule, context) {
  const logger = context.logger;

  logger.info('[isc-skill-security] 委托执行安全门禁检查 → isc-skill-security-gate-030');

  try {
    const result = await securityGate(event, rule, context);
    logger.info('[isc-skill-security] 安全门禁检查完成（委托）', result);
    return result;
  } catch (err) {
    logger.error('[isc-skill-security] 安全门禁检查失败（委托）:', err.message);
    throw err;
  }
};
