'use strict';

/**
 * Dev Task Handler (IC4) — 开发/技能类消息处理
 *
 * Handles development tasks, skill creation, code generation,
 * webpage building, content pipeline, and automation workflows.
 * Records to decision log and returns structured dev task result.
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
        component: 'DevTaskHandler',
        what: entry.what || 'dev task processing',
        why: entry.why || 'IC4 development/skill detected',
        confidence: entry.confidence || 0.8,
        decision_method: 'intent_classification',
        input_summary: JSON.stringify(entry).slice(0, 500),
      });
    } catch (_) {}
  }
}

async function handle(event, context) {
  const text = (event.payload && event.payload.text) || '';
  const intent = context.intent || { category: 'IC4', name: 'dev_task' };

  logDecision({
    what: `Processing dev task: ${text.slice(0, 80)}`,
    why: `IC4 dev-task handler invoked — ${intent.name || 'general'}`,
    confidence: intent.confidence || 0.8,
  });

  // Classify dev task type
  let taskType = 'general_development';
  if (/技能|skill/i.test(text)) taskType = 'skill_creation';
  if (/网页|页面|网站|前端|html/i.test(text)) taskType = 'webpage_build';
  if (/流水线|pipeline|自动化/i.test(text)) taskType = 'automation_pipeline';
  if (/PDF|文档.*知识|结构化/i.test(text)) taskType = 'knowledge_extraction';
  if (/公众号|自媒体|运营|内容/i.test(text)) taskType = 'content_operation';
  if (/编排|协调|多.*技能/i.test(text)) taskType = 'skill_orchestration';

  return {
    status: 'handled',
    handler: 'dev-task-handler',
    intent,
    task_type: taskType,
    action: 'dev_task_created',
    text_preview: text.slice(0, 100),
    timestamp: new Date().toISOString(),
    capabilities: ['code_generation', 'skill_scaffolding', 'build_pipeline', 'content_pipeline'],
    next_steps: ['analyze_requirements', 'generate_plan', 'execute_task', 'validate_output'],
  };
}

module.exports = handle;
module.exports.handle = handle;
