'use strict';
/**
 * ISC Handler: rule.discovery-must-trigger-rule-creation-001
 * 当发现系统设计缺陷、评测方法论问题、架构盲区时，修复问题的同时必须创建对应的ISC规则+事件绑定+DTO执行链，防止同类问题再次发生。修复不带规则=只治标不治本。
 * Severity: medium | Trigger: {"events":["system.issue.discovered","architecture.gap.detected","aeo.methodology.upgraded"],"actions":["isc.rule.auto_create","event.binding.ensure","lto.task.ensure"],"event":"system.issue.discovered"}
 */

function check(context) {
  const result = { ruleId: 'rule.discovery-must-trigger-rule-creation-001', passed: true, findings: [] };
  
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
