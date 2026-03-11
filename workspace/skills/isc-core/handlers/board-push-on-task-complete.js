'use strict';
/**
 * ISC Handler: rule.board-push-on-task-complete-001
 * 当子Agent任务完成/超时/失败时，自动触发飞书看板推送，确保用户实时看到最新状态
 * Severity: medium | Trigger: {"events":["task.status.completed","task.status.done","task.status.timeout","task.status.failed","subagent.session.completed"],"event":"task.status.completed"}
 */

function check(context) {
  const result = { ruleId: 'rule.board-push-on-task-complete-001', passed: true, findings: [] };
  
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
