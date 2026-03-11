'use strict';
/**
 * ISC Handler: ISC-MAIN-AGENT-DELEGATION-001
 * 主Agent禁止亲自做实现工作，必须委派子Agent。认知规则已被用户纠偏5次以上仍反复违反，升级为程序化守卫。
 * Severity: critical | Trigger: {"events":["tool_call.edit","tool_call.write","tool_call.exec","tool_call.feishu_doc"],"conditions":{"agent_role":"main","any_of":[{"tool":"edit","file_pattern":"\\.(js|py|json|sh|ts|jsx|tsx|css|html)$","exclude_pattern":"(MEMORY\\.md|memory/|AGENTS\\.md|SOUL\\.md|TOOLS\\.md|USER\\.md|HEARTBEAT\\.md)"},{"tool":"write","file_pattern":"\\.(js|py|json|sh|ts|jsx|tsx|css|html)$","exclude_pattern":"(MEMORY\\.md|memory/|AGENTS\\.md|SOUL\\.md|TOOLS\\.md|USER\\.md|HEARTBEAT\\.md)"},{"tool":"exec","script_lines_gt":3},{"tool":"feishu_doc","action_in":["write","append"]}]}}
 */

function check(context) {
  const result = { ruleId: 'ISC-MAIN-AGENT-DELEGATION-001', passed: true, findings: [] };
  
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
