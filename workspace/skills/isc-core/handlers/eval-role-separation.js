'use strict';
/**
 * ISC Handler: ISC-EVAL-ROLE-SEPARATION-001
 * 评测用例必须由独立的质量分析Agent评测，执行Agent不能自评
 * Severity: medium | Trigger: {"event":"eval.case.execution.completed","events":["isc.rule.eval.role.separation.001"]}
 */

function check(context) {
  const result = { ruleId: 'ISC-EVAL-ROLE-SEPARATION-001', passed: true, findings: [] };
  
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
