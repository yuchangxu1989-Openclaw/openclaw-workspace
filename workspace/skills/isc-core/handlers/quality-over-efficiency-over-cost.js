'use strict';
/**
 * ISC Handler: QUALITY-OVER-EFFICIENCY-OVER-COST-001
 * 任何技术选型决策必须遵循质量>效率>成本的优先级。越重要的环节越用最强方案，不允许在关键环节为省成本或求快而降级方案质量。
 * Severity: critical | Trigger: {"events":["architecture.decision.model_selection","architecture.decision.tool_selection","architecture.decision.approach_selection","architecture.decision.verification_method_selection","architecture.decision.delivery_scope_selection","architecture.decision.execution_mode_selection","architecture.decision.task_granularity_selection","architecture.decision.wait_strategy_selection","quality.review.selection_rationality_check"]}
 */

function check(context) {
  const result = { ruleId: 'QUALITY-OVER-EFFICIENCY-OVER-COST-001', passed: true, findings: [] };
  
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
