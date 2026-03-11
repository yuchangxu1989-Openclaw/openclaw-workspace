'use strict';
/**
 * ISC Handler: rule.voice-reply-on-short-response-001
 * 当回复文本长度少于20字时，建议使用语音回复以增强表达效果。
 * Severity: medium | Trigger: {"event":"before_reply","condition":"text.length < 20","events":["isc.rule.voice.reply.on.short.response.001"]}
 */

function check(context) {
  const result = { ruleId: 'rule.voice-reply-on-short-response-001', passed: true, findings: [] };
  
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
