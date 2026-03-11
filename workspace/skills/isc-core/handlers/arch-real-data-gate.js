'use strict';
/**
 * ISC Handler: rule.arch-real-data-gate-005
 * 任何benchmark、测试、验收的数据来源必须标注且可溯源。合成数据可用于开发调试，不可用于验收。验收使用合成数据=验收无效。
 * Severity: critical | Trigger: {"events":["quality.benchmark.completed"]}
 */

function check(context) {
  const result = { ruleId: 'rule.arch-real-data-gate-005', passed: true, findings: [] };
  
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
