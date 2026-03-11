'use strict';
/**
 * ISC Handler: USER-MESSAGE-INTENT-PROBE-001
 * 主Agent必须对每条用户消息执行意图探针(intent-probe v2)，基于LLM分类器识别纠偏/否定/反复未果/自主性缺失/教学/根因追问/交付质量/认知错误等信号。纠偏类信号必须自动触发badcase harvest入库。
 * Severity: P0 | Trigger: {"event":"user_message_received","condition":"每条用户消息到达时","events":["isc.rule.user.message.intent.probe.001"]}
 */

function check(context) {
  const result = { ruleId: 'USER-MESSAGE-INTENT-PROBE-001', passed: true, findings: [] };
  
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
    result.severity = 'P0';
    
  } catch (err) {
    result.passed = false;
    result.findings.push({ level: 'error', message: err.message });
  }
  
  return result;
}

module.exports = { check };
