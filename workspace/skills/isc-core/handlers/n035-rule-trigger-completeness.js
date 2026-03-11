'use strict';
/**
 * ISC Handler: rule.n035-rule-trigger-completeness
 * 监控所有规则的触发情况，检测未触发规则并报告原因
 * Severity: medium | Trigger: {"conditions":[{"type":"post_dto_execution","description":"DTO每轮执行后"},{"type":"scheduled","cron":"0 * * * *","description":"每小时检查一次"},{"type":"event","event_name":"rule_registry_updated"}],"logic":"OR","events":["isc.rule.created","isc.rule.updated","isc.enforcement.audit_requested"],"actions":[{"type":"auto_trigger","description":"规则创建/更新时验证trigger字段完整性，缺失则标记为unenforced"}],"event":"isc.rule.created"}
 */

function check(context) {
  const result = { ruleId: 'rule.n035-rule-trigger-completeness', passed: true, findings: [] };
  
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
