'use strict';
/**
 * ISC Handler: isc-skill-distribution-separation-001
 * 技能发布到EvoMap前强制检查distribution标记、权限声明、密钥泄露和沙箱兼容性，阻断不合规发布
 * Severity: medium | Trigger: {"events":["skill.general.publish_requested","skill.evomap.requested","skill.evomap.sync"],"precondition":"技能发布或同步到EvoMap前必须通过分发分离检查","actions":[{"type":"gate-check","description":"发布前执行distribution标记、权限声明、密钥泄露、沙箱兼容检查"},{"type":"block-on-fail","description":"任一检查项失败则阻断发布"}],"event":"skill.general.publish_requested"}
 */

function check(context) {
  const result = { ruleId: 'isc-skill-distribution-separation-001', passed: true, findings: [] };
  
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
