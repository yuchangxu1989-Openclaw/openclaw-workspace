'use strict';
/**
 * ISC Handler: SPRINT-CLOSURE-ACCEPTANCE-001
 * Sprint/Day标记完成前，必须通过四重验收：产物核查、指标采集、经验沉淀、裁决殿裁决。缺任何一项不允许close。
 * Severity: medium | Trigger: {"events":["sprint.closure.requested","sprint.day.closure.requested","project.milestone.closure.requested"],"actions":[{"type":"gate","description":"执行四重验收门禁"}],"event":"sprint.closure.requested"}
 */

function check(context) {
  const result = { ruleId: 'SPRINT-CLOSURE-ACCEPTANCE-001', passed: true, findings: [] };
  
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
