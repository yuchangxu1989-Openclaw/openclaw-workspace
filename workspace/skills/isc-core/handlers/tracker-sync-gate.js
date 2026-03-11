'use strict';
/**
 * ISC Handler: TRACKER-SYNC-GATE-001
 * 任何任务状态变更必须同步到PROJECT-TRACKER.md。TRACKER是唯一真相源，不同步=状态丢失。
 * Severity: medium | Trigger: {"events":["task.status.changed","task.created","task.expanded","subtask.created","sprint.started","sprint.completed"],"actions":[{"type":"auto_trigger","description":"自动同步状态到PROJECT-TRACKER.md"}],"event":"task.status.changed"}
 */

function check(context) {
  const result = { ruleId: 'TRACKER-SYNC-GATE-001', passed: true, findings: [] };
  
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
