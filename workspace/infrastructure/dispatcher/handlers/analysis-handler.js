'use strict';

/**
 * Analysis Handler (IC5) — 分析/洞察类消息处理
 *
 * Handles data analysis, insight generation, trend detection,
 * financial analysis, and visualization tasks.
 * Records to decision log and returns structured analysis result.
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
        component: 'AnalysisHandler',
        what: entry.what || 'analysis processing',
        why: entry.why || 'IC5 analysis/insight detected',
        confidence: entry.confidence || 0.8,
        decision_method: 'intent_classification',
        input_summary: JSON.stringify(entry).slice(0, 500),
      });
    } catch (_) {}
  }
}

async function handle(event, context) {
  const text = (event.payload && event.payload.text) || '';
  const intent = context.intent || { category: 'IC5', name: 'analysis' };

  logDecision({
    what: `Processing analysis request: ${text.slice(0, 80)}`,
    why: `IC5 analysis handler invoked — ${intent.name || 'general'}`,
    confidence: intent.confidence || 0.8,
  });

  // Classify analysis type
  let analysisType = 'general_analysis';
  if (/金融|财务|股票|行情|MACD|布林/i.test(text)) analysisType = 'financial_analysis';
  if (/趋势|预测|预判/i.test(text)) analysisType = 'trend_analysis';
  if (/数据.*分析|报表|可视化/i.test(text)) analysisType = 'data_analysis';
  if (/洞察|insight/i.test(text)) analysisType = 'insight_generation';

  return {
    status: 'handled',
    handler: 'analysis-handler',
    intent,
    analysis_type: analysisType,
    action: 'analysis_initiated',
    text_preview: text.slice(0, 100),
    timestamp: new Date().toISOString(),
    capabilities: ['data_processing', 'trend_detection', 'visualization', 'insight_generation'],
    next_steps: ['collect_data_sources', 'run_analysis_pipeline', 'generate_report'],
  };
}

module.exports = handle;
module.exports.handle = handle;
