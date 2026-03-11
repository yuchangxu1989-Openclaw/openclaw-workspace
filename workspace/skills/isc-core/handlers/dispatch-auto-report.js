'use strict';
/**
 * ISC Handler: dispatch-auto-report-001
 * 每次批量spawn子Agent(>=2个)后，必须立即调用multi-agent-reporting技能输出标准格式队列状态给用户
 * Severity: medium | Trigger: {"event":"dispatch.batch.completed","condition":"spawned_count >= 2","events":["isc.rule.dispatch.auto.report.001"]}
 */

function check(context) {
  const result = { ruleId: 'dispatch-auto-report-001', passed: true, findings: [] };
  
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
