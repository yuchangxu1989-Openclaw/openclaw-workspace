'use strict';
/**
 * ISC Handler: PROJECT-ARTIFACT-GATE-001
 * 任何任务标记完成前，必须验证可交付产物已沉淀。无产物=未完成，禁止空标completed。
 * Severity: medium | Trigger: {"events":["task.status.completed","task.status.done","subtask.status.completed","sprint.day.completed"],"actions":[{"type":"gate","description":"阻止无产物的完成标记"}],"event":"task.status.completed"}
 */

function check(context) {
  const result = { ruleId: 'PROJECT-ARTIFACT-GATE-001', passed: true, findings: [] };
  
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
