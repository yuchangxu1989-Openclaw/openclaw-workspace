'use strict';

/**
 * ISC Rule Handler (IC2) — 规则/治理类消息处理
 *
 * Handles rule queries, governance operations, and ISC-related tasks.
 * Records to decision log and returns structured governance result.
 *
 * @param {object} event - The event with payload.text
 * @param {object} context - Dispatcher context with intent info
 * @returns {object} { status, handler, result }
 */

let _decisionLogger = null;
try { _decisionLogger = require('../../decision-log/decision-logger'); } catch (_) {}

function logDecision(entry) {
  if (_decisionLogger && typeof _decisionLogger.log === 'function') {
    try {
      _decisionLogger.log({
        phase: 'execution',
        component: 'ISCRuleHandler',
        what: entry.what || 'rule/governance processing',
        why: entry.why || 'IC2 rule/governance detected',
        confidence: entry.confidence || 0.8,
        decision_method: 'intent_classification',
        input_summary: JSON.stringify(entry).slice(0, 500),
      });
    } catch (_) {}
  }
}

async function handle(event, context) {
  const text = (event.payload && event.payload.text) || '';
  const intent = context.intent || { category: 'IC2', name: 'rule_governance' };

  logDecision({
    what: `Processing rule/governance request: ${text.slice(0, 80)}`,
    why: `IC2 rule handler invoked`,
    confidence: intent.confidence || 0.8,
  });

  // Determine sub-action
  let subAction = 'rule_query';
  if (/创建|新增|添加/i.test(text)) subAction = 'rule_create';
  if (/修改|更新|编辑/i.test(text)) subAction = 'rule_update';
  if (/删除|移除|禁用/i.test(text)) subAction = 'rule_delete';
  if (/查询|列表|查看|搜索/i.test(text)) subAction = 'rule_query';

  return {
    status: 'handled',
    handler: 'isc-rule-handler',
    intent,
    sub_action: subAction,
    action: 'governance_processed',
    text_preview: text.slice(0, 100),
    timestamp: new Date().toISOString(),
    next_steps: ['validate_rule_scope', 'check_enforcement_tier', 'apply_governance_action'],
  };
}

module.exports = handle;
module.exports.handle = handle;
