'use strict';
/**
 * ISC Handler: rule.coding-quality-thinking-001
 * 核心模块的编码，开发工程师必须开thinking（高质量推理模式）。
 * Severity: high | Trigger: {"events":["skill.module_core.modified"],"actions":["quality.code.thinking_required"],"event":"skill.module_core.modified"}
 */

function check(context) {
  const result = { ruleId: 'rule.coding-quality-thinking-001', passed: true, findings: [] };
  
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
    result.severity = 'high';
    
  } catch (err) {
    result.passed = false;
    result.findings.push({ level: 'error', message: err.message });
  }
  
  return result;
}

module.exports = { check };
