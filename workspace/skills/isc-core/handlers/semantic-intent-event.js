'use strict';
/**
 * ISC Handler: rule.semantic-intent-event-001
 * 不可量化但可监听的意图信号也是事件。反复强调→user.intent.repeated_emphasis，不耐烦→user.intent.frustration，根因分析请求→user.intent.root_cause_request。事件源=对话流，提取靠语义分析，CRAS是探针。
 * Severity: high | Trigger: {"events":["intent.detected"],"actions":["event.semantic_intent.triggered"],"event":"intent.detected"}
 */

function check(context) {
  const result = { ruleId: 'rule.semantic-intent-event-001', passed: true, findings: [] };
  
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
