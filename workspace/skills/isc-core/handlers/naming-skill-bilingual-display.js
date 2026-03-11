'use strict';
/**
 * ISC Handler: N006
 * 技能名称双语展示标准 - 所有汇报涉及skill英文名时必须同时展示中文名
 * Severity: medium | Trigger: {"events":["isc.rule.matched","isc.category.matched"],"actions":[{"type":"log","level":"info"}],"event":"isc.rule.matched"}
 */

function check(context) {
  const result = { ruleId: 'N006', passed: true, findings: [] };
  
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
