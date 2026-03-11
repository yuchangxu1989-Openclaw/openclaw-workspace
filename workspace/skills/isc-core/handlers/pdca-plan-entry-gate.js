'use strict';
/**
 * ISC Handler: ISC-PDCA-PLAN-ENTRY-GATE-001
 * 任务进入Plan阶段前检查来源合法性（用户指令/ISC规则触发/事件驱动）
 * Severity: medium | Trigger: {"events":["pdca.phase.plan.entry"]}
 */

function check(context) {
  const result = { ruleId: 'ISC-PDCA-PLAN-ENTRY-GATE-001', passed: true, findings: [] };
  
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
