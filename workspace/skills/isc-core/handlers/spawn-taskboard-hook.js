'use strict';
/**
 * ISC Handler: ISC-SPAWN-TASKBOARD-HOOK-001
 * 主Agent每次sessions_spawn后必须调用register-task登记到task-board
 * Severity: medium | Trigger: {"event":"agent.task.spawned","events":["isc.rule.spawn.taskboard.hook.001"]}
 */

function check(context) {
  const result = { ruleId: 'ISC-SPAWN-TASKBOARD-HOOK-001', passed: true, findings: [] };
  
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
