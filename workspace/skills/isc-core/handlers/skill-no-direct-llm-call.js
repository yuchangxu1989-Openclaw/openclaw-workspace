'use strict';
/**
 * ISC Handler: rule.skill-no-direct-llm-call-001
 * 技能代码中禁止直接发HTTP请求调用LLM API（OpenAI/Anthropic/智谱等）。技能使用LLM能力的正确方式：(1)默认用当前Agent的模型直接执行 (2)需要多次独立LLM调用时通过sessions_spawn派子Agent。模型选择是运行时配置层的职责，不是技能的职责。除非用户显式指定某技能绑定某模型。
 * Severity: medium | Trigger: {"events":["skill.lifecycle.created","skill.lifecycle.modified"],"actions":["quality.code.no_direct_llm_check"],"event":"skill.lifecycle.created"}
 */

function check(context) {
  const result = { ruleId: 'rule.skill-no-direct-llm-call-001', passed: true, findings: [] };
  
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
