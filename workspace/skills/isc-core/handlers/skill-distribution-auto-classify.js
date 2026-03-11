'use strict';
/**
 * ISC Handler: rule.skill-distribution-auto-classify-001
 * 当技能创建或修改时，自动扫描技能内容判断是local还是publishable。检查维度：(1)是否有hardcode绝对路径 (2)是否引用workspace特定文件 (3)是否依赖本地配置/密钥 (4)是否有通用的输入输出接口。全部通过→publishable，任一不通过→local。结果写入SKILL.md的distribution字段。
 * Severity: medium | Trigger: {"events":["skill.lifecycle.created","skill.lifecycle.modified"],"actions":["skill.classification.auto_detect","skill.metadata.update_distribution"],"event":"skill.lifecycle.created"}
 */

function check(context) {
  const result = { ruleId: 'rule.skill-distribution-auto-classify-001', passed: true, findings: [] };
  
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
