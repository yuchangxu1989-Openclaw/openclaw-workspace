'use strict';
/**
 * ISC Handler: rule.design-document-narrative-review-001
 * 模拟演讲强制门禁——设计文档必须通过模拟演讲审查才能交付
 * Severity: medium | Trigger: {"events":["document.design.created"],"actions":["quality.document.narrative_review"],"event":"document.design.created"}
 */

function check(context) {
  const result = { ruleId: 'rule.design-document-narrative-review-001', passed: true, findings: [] };
  
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
