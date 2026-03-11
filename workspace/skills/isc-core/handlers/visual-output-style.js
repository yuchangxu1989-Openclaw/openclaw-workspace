'use strict';
/**
 * ISC Handler: rule.visual-output-style-001
 * 所有工程图（架构图、集成映射图、数据流图等）必须：1.浅色背景（白色或浅灰）2.中文标注（不接受纯英文）3.颜色柔和不刺眼。用户原话：'颜色轻一些，不要纯英文，我不想看纯英文'
 * Severity: medium | Trigger: {"events":["document.diagram.created"],"actions":[{"type":"auto_trigger","description":"可视化输出时自动应用个性化设计风格，拒绝通用AI审美"}],"event":"document.diagram.created"}
 */

function check(context) {
  const result = { ruleId: 'rule.visual-output-style-001', passed: true, findings: [] };
  
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
