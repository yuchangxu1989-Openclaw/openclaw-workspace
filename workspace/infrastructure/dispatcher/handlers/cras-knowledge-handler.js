'use strict';

/**
 * CRAS Knowledge Handler (IC3) — 知识/学术类消息处理
 *
 * Handles knowledge queries, academic research, information retrieval,
 * competitive analysis, engineering defect patterns, and user insight.
 * Records to decision log and returns structured knowledge result.
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
        component: 'CRASKnowledgeHandler',
        what: entry.what || 'knowledge processing',
        why: entry.why || 'IC3 knowledge/academic detected',
        confidence: entry.confidence || 0.8,
        decision_method: 'intent_classification',
        input_summary: JSON.stringify(entry).slice(0, 500),
      });
    } catch (_) {}
  }
}

async function handle(event, context) {
  const text = (event.payload && event.payload.text) || '';
  const intent = context.intent || { category: 'IC3', name: 'knowledge' };

  logDecision({
    what: `Processing knowledge request: ${text.slice(0, 80)}`,
    why: `IC3 knowledge handler invoked — ${intent.name || 'general'}`,
    confidence: intent.confidence || 0.8,
  });

  // Classify knowledge sub-domain
  let subDomain = 'general_knowledge';
  if (/论文|学术|方法论|研究|文献/i.test(text)) subDomain = 'academic_analysis';
  if (/竞品|对比.*竞|竞.*对比|竞争.*分析/i.test(text)) subDomain = 'competitive_analysis';
  if (/缺陷|bug|代码质量|模式.*识别/i.test(text)) subDomain = 'engineering_defect_analysis';
  if (/效率|问题.*分析|出了问题|哪里.*问题/i.test(text)) subDomain = 'user_intent_insight';

  return {
    status: 'handled',
    handler: 'cras-knowledge-handler',
    intent,
    sub_domain: subDomain,
    action: 'knowledge_processed',
    text_preview: text.slice(0, 100),
    timestamp: new Date().toISOString(),
    capabilities: ['deep_analysis', 'knowledge_graph', 'insight_extraction', 'pattern_recognition'],
    next_steps: ['gather_context', 'run_analysis', 'generate_insight_report'],
  };
}

module.exports = handle;
module.exports.handle = handle;
