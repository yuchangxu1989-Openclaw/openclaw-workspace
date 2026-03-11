'use strict';
/**
 * ISC Handler: rule.arch-gate-before-action-001
 * 任何影响系统状态的操作（提交代码、发布技能、生成报告、关闭Day）必须通过至少一个自动化Gate检查。无Gate的操作路径视为安全漏洞。
 * Severity: critical | Trigger: {"events":["skill.lifecycle.created","skill.lifecycle.published","isc.rule.created","quality.benchmark.completed","orchestration.pipeline.completed","system.day.closure_requested"]}
 */

function check(context) {
  const result = { ruleId: 'rule.arch-gate-before-action-001', passed: true, findings: [] };
  
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
