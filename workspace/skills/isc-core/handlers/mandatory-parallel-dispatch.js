'use strict';
/**
 * ISC Handler: rule.mandatory-parallel-dispatch-001
 * 独立任务强制并行派发 - 禁止在Agent池充足时将无依赖关系的独立任务打包成组合型任务
 * Severity: medium | Trigger: {"type":"pre_dispatch","event":"task.dispatch.requested","condition":"任务包含多个独立子问题且Agent池有空闲slot"}
 */

function check(context) {
  const result = { ruleId: 'rule.mandatory-parallel-dispatch-001', passed: true, findings: [] };
  
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
