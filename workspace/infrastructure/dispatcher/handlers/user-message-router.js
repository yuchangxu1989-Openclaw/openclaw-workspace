'use strict';

/**
 * User Message Router v1.0
 *
 * Routes user.message events to domain-specific handlers based on
 * intent classification (IC1-IC5).
 *
 * Flow:
 *   1. Classify intent from event text (regex-based, fast path)
 *   2. Look up handler from ISC routing rules or default mapping
 *   3. Require and execute the target handler
 *   4. Return result with actual handler name for proper tracking
 *
 * CommonJS, pure Node.js, zero external dependencies.
 */

const fs = require('fs');
const path = require('path');
const { shouldAutoExpandBasicOp } = require('../basic-op-policy');

// ─── Decision Logger ─────────────────────────────────────────────

let _decisionLogger = null;
try {
  _decisionLogger = require('../../decision-log/decision-logger');
} catch (_) {}

function logDecision(entry) {
  if (_decisionLogger && typeof _decisionLogger.log === 'function') {
    try {
      _decisionLogger.log({
        phase: 'execution',
        component: 'UserMessageRouter',
        what: entry.what || 'intent-based routing',
        why: entry.why || 'user message classification',
        confidence: entry.confidence || 0.8,
        decision_method: 'intent_classification',
        input_summary: JSON.stringify(entry).slice(0, 500),
      });
    } catch (_) {}
  }
}

// ─── Intent Classification (regex fast path) ─────────────────────

const INTENT_PATTERNS = [
  // IC1 — Emotion/Feedback
  { pattern: /不满|投诉|太差|很好|感谢|喜欢|讨厌|满意|失望|开心|生气|难过/i, category: 'IC1', name: 'emotion_feedback' },

  // IC2 — Development/Skill (building/creation context)
  { pattern: /做.*页面|做.*网页|产品.*页面|展示页/i, category: 'IC2', name: 'webpage_build' },
  { pattern: /做.*流水线|自动化.*流水线|自动化.*pipeline|pipeline/i, category: 'IC2', name: 'skill_orchestration' },
  { pattern: /技能|skill|从零.*做/i, category: 'IC2', name: 'skill_creation' },

  // IC3 — Knowledge/Academic (analysis context)
  { pattern: /论文|学术|方法论|研究|文献/i, category: 'IC3', name: 'academic_analysis' },
  { pattern: /竞品.*对比|对比.*竞品|竞品.*差异|竞品.*能力/i, category: 'IC3', name: 'competitive_analysis' },
  { pattern: /缺陷|bug|代码质量/i, category: 'IC3', name: 'engineering_defect' },
  { pattern: /效率|出了问题|哪里.*问题/i, category: 'IC3', name: 'problem_analysis' },

  // IC4 — Content
  { pattern: /PDF|文档.*知识|结构化.*知识/i, category: 'IC4', name: 'knowledge_extraction' },
  { pattern: /公众号|自媒体|运营|内容.*排期/i, category: 'IC4', name: 'content_operation' },

  // IC5 — Analysis/Insight
  { pattern: /金融|财务|股票|报表|MACD|行情/i, category: 'IC5', name: 'financial_analysis' },
];

function classifyIntent(text) {
  if (!text) return { category: 'IC0', name: 'unknown', confidence: 0.1 };

  for (const { pattern, category, name } of INTENT_PATTERNS) {
    if (pattern.test(text)) {
      return { category, name, confidence: 0.7 };
    }
  }
  return { category: 'IC0', name: 'unknown', confidence: 0.1 };
}

// ─── Handler Mapping ─────────────────────────────────────────────

const DEFAULT_HANDLER_MAP = {
  IC1: 'cras-feedback-handler',
  IC2: 'dev-task-handler',
  IC3: 'cras-knowledge-handler',
  IC4: 'dev-task-handler',
  IC5: 'analysis-handler',
};

/**
 * Resolve handler name from ISC routing rules or default mapping.
 * Intent-category match takes priority; domain match is secondary;
 * default handler map is the final fallback (never use ISC rule fallback
 * since the rule order from RuleMatcher is not guaranteed to be intent-first).
 */
function resolveHandlerName(intentCategory, iscRule) {
  // Try ISC routing rules — intent_category match (most specific)
  if (iscRule && iscRule.routing_rules && iscRule.routing_rules.routes) {
    for (const route of iscRule.routing_rules.routes) {
      if (route.intent_category === intentCategory) {
        return route.handler;
      }
    }
  }

  // Default mapping — always correct for known IC categories
  return DEFAULT_HANDLER_MAP[intentCategory] || 'cras-knowledge-handler';
}

// ─── Handler Executor ────────────────────────────────────────────

const HANDLERS_DIR = __dirname;
const _handlerCache = new Map();

function loadHandler(handlerName) {
  if (_handlerCache.has(handlerName)) return _handlerCache.get(handlerName);

  const handlerPath = path.join(HANDLERS_DIR, `${handlerName}.js`);
  if (!fs.existsSync(handlerPath)) {
    return null;
  }

  try {
    let mod = require(handlerPath);
    if (typeof mod === 'function') {
      _handlerCache.set(handlerName, mod);
      return mod;
    }
    if (mod && typeof mod.handle === 'function') {
      _handlerCache.set(handlerName, mod.handle);
      return mod.handle;
    }
  } catch (err) {
    logDecision({
      what: `Failed to load handler: ${handlerName}`,
      why: err.message,
      confidence: 0,
    });
  }
  return null;
}

// ─── Main Handler ────────────────────────────────────────────────

async function handle(event, context) {
  const text = (event.payload && event.payload.text) || '';
  const basicOp = shouldAutoExpandBasicOp(text, {
    priority: (context && context.rule && context.rule.priority) || 'high',
  });
  const intent = classifyIntent(text);

  // Get ISC rule from context (passed through by dispatcher)
  const iscRule = (context.rule && context.rule._iscRule)
    || (context.rule && context.rule.rule)
    || null;

  // Resolve target handler
  const targetHandlerName = resolveHandlerName(intent.category, iscRule);

  logDecision({
    what: `Routing ${intent.category}(${intent.name}) → ${targetHandlerName}`,
    why: `Intent: ${intent.category}, confidence: ${intent.confidence}`,
    confidence: intent.confidence,
  });

  // Load and execute the target handler
  const handlerFn = loadHandler(targetHandlerName);

  let result;
  if (!handlerFn) {
    // No handler file found — return a structured skeleton result
    result = {
      status: 'routed',
      handler: targetHandlerName,
      intent,
      message: `Routed to ${targetHandlerName} (handler pending implementation)`,
      event_type: event.type || 'user.message',
      text_preview: text.slice(0, 100),
      timestamp: new Date().toISOString(),
    };
  } else {
    const handlerContext = {
      ...context,
      intent,
      parentHandler: 'user-message-router',
      targetHandlerName,
      basicOp,
    };
    result = await handlerFn(event, handlerContext);
    if (result && typeof result === 'object') {
      result.handler = targetHandlerName;
    }
  }

  if (basicOp.shouldExpand) {
    result = {
      ...(result && typeof result === 'object' ? result : {}),
      auto_expand: {
        enabled: true,
        signal: basicOp.signal,
        derived_tasks: basicOp.derivedTasks,
      },
    };
  }

  return result;
}

// ─── Exports ─────────────────────────────────────────────────────

module.exports = handle;
module.exports.handle = handle;
module.exports.classifyIntent = classifyIntent;
module.exports.resolveHandlerName = resolveHandlerName;
