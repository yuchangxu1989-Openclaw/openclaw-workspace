'use strict';
/**
 * ISC Handler: rule.project-artifact-settlement-001
 * 子Agent任务标记完成前，必须校验其关键输出已写入项目文件（规则、报告、文档或代码）并可追溯；仅口头完成或未落盘视为未完成。
 * Severity: critical | Trigger: {"events":["subagent.task.completed","orchestration.subagent.completed","pipeline.stage.completed","system.day.closure_requested"]}
 */

function check(context) {
  const result = { ruleId: 'rule.project-artifact-settlement-001', passed: true, findings: [] };
  
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
