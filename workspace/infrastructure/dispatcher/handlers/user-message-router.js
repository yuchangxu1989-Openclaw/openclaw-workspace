'use strict';

/**
 * User Message Router v2.0
 *
 * Routes user.message events to domain-specific handlers based on
 * LLM-based intent classification (IC1-IC5).
 *
 * v2.0: 纯LLM语义理解，移除所有关键词/正则匹配。
 * LLM不可用时路由到默认handler，不猜意图。
 *
 * CommonJS, pure Node.js.
 */

const fs = require('fs');
const path = require('path');
const { shouldAutoExpandBasicOp } = require('../basic-op-policy');

// ─── LLM调用层 ───
let _callLLM = null;
try {
  _callLLM = require(path.join(__dirname, '../../../skills/cras/intent-extractor-llm')).callLLM;
} catch (_) {
  try {
    _callLLM = require('../../llm-context').chat;
  } catch (_2) {}
}

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
        decision_method: 'llm',
        input_summary: JSON.stringify(entry).slice(0, 500),
      });
    } catch (_) {}
  }
}

// ─── LLM Intent Classification ──────────────────────────────────

const CLASSIFY_SYSTEM_PROMPT = `你是一个精确的意图分类器。将用户消息分类到以下类别之一：

IC1 — 情绪/反馈：用户表达情绪、评价、满意度
IC2 — 开发/技能：开发任务、技能创建、代码、页面构建、流水线
IC3 — 知识/学术：知识查询、学术研究、竞品分析、问题分析
IC4 — 内容/文档：PDF处理、文档知识提取、自媒体运营
IC5 — 分析/洞察：金融分析、数据分析、趋势研判

规则：
- 语义理解，不做关键词匹配
- 只输出JSON，不要解释
- 无法分类返回 {"category":"IC0","name":"unknown","confidence":0.1}

输出格式：
{"category":"IC1-IC5","name":"简短英文标签","confidence":0.0-1.0}`;

const CLASSIFY_TIMEOUT_MS = 8000;

async function classifyIntent(text) {
  if (!text || !text.trim()) {
    return { category: 'IC0', name: 'unknown', confidence: 0.1 };
  }

  if (!_callLLM) {
    return { category: 'IC0', name: 'unknown', confidence: 0.1, reason: 'llm_unavailable' };
  }

  try {
    const response = await _callLLM(
      CLASSIFY_SYSTEM_PROMPT,
      `用户消息：\n${text.slice(0, 500)}`,
      { timeout: CLASSIFY_TIMEOUT_MS }
    );

    let jsonStr = String(response || '').trim();
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
    if (codeBlockMatch) jsonStr = codeBlockMatch[1];
    const start = jsonStr.indexOf('{');
    const end = jsonStr.lastIndexOf('}');
    if (start >= 0 && end > start) jsonStr = jsonStr.slice(start, end + 1);

    const parsed = JSON.parse(jsonStr);
    const category = parsed.category || 'IC0';
    const name = parsed.name || 'unknown';
    const confidence = typeof parsed.confidence === 'number'
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0.5;

    return { category, name, confidence };
  } catch (err) {
    logDecision({
      what: 'LLM classification failed',
      why: err.message,
      confidence: 0,
    });
    return { category: 'IC0', name: 'unknown', confidence: 0.1, reason: `llm_error: ${err.message}` };
  }
}

// ─── Handler Mapping ─────────────────────────────────────────────

const DEFAULT_HANDLER_MAP = {
  IC1: 'cras-feedback-handler',
  IC2: 'dev-task-handler',
  IC3: 'cras-knowledge-handler',
  IC4: 'dev-task-handler',
  IC5: 'analysis-handler',
};

function resolveHandlerName(intentCategory, iscRule) {
  if (iscRule && iscRule.routing_rules && iscRule.routing_rules.routes) {
    for (const route of iscRule.routing_rules.routes) {
      if (route.intent_category === intentCategory) {
        return route.handler;
      }
    }
  }
  return DEFAULT_HANDLER_MAP[intentCategory] || 'cras-knowledge-handler';
}

// ─── Handler Executor ────────────────────────────────────────────

const HANDLERS_DIR = __dirname;
const _handlerCache = new Map();

function loadHandler(handlerName) {
  if (_handlerCache.has(handlerName)) return _handlerCache.get(handlerName);

  const handlerPath = path.join(HANDLERS_DIR, `${handlerName}.js`);
  if (!fs.existsSync(handlerPath)) return null;

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
    logDecision({ what: `Failed to load handler: ${handlerName}`, why: err.message, confidence: 0 });
  }
  return null;
}

// ─── Main Handler ────────────────────────────────────────────────

async function handle(event, context) {
  const text = (event.payload && event.payload.text) || '';
  const basicOp = shouldAutoExpandBasicOp(text, {
    priority: (context && context.rule && context.rule.priority) || 'high',
  });

  // 检查context中是否已有意图分类结果（来自inline hook）
  let intent = (context && context.intent) || null;
  if (!intent || !intent.category || intent.category === 'IC0') {
    intent = await classifyIntent(text);
  }

  const iscRule = (context.rule && context.rule._iscRule)
    || (context.rule && context.rule.rule)
    || null;

  const targetHandlerName = resolveHandlerName(intent.category, iscRule);

  logDecision({
    what: `Routing ${intent.category}(${intent.name}) → ${targetHandlerName}`,
    why: `Intent: ${intent.category}, confidence: ${intent.confidence}`,
    confidence: intent.confidence,
  });

  const handlerFn = loadHandler(targetHandlerName);

  let result;
  if (!handlerFn) {
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

module.exports = handle;
module.exports.handle = handle;
module.exports.classifyIntent = classifyIntent;
module.exports.resolveHandlerName = resolveHandlerName;
