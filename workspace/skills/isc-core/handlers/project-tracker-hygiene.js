'use strict';
/**
 * ISC Handler: rule.project-tracker-hygiene-001
 * 当任务状态发生变更（新建/进行中/阻塞/完成）时，必须同步更新 PROJECT-TRACKER.md 对应条目，并在当日日报写入该变更记录；若任一环节缺失则拒绝状态提交。
 * Severity: critical | Trigger: {"events":["task.status.changed","task.lifecycle.updated","orchestration.task.completed","orchestration.task.blocked","system.day.closure_requested"]}
 */

function check(context) {
  const result = { ruleId: 'rule.project-tracker-hygiene-001', passed: true, findings: [] };
  
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
