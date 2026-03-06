'use strict';

const fs = require('fs');
const path = require('path');

function appendJsonl(filePath, record) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`, 'utf8');
}

function extractModelHint(payload = {}) {
  return payload.model || payload.preferred_model || payload.analysis_model || null;
}

module.exports = async function glmVisionPriority(event, rule, context = {}) {
  const workspace = context.workspace || '/root/.openclaw/workspace';
  const payload = event.payload || {};
  const reportFile = path.join(workspace, 'infrastructure', 'logs', 'glm-vision-routing.jsonl');
  const before = extractModelHint(payload);
  const selected = rule?.action?.target || 'zhipu/glm-4v-plus';

  payload.model = selected;
  payload.preferred_model = selected;
  payload.model_routed_by = rule.id;

  const verificationPassed = payload.model === selected && payload.preferred_model === selected;
  const record = {
    timestamp: new Date().toISOString(),
    handler: 'glm-vision-priority',
    ruleId: rule.id,
    eventType: event.type,
    beforeModel: before,
    afterModel: payload.model,
    verificationPassed,
  };
  appendJsonl(reportFile, record);

  if (verificationPassed && context.bus?.emit) {
    await context.bus.emit('capability.model.routed', {
      source_event: event.id,
      selected_model: selected,
      previous_model: before,
      rule_id: rule.id,
    }, 'glm-vision-priority');
  }

  return {
    ok: verificationPassed,
    autonomous: true,
    selectedModel: selected,
    previousModel: before,
  };
};
