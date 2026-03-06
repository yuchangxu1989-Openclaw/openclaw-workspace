'use strict';

const fs = require('fs');
const path = require('path');

function appendJsonl(filePath, record) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`, 'utf8');
}

function matchRoute(routes = [], payload = {}) {
  const text = String(payload.text || payload.prompt || payload.content || '');
  const modal = Array.isArray(payload.input_modal) ? payload.input_modal : [payload.input_modal].filter(Boolean);

  for (const route of routes) {
    const triggerHit = (route.trigger || []).some(pattern => new RegExp(pattern).test(text));
    const modalHit = !route.input_modal || route.input_modal.some(m => modal.includes(m));
    if (triggerHit || modalHit) return route;
  }
  return null;
}

module.exports = async function zhipuCapabilityRouter(event, rule, context = {}) {
  const workspace = context.workspace || '/root/.openclaw/workspace';
  const payload = event.payload || {};
  const reportFile = path.join(workspace, 'infrastructure', 'logs', 'zhipu-capability-router.jsonl');
  const route = matchRoute(rule.routes || [], payload);
  const selectedModel = route?.model || null;
  const selectedSkill = route?.skill || null;

  if (selectedModel) payload.model = selectedModel;
  if (selectedSkill) payload.skill = selectedSkill;
  payload.capability_route_rule_id = rule.id;

  const verificationPassed = !route || (payload.model === selectedModel && payload.skill === selectedSkill);
  appendJsonl(reportFile, {
    timestamp: new Date().toISOString(),
    handler: 'zhipu-capability-router',
    ruleId: rule.id,
    eventType: event.type,
    eventId: event.id,
    selectedModel,
    selectedSkill,
    verificationPassed,
  });

  if (verificationPassed && route && context.bus?.emit) {
    await context.bus.emit('capability.zhipu.routed', {
      source_event: event.id,
      model: selectedModel,
      skill: selectedSkill,
      rule_id: rule.id,
    }, 'zhipu-capability-router');
  }

  return {
    ok: verificationPassed,
    autonomous: !!route,
    selectedModel,
    selectedSkill,
  };
};
