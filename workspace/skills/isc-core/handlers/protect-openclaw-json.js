'use strict';
/**
 * ISC Handler: protect-openclaw-json-001
 * openclaw.json是系统核心配置，只有主Agent或用户可以修改。子Agent的sed/replace操作必须排除此文件。
 * Severity: medium | Trigger: manual
 */

function check(context) {
  const result = { ruleId: 'protect-openclaw-json-001', passed: true, findings: [] };
  
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
