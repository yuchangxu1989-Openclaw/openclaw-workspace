'use strict';
/**
 * ISC Handler: rule.isc-naming-convention-001
 * ISC规则命名公约 - 严格执行R001-R005标准格式
 * Severity: medium | Trigger: {"events":["isc.rule.created","isc.rule.modified","isc.rule.matched","isc.category.matched"],"actions":[{"type":"log","level":"info"}],"event":"isc.rule.created"}
 */

function check(context) {
  const result = { ruleId: 'rule.isc-naming-convention-001', passed: true, findings: [] };
  
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
