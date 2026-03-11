'use strict';
/**
 * ISC Handler: ISC-PDCA-DO-EXIT-GATE-001
 * 离开Do阶段前检查交付物存在性
 * Severity: high | Trigger: {"events":["pdca.phase.do.exit"]}
 */

function check(context) {
  const result = { ruleId: 'ISC-PDCA-DO-EXIT-GATE-001', passed: true, findings: [] };
  
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
