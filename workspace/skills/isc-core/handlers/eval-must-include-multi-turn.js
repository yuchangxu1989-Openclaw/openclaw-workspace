'use strict';
/**
 * ISC Handler: rule.eval-must-include-multi-turn-001
 * IC3-IC5意图本质依赖上下文，单轮评测无法验证真实能力。评测集必须同时包含单轮和多轮格式，多轮样本占比不低于40%。任何评测集变更必须自动触发benchmark重跑。
 * Severity: medium | Trigger: {"events":["aeo.evaluation.dataset_created","aeo.evaluation.dataset_modified"],"actions":["aeo.evaluation.multi_turn_check","aeo.benchmark.auto_rerun"],"event":"aeo.evaluation.dataset_created"}
 */

function check(context) {
  const result = { ruleId: 'rule.eval-must-include-multi-turn-001', passed: true, findings: [] };
  
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
