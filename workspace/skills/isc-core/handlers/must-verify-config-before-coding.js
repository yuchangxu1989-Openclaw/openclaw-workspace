'use strict';
/**
 * ISC Handler: rule.must-verify-config-before-coding-001
 * 在代码中引用任何外部服务（API地址、模型名、Key）时，必须先读取实际配置文件确认，不允许凭记忆或推测填写。违反此规则=数据不诚实。
 * Severity: medium | Trigger: {"events":["code.module.created","code.module.modified"],"actions":["quality.code.config_reference_check"],"event":"code.module.created"}
 */

function check(context) {
  const result = { ruleId: 'rule.must-verify-config-before-coding-001', passed: true, findings: [] };
  
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
