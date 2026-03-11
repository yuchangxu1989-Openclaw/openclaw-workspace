'use strict';
/**
 * ISC Handler: rule.isc-skill-index-auto-update-001
 * 技能索引自动更新 - 技能创建/修改/删除时自动更新CAPABILITY-ANCHOR.md
 * Severity: medium | Trigger: {"events":["skill.general.created","skill.general.updated","skill.general.deleted","isc.skill_index.refresh_requested"],"condition":"skill_path OR skill_name OR skill_id","actions":[{"type":"auto_trigger","description":"技能变更时自动更新ISC技能索引，保持索引与实际技能一致"}]}
 */

function check(context) {
  const result = { ruleId: 'rule.isc-skill-index-auto-update-001', passed: true, findings: [] };
  
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
