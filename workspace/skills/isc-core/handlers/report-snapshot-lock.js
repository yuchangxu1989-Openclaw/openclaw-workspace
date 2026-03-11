'use strict';
/**
 * ISC Handler: rule.report-snapshot-lock-001
 * 评测完成后锁定报告快照，防止数据被篡改
 * Severity: medium | Trigger: {"events":["evaluation.benchmark.completed"],"event":"evaluation.benchmark.completed"}
 */

function check(context) {
  const result = { ruleId: 'rule.report-snapshot-lock-001', passed: true, findings: [] };
  
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
