'use strict';
/**
 * ISC Handler: AUTO-BADCASE-HARVEST-ENGINE-001
 * 纠偏类、反复未果类、头痛医头类等场景自动采集为badcase，不依赖主Agent手动记忆
 * Severity: medium | Trigger: {"events":["isc.rule.auto.badcase.harvest.engine.001"]}
 */

function check(context) {
  const result = { ruleId: 'AUTO-BADCASE-HARVEST-ENGINE-001', passed: true, findings: [] };
  
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
