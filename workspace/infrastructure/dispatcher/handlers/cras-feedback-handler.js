'use strict';

/**
 * CRAS Feedback Handler (IC1) — 情绪/反馈类消息处理
 *
 * Handles user emotional expressions, product feedback, and satisfaction signals.
 * Records to decision log and returns structured feedback analysis.
 *
 * @param {object} event - The event with payload.text
 * @param {object} context - Dispatcher context with intent info
 * @returns {object} { status, handler, result }
 */

const fs = require('fs');
const path = require('path');

let _decisionLogger = null;
try { _decisionLogger = require('../../decision-log/decision-logger'); } catch (_) {}

function logDecision(entry) {
  if (_decisionLogger && typeof _decisionLogger.log === 'function') {
    try {
      _decisionLogger.log({
        phase: 'execution',
        component: 'CRASFeedbackHandler',
        what: entry.what || 'feedback processing',
        why: entry.why || 'IC1 emotion/feedback detected',
        confidence: entry.confidence || 0.8,
        decision_method: 'intent_classification',
        input_summary: JSON.stringify(entry).slice(0, 500),
      });
    } catch (_) {}
  }
}

async function handle(event, context) {
  const text = (event.payload && event.payload.text) || '';
  const intent = context.intent || { category: 'IC1', name: 'feedback' };

  logDecision({
    what: `Processing feedback: ${text.slice(0, 80)}`,
    why: `IC1 emotion/feedback handler invoked`,
    confidence: intent.confidence || 0.8,
  });

  // Classify sentiment
  const positivePatterns = /感谢|喜欢|很好|满意|开心|赞|棒|优秀/i;
  const negativePatterns = /不满|投诉|太差|讨厌|失望|生气|难过|糟糕/i;

  let sentiment = 'neutral';
  if (positivePatterns.test(text)) sentiment = 'positive';
  else if (negativePatterns.test(text)) sentiment = 'negative';

  return {
    status: 'handled',
    handler: 'cras-feedback-handler',
    intent,
    sentiment,
    action: 'feedback_recorded',
    text_preview: text.slice(0, 100),
    timestamp: new Date().toISOString(),
    next_steps: sentiment === 'negative'
      ? ['escalate_to_review', 'generate_empathy_response']
      : ['log_positive_signal', 'update_satisfaction_metrics'],
  };
}

module.exports = handle;
module.exports.handle = handle;
