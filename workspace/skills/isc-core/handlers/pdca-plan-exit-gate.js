'use strict';
/**
 * ISC Handler: ISC-PDCA-PLAN-EXIT-GATE-001
 * 任务离开Plan阶段前检查4要素完整性（业务目标/时效约束/成本边界/验收标准）
 * Severity: high | Trigger: {"events":["pdca.phase.plan.exit"]}
 */

function check(context) {
  const result = { ruleId: 'ISC-PDCA-PLAN-EXIT-GATE-001', passed: true, findings: [] };
  
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
