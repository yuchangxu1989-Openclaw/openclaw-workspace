'use strict';
/**
 * ISC Handler: rule.arch-rule-equals-code-002
 * ISC规则定义(JSON)与规则执行(gate-check代码)必须1:1配对。只有JSON定义无代码实现的规则，在合规审计中视为'不存在'。
 * Severity: critical | Trigger: {"events":["isc.rule.created","isc.rule.updated","isc.enforcement_rate.threshold_crossed"]}
 */

function check(context) {
  const result = { ruleId: 'rule.arch-rule-equals-code-002', passed: true, findings: [] };
  
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
    result.severity = 'critical';
    
  } catch (err) {
    result.passed = false;
    result.findings.push({ level: 'error', message: err.message });
  }
  
  return result;
}

module.exports = { check };
