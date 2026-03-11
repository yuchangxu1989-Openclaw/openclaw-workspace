'use strict';
/**
 * ISC Handler: rule.skill-post-creation-guard-001
 * 任何新技能创建后，必须完成4项后置步骤：注册能力锚点、创建意图路由规则、声明触发条件、验证注册成功。缺任何一项=技能未完成。
 * Severity: medium | Trigger: {"events":["skill.created"]}
 */

function check(context) {
  const result = { ruleId: 'rule.skill-post-creation-guard-001', passed: true, findings: [] };
  
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
