'use strict';
/**
 * ISC Handler: rule.public-skill-classification-001
 * 新建或修改技能时，自动判断是否为通用可销售技能，符合条件的必须放入skills/public/
 * Severity: medium | Trigger: {"events":["skill.created","skill.modified","skill.skill_md.updated"],"event":"skill.created"}
 */

function check(context) {
  const result = { ruleId: 'rule.public-skill-classification-001', passed: true, findings: [] };
  
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
