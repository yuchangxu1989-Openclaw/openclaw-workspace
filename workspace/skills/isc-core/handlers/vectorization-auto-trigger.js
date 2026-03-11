'use strict';
/**
 * ISC Handler: rule.vectorization-auto-trigger-001
 * 资源生命周期自动向量化 - 任何资源(skill/memory/knowledge/aeo)的生命周期事件(created/updated/fixed/merged/deleted)统一触发向量化处理。参数化通配规则，替代原17条分散规则。
 * Severity: medium | Trigger: {"events":["isc.rule.matched","isc.category.matched"]}
 */

function check(context) {
  const result = { ruleId: 'rule.vectorization-auto-trigger-001', passed: true, findings: [] };
  
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
