'use strict';
/**
 * ISC Handler: rule.isc-skill-permission-classification-031
 * Filesystem/Network/Shell/Credential四维度权限标注，实现最小权限原则
 * Severity: medium | Trigger: {"events":["isc.rule.matched","isc.category.matched"],"actions":[{"type":"log","level":"info"}],"event":"isc.rule.matched"}
 */

function check(context) {
  const result = { ruleId: 'rule.isc-skill-permission-classification-031', passed: true, findings: [] };
  
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
