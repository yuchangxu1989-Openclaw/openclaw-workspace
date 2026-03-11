'use strict';
/**
 * ISC Handler: rule.feishu-doc-auto-perm-001
 * 每次创建飞书文档/表格后，必须自动调用auto-grant-feishu-perm.sh给长煦加full_access权限
 * Severity: medium | Trigger: {"events":["feishu.doc.created","feishu.bitable.created","feishu.sheet.created"]}
 */

function check(context) {
  const result = { ruleId: 'rule.feishu-doc-auto-perm-001', passed: true, findings: [] };
  
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
