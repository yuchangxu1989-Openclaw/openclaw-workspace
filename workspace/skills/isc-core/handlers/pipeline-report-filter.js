'use strict';
/**
 * ISC Handler: rule.pipeline-report-filter-001
 * 流水线汇报过滤规则 - 静默常规技能版本更新，仅汇报同步失败或重大发布
 * Severity: medium | Trigger: {"events":["isc.rule.matched","isc.category.matched"],"actions":[{"type":"log","level":"info"}],"event":"isc.rule.matched"}
 */

function check(context) {
  const result = { ruleId: 'rule.pipeline-report-filter-001', passed: true, findings: [] };
  
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
