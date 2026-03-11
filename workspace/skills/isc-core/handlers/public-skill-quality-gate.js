'use strict';
/**
 * ISC Handler: rule.public-skill-quality-gate-001
 * skills/public/下的技能必须满足销售质量标准才能发布
 * Severity: medium | Trigger: {"events":["skill.public.pre_publish","skill.public.modified","git.commit.skills_public"],"event":"skill.public.pre_publish"}
 */

function check(context) {
  const result = { ruleId: 'rule.public-skill-quality-gate-001', passed: true, findings: [] };
  
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
