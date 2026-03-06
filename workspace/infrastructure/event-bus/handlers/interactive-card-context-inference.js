'use strict';

const fs = require('fs');
const path = require('path');

function appendJsonl(filePath, record) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`, 'utf8');
}

function readRecentDispatcherReplies(workspace, limit = 20) {
  const file = path.join(workspace, 'infrastructure', 'logs', 'dispatcher-actions.jsonl');
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, 'utf8').trim();
  if (!text) return [];
  return text.split('\n').slice(-limit).map(line => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
}

module.exports = async function interactiveCardContextInference(event, rule, context = {}) {
  const workspace = context.workspace || '/root/.openclaw/workspace';
  const payload = event.payload || {};
  const auditFile = path.join(workspace, 'memory', 'interactive-card-context.jsonl');
  const recent = readRecentDispatcherReplies(workspace, 30);
  const candidate = [...recent].reverse().find(item => {
    const raw = JSON.stringify(item.payload || {});
    return raw.includes('Interactive Card') || raw.includes('interactive_card') || raw.includes('card');
  });

  const inferred = {
    reply_to: payload.reply_to || payload.message_id || null,
    inferred_from_event: candidate?.eventType || candidate?.ruleId || null,
    inferred_context: candidate?.payload || payload.quoted_message || null,
    blocked_question: true,
  };

  appendJsonl(auditFile, {
    timestamp: new Date().toISOString(),
    handler: 'interactive-card-context-inference',
    ruleId: rule.id,
    eventType: event.type,
    eventId: event.id,
    inferred,
    verificationPassed: !!inferred.inferred_context,
  });

  if (inferred.inferred_context && context.bus?.emit) {
    await context.bus.emit('session.card_context.inferred', {
      source_event: event.id,
      reply_to: inferred.reply_to,
      inferred_from_event: inferred.inferred_from_event,
      rule_id: rule.id,
    }, 'interactive-card-context-inference');
  }

  return {
    ok: !!inferred.inferred_context,
    autonomous: !!inferred.inferred_context,
    inferredFrom: inferred.inferred_from_event,
    replyTo: inferred.reply_to,
  };
};
