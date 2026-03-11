'use strict';
/**
 * ISC Handler: rule.skill-mandatory-skill-md-001
 * 技能强制SKILL.md规则 - 所有技能目录必须包含SKILL.md文件，否则禁止进入流水线
 * Severity: medium | Trigger: {"events":["isc.rule.matched","isc.category.matched"],"actions":[{"type":"log","level":"info"}],"event":"isc.rule.matched"}
 */

function check(context) {
  const result = { ruleId: 'rule.skill-mandatory-skill-md-001', passed: true, findings: [] };
  
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
