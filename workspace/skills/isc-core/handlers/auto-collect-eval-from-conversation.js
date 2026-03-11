'use strict';
/**
 * ISC Handler: rule.auto-collect-eval-from-conversation-001
 * 每次会话中用户的复杂发言（IC3-IC5、>=40字、含教学/纠偏/多意图）自动收录为评测样本。必须用原话原样不缩写不改写，必须带完整上下文。
 * Severity: high | Trigger: {"events":["session.message.received"],"actions":["aeo.eval.triggered"],"event":"session.message.received"}
 */

function check(context) {
  const result = { ruleId: 'rule.auto-collect-eval-from-conversation-001', passed: true, findings: [] };
  
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
