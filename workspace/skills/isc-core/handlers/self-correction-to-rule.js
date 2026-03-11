'use strict';
/**
 * ISC Handler: rule.self-correction-to-rule-001
 * 检测到行为缺陷/纠偏信号时，必须：1)追究根因（规则缺失？handler缺失？逻辑错误？认知偏差？架构缺陷？）2)基于根因找解决方案（不是基于表象找补丁）3)根据根因类型选择修复路径并执行。根因决定方案，方案决定行动。
 * Severity: high | Trigger: {"events":["system.behavior.defect_acknowledged"],"detection":{"type":"semantic_intent","intent_pattern":"Agent承认了一个行为缺陷、认知盲区、或流程遗漏，并表达了纠偏/改进意图","examples":["以后我会XXX","这是我的问题，不该XXX","抱歉，我漏了XXX","这不该等你说","我应该自动XXX的，但我没做","对，不需要你提醒"],"note":"以上仅为示例，不是穷举。由LLM语义理解判断是否属于此意图模式。"},"actions":[{"type":"auto_trigger","description":"检测到Agent承认行为缺陷并表达纠偏意图时，自动将纠偏固化为ISC规则或技能更新","behavior":"auto_codify_correction"},{"type":"gate-check","description":"纠偏规则必须泛化——解决一类问题而非单个case，不通过则要求重写","behavior":"require_generalized_rule"}],"event":"system.behavior.defect_acknowledged"}
 */

function check(context) {
  const result = { ruleId: 'rule.self-correction-to-rule-001', passed: true, findings: [] };
  
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
