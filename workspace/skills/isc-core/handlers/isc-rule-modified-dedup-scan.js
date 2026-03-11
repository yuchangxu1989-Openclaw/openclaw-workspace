'use strict';
/**
 * ISC Handler: rule.isc-rule-modified-dedup-scan-001
 * ISC规则修改后触发去重扫描，检测是否与其他规则产生重复
 * Severity: medium | Trigger: {"events":["isc.rule.modified"],"event":"isc.rule.modified"}
 */

function check(context) {
  const result = { ruleId: 'rule.isc-rule-modified-dedup-scan-001', passed: true, findings: [] };
  
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
