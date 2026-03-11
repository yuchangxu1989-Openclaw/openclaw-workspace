'use strict';
/**
 * ISC Handler: rule.knowledge-must-be-executable-001
 * 任何从对话、教学、错误中学到的知识，必须自主固化为可执行的规则/技能/代码（不是告警等人处理）。全链路自主闭环：感知（扫描MEMORY.md发现可执行知识）→ 认知（判断应该成为技能还是规则还是代码）→ 执行（自动创建技能/规则/handler）→ 验证（确认可执行性）。Memory是索引不是终点。
 * Severity: medium | Trigger: {"events":["knowledge.general.created","user.teaching.received","system.error","system.error.lesson_extracted"],"actions":["knowledge.executable.create_rule","knowledge.executable.create_skill","knowledge.executable.update_code"],"event":"knowledge.general.created"}
 */

function check(context) {
  const result = { ruleId: 'rule.knowledge-must-be-executable-001', passed: true, findings: [] };
  
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
