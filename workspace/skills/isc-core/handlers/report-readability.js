'use strict';
/**
 * ISC Handler: rule.report-readability-001
 * 重要报告可读性钢印——默认按更适合中文阅读的方式写作，强调思路、结构、主次与简洁表达
 * Severity: medium | Trigger: {"events":["report.created","report.modified","document.report.created","document.report.modified"],"actions":["quality.report.readability_check"],"event":"report.created"}
 */

function check(context) {
  const result = { ruleId: 'rule.report-readability-001', passed: true, findings: [] };
  
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
