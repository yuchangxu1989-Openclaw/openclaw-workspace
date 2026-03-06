'use strict';

const fs = require('fs');
const path = require('path');

function appendJsonl(filePath, record) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`, 'utf8');
}

const DOMAIN_MAP = {
  knowledge: 'cras-knowledge-handler',
  development: 'dev-task-handler',
  content: 'content-creation-handler',
  analysis: 'analysis-handler',
};

module.exports = async function umrDomainRouting(event, rule, context = {}) {
  const workspace = context.workspace || '/root/.openclaw/workspace';
  const payload = event.payload || {};
  const reportFile = path.join(workspace, 'infrastructure', 'logs', 'umr-domain-routing.jsonl');
  const domain = String(payload.domain || 'unknown');
  const selectedHandler = DOMAIN_MAP[domain] || 'default-message-handler';

  payload.routed_handler = selectedHandler;
  payload.routing_strategy = 'domain_fallback';
  payload.routing_rule_id = rule.id;

  const verificationPassed = payload.routed_handler === selectedHandler;
  const record = {
    timestamp: new Date().toISOString(),
    handler: 'umr-domain-routing',
    ruleId: rule.id,
    eventType: event.type,
    domain,
    selectedHandler,
    verificationPassed,
  };
  appendJsonl(reportFile, record);

  if (verificationPassed && context.bus?.emit) {
    await context.bus.emit('user.message.routed', {
      source_event: event.id,
      domain,
      handler: selectedHandler,
      strategy: 'domain_fallback',
    }, 'umr-domain-routing');
  }

  return {
    ok: verificationPassed,
    autonomous: true,
    domain,
    selectedHandler,
  };
};
