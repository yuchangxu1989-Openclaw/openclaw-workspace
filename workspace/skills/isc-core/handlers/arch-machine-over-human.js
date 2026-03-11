'use strict';
/**
 * ISC Handler: rule.arch-machine-over-human-004
 * 所有'应该做'的事项必须自动化为'必须做'。依赖人记忆和纪律的约束，在概率上等于没有约束。
 * Severity: high | Trigger: {"events":["quality.automation.gap_found"]}
 */

function check(context) {
  const result = { ruleId: 'rule.arch-machine-over-human-004', passed: true, findings: [] };
  
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
