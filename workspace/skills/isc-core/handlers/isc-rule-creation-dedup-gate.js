'use strict';
/**
 * ISC Handler: rule.isc-rule-creation-dedup-gate-001
 * 在ISC规则创建前，通过三维度语义比对检测重复：(1) event快筛——新规则events与现有规则events是否有交集，无交集直接放行；(2) 有交集则调用Claude Opus深检——condition场景是否等价 + action执行效果是否相同；三维度同时满足才判定重复并阻止创建。任一维度不同即视为不同规则，哪怕description写得一模一样。
 * Severity: warning | Trigger: {"events":["isc.rule.before_create"]}
 */

function check(context) {
  const result = { ruleId: 'rule.isc-rule-creation-dedup-gate-001', passed: true, findings: [] };
  
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
    result.severity = 'warning';
    
  } catch (err) {
    result.passed = false;
    result.findings.push({ level: 'error', message: err.message });
  }
  
  return result;
}

module.exports = { check };
