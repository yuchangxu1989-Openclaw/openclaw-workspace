'use strict';
/**
 * ISC Handler: rule.intent-dispatchengine-api-usage-gvhcmy
 * 用户要求记住DispatchEngine的正确生命周期方法，排除不存在的markFinished
 * Severity: medium | Trigger: {"events":["intent.ruleify"],"conditions":[{"field":"target","op":"contains","value":"DispatchEngine API usage"}],"actions":[{"type":"auto_trigger","description":"Auto-created from intent.ruleify: DispatchEngine API usage"}],"event":"intent.ruleify"}
 */

function check(context) {
  const result = { ruleId: 'rule.intent-dispatchengine-api-usage-gvhcmy', passed: true, findings: [] };
  
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
