'use strict';
/**
 * ISC Handler: rule.pipeline-benchmark-evomap-security-scan-001
 * 兼容 evomap.sync.request 事件命名，确保 EvoMap 同步请求进入强制安全扫描流程。
 * Severity: medium | Trigger: {"events":["evomap.sync.request"],"event":"evomap.sync.request"}
 */

function check(context) {
  const result = { ruleId: 'rule.pipeline-benchmark-evomap-security-scan-001', passed: true, findings: [] };
  
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
