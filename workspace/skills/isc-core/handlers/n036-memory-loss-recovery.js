'use strict';
/**
 * ISC Handler: rule.n036-memory-loss-recovery
 * 当MemOS不可用或注册表丢失时，从文件系统自动重建规则清单和系统状态
 * Severity: medium | Trigger: {"conditions":[{"type":"memos_unavailable","description":"MemOS不可用或无活跃记忆"},{"type":"registry_empty","file_path":"/root/.openclaw/workspace/.rule-registry.json","check":"!exists || rule_count == 0","description":"规则注册表为空"},{"type":"manual","command":"isc bootstrap-recovery","description":"手动触发恢复"}],"logic":"OR","events":["session.general.started","system.memory.loss_detected","session.context.incomplete"],"actions":[{"type":"auto_trigger","description":"检测到记忆丢失时自动触发恢复流程，从文件系统重建关键上下文"}],"event":"session.general.started"}
 */

function check(context) {
  const result = { ruleId: 'rule.n036-memory-loss-recovery', passed: true, findings: [] };
  
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
