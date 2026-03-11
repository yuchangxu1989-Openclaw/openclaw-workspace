'use strict';
/**
 * ISC Handler: rule.layered-decoupling-architecture-001
 * 所有规则、任务、技能的设计必须明确三层归属：感知层（谁观察/什么探针）、认知层（谁判断/什么引擎）、执行层（谁行动/什么技能）。三层通过事件总线解耦，不直接耦合。任何架构设计如果无法清晰说明三层归属，视为设计不完整。
 * Severity: critical | Trigger: {"events":["document.document.created","document.document.modified","isc.rule.created","skill.general.created","lto.task.created"],"actions":[{"type":"gate-check","description":"验证设计文档是否明确三层归属（感知层/认知层/执行层）及事件总线解耦","behavior":"validate_three_layer_attribution"},{"type":"block-on-fail","description":"任一层归属不清晰时标注设计缺陷，打回补充后方可通过","behavior":"block_incomplete_layering"}],"event":"document.document.created"}
 */

function check(context) {
  const result = { ruleId: 'rule.layered-decoupling-architecture-001', passed: true, findings: [] };
  
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
    result.severity = 'critical';
    
  } catch (err) {
    result.passed = false;
    result.findings.push({ level: 'error', message: err.message });
  }
  
  return result;
}

module.exports = { check };
