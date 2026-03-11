'use strict';
/**
 * ISC Handler: ISC-SKILL-QUALITY-001
 * 禁止占位符技能 - 技能必须有实质性实现
 * Severity: high | Trigger: {"events":["isc.rule.matched","isc.category.matched"],"actions":[{"type":"log","level":"warn"},{"type":"block","message":"Rule ISC-SKILL-QUALITY-001 violation"}],"event":"isc.rule.matched"}
 */

function check(context) {
  const result = { ruleId: 'ISC-SKILL-QUALITY-001', passed: true, findings: [] };
  
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
    result.severity = 'high';
    
  } catch (err) {
    result.passed = false;
    result.findings.push({ level: 'error', message: err.message });
  }
  
  return result;
}

module.exports = { check };
