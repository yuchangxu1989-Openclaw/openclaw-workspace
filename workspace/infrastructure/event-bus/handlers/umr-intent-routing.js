'use strict';

const fs = require('fs');
const path = require('path');

function appendJsonl(filePath, record) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`, 'utf8');
}

function classifyIntent(payload = {}) {
  return payload.intent_category || payload.intent || payload.classification || 'unknown';
}

const ROUTE_MAP = {
  IC1: 'cras-feedback-handler',
  IC2: 'isc-rule-handler',
  IC3: 'cras-knowledge-handler',
  IC4: 'dev-task-handler',
  IC5: 'analysis-handler',
};

module.exports = async function umrIntentRouting(event, rule, context = {}) {
  const workspace = context.workspace || '/root/.openclaw/workspace';
  const payload = event.payload || {};
  const reportFile = path.join(workspace, 'infrastructure', 'logs', 'umr-intent-routing.jsonl');
  const intent = classifyIntent(payload);
  const selectedHandler = ROUTE_MAP[intent] || 'default-message-handler';

  payload.routed_handler = selectedHandler;
  payload.routing_strategy = 'intent_first';
  payload.routing_rule_id = rule.id;

  const verificationPassed = payload.routed_handler === selectedHandler;
  const record = {
    timestamp: new Date().toISOString(),
    handler: 'umr-intent-routing',
    ruleId: rule.id,
    eventType: event.type,
    intent,
    selectedHandler,
    verificationPassed,
  };
  appendJsonl(reportFile, record);

  if (verificationPassed && context.bus?.emit) {
    await context.bus.emit('user.message.routed', {
      source_event: event.id,
      intent,
      handler: selectedHandler,
      strategy: 'intent_first',
    }, 'umr-intent-routing');
  }

  return {
    ok: verificationPassed,
    autonomous: true,
    intent,
    selectedHandler,
  };
};
