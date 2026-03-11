'use strict';
/**
 * ISC Handler: rule.umr-domain-routing-001
 * 基于消息payload的domain字段路由user.message，作为意图路由的降级兜底
 * Severity: medium | Trigger: {"events":["user.general.message"],"condition":"intent_classification_unavailable OR intent_confidence_low","actions":[{"type":"route","description":"基于domain字段兜底路由到对应模块"}]}
 */

function check(context) {
  const result = { ruleId: 'rule.umr-domain-routing-001', passed: true, findings: [] };
  
  try {
    // Validate context exists
    if (!context || typeof context !== 'object') {
      result.passed = false;
      result.findings.push({ level: 'error', message: 'Invalid context provided' });
      return result;
    }

    const event = context.event || {};
    const payload = context.payload || event.payload || {};
    
    // Rule-specific check placeholder - returns pass by default
    // Real enforcement logic should be added based on rule semantics
    result.checked = true;
    result.timestamp = new Date().toISOString();
    result.severity = 'medium';
    
  } catch (err) {
    result.passed = false;
    result.findings.push({ level: 'error', message: err.message });
  }
  
  return result;
}

module.exports = { check };
