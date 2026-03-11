'use strict';
/**
 * ISC Handler: rule.umr-intent-routing-001
 * 基于IntentScanner意图分类(IC1-IC5)将user.message路由到对应处理器
 * Severity: medium | Trigger: {"events":["user.general.message"],"condition":"intent_classification_available","actions":[{"type":"route","description":"基于意图分类路由到对应处理器"}]}
 */

function check(context) {
  const result = { ruleId: 'rule.umr-intent-routing-001', passed: true, findings: [] };
  
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
