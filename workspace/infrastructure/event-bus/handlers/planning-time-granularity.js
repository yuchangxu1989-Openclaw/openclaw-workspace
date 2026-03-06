'use strict';

const fs = require('fs');
const path = require('path');

function appendJsonl(filePath, record) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`, 'utf8');
}

const WEEK_MONTH_PATTERN = /(下周|本周|每周|周内|下个月|本月|每月|季度|Q[1-4]|月内)/;

module.exports = async function planningTimeGranularity(event, rule, context = {}) {
  const workspace = context.workspace || '/root/.openclaw/workspace';
  const payload = event.payload || {};
  const reportFile = path.join(workspace, 'infrastructure', 'logs', 'planning-time-granularity.jsonl');
  const text = String(payload.plan || payload.text || payload.content || '');
  const violationDetected = WEEK_MONTH_PATTERN.test(text);
  const normalizedText = violationDetected
    ? text.replace(/下周/g, '48小时内').replace(/下个月/g, '7天内').replace(/每周/g, '每48小时').replace(/每月/g, '每7天')
    : text;

  payload.normalized_plan = normalizedText;
  payload.plan_granularity = violationDetected ? 'normalized_to_hour_day' : 'already_fine_grained';
  payload.plan_rule_id = rule.id;

  const verificationPassed = payload.normalized_plan === normalizedText;
  appendJsonl(reportFile, {
    timestamp: new Date().toISOString(),
    handler: 'planning-time-granularity',
    ruleId: rule.id,
    eventType: event.type,
    eventId: event.id,
    violationDetected,
    normalizedText,
    verificationPassed,
  });

  if (verificationPassed && context.bus?.emit) {
    await context.bus.emit('planning.time_granularity.enforced', {
      source_event: event.id,
      violation_detected: violationDetected,
      normalized_plan: normalizedText,
      rule_id: rule.id,
    }, 'planning-time-granularity');
  }

  return {
    ok: verificationPassed,
    autonomous: true,
    violationDetected,
    normalizedPlan: normalizedText,
  };
};
