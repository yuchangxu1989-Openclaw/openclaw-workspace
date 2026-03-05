'use strict';

/**
 * User Message Router v2.0
 *
 * Routes user.message events to domain-specific handlers based on
 * intent classification (IC1-IC5).
 *
 * Flow:
 *   1. Classify intent from event text (regex-based, fast path <10ms)
 *   2. If regex returns IC0/unknown, call LLM for intent classification (slow path)
 *   3. Look up handler from ISC routing rules or default mapping
 *   4. Require and execute the target handler
 *   5. Return result with actual handler name for proper tracking
 *
 * CommonJS, pure Node.js.
 * LLM dependency: Anthropic SDK (from openclaw node_modules), claude-haiku model.
 */

const fs = require('fs');
const path = require('path');

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

function classifyIntentByRegex(text) {
  if (!text) return { category: 'IC0', name: 'unknown', confidence: 0.1 };

  for (const { pattern, category, name } of INTENT_PATTERNS) {
    if (pattern.test(text)) {
      return { category, name, confidence: 0.7 };
    }
  }
  return { category: 'IC0', name: 'unknown', confidence: 0.1 };
}

// ─── LLM Fallback Intent Classifier ──────────────────────────────

const ANTHROPIC_SDK_PATH = '/usr/lib/node_modules/openclaw/node_modules/@anthropic-ai/sdk';
const CLAUDE_BASE_URL = 'https://api.penguinsaichat.dpdns.org/';
// API key: load from openclaw.json if available, else env, else hardcoded main key
const CLAUDE_API_KEY = (() => {
  try {
    const cfg = JSON.parse(require('fs').readFileSync('/root/.openclaw/openclaw.json', 'utf8'));
    return cfg.models?.providers?.claude?.apiKey || process.env.CLAUDE_KEY_MAIN;
  } catch (_) {
    return process.env.CLAUDE_KEY_MAIN || 'REDACTED_CLAUDE_API_KEY';
  }
})();
const LLM_MODEL = 'claude-sonnet-4-6';  // Use available model from penguinsaichat
const LLM_TIMEOUT_MS = 10000;

let _anthropicClient = null;

function getAnthropicClient() {
  if (_anthropicClient) return _anthropicClient;
  try {
    const { Anthropic } = require(ANTHROPIC_SDK_PATH);
    _anthropicClient = new Anthropic({
      apiKey: CLAUDE_API_KEY,
      baseURL: CLAUDE_BASE_URL,
    });
    return _anthropicClient;
  } catch (err) {
    console.error('[UserMessageRouter] Failed to init Anthropic client:', err.message);
    return null;
  }
}

const LLM_INTENT_SYSTEM_PROMPT = `你是一个用户意图分类器，负责将用户消息分类到以下意图类别（IC0-IC5）。

## 意图类别定义

- **IC0** (unknown): 无法识别的意图，或与以下类别都不匹配
- **IC1** (emotion_feedback): 情绪表达、情感反馈、满意/不满意表达、态度性评价
- **IC2** (skill_development): 技能创建、功能开发、工具构建、自动化任务、从零开始做某个系统
- **IC3** (knowledge_analysis): 知识查询、学术分析、竞品对比、问题分析、工程缺陷分析、技术研究
- **IC4** (content_operation): 内容提取、文档处理、知识整理、内容排期、自媒体运营
- **IC5** (financial_analysis): 金融数据分析、股票分析、财务报表、量化指标

## 特殊情况

1. **复合意图**：一条消息可能包含多个意图（如"不错，但重新规划一下" = IC1情绪 + IC3分析）
2. **隐式意图**：用户没有明说，但意图明显（如"换个方向试试" = 隐式拒绝/方向调整 → IC1反馈）
3. **认可+扩展**：认可当前方案并追加需求（如"没问题，再加个功能" → IC1 + IC2）
4. **反馈+重规划**：对现状负面评价并要求重新来过（如"太慢了，重新规划" → IC1 + IC3）

## 输出格式（严格JSON）

{
  "intents": [
    {
      "category": "IC1",
      "name": "emotion_feedback",
      "confidence": 0.9,
      "reasoning": "用户表达了负面情绪（太慢）并要求重新规划"
    }
  ],
  "primary": "IC1",
  "is_composite": false
}

- intents数组：按confidence降序，最多3个
- primary：主意图category
- is_composite：是否为复合意图（多个不同类别的意图组合）
- confidence范围：0.0-1.0
- 只输出JSON，不要其他文字`;

async function classifyIntentByLLM(text) {
  const client = getAnthropicClient();
  if (!client) {
    return { category: 'IC0', name: 'unknown', confidence: 0.1, source: 'llm_init_failed' };
  }

  // Timeout race
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('LLM timeout')), LLM_TIMEOUT_MS)
  );

  const llmPromise = (async () => {
    const response = await client.messages.create({
      model: LLM_MODEL,
      max_tokens: 512,
      system: LLM_INTENT_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `请分类以下用户消息的意图：\n\n"${text}"`,
        },
      ],
    });

    const rawContent = response.content[0]?.text || '';
    // Extract JSON from response
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in LLM response');

    const parsed = JSON.parse(jsonMatch[0]);
    const primaryIntent = parsed.intents && parsed.intents[0];

    if (!primaryIntent) throw new Error('No intent in LLM response');

    return {
      category: primaryIntent.category || 'IC0',
      name: primaryIntent.name || 'unknown',
      confidence: primaryIntent.confidence || 0.5,
      reasoning: primaryIntent.reasoning || '',
      source: 'llm',
      is_composite: parsed.is_composite || false,
      all_intents: parsed.intents || [],
    };
  })();

  try {
    return await Promise.race([llmPromise, timeoutPromise]);
  } catch (err) {
    const isTimeout = err.message === 'LLM timeout';
    console.error(`[UserMessageRouter] LLM ${isTimeout ? 'timed out' : 'error'}:`, err.message);
    return {
      category: 'IC0',
      name: 'unknown',
      confidence: 0.1,
      source: isTimeout ? 'llm_timeout_fallback' : 'llm_error_fallback',
      error: err.message,
    };
  }
}

// ─── Main classifyIntent (regex + LLM fallback) ───────────────────

async function classifyIntent(text) {
  if (!text) return { category: 'IC0', name: 'unknown', confidence: 0.1, source: 'empty_input' };

  // Fast path: regex
  const regexResult = classifyIntentByRegex(text);
  if (regexResult.category !== 'IC0') {
    return { ...regexResult, source: 'regex' };
  }

  // Slow path: LLM fallback for IC0/unknown
  console.log('[UserMessageRouter] Regex returned IC0, invoking LLM fallback...');
  const llmResult = await classifyIntentByLLM(text);
  return llmResult;
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
  const intent = await classifyIntent(text);

  // Get ISC rule from context (passed through by dispatcher)
  const iscRule = (context.rule && context.rule._iscRule)
    || (context.rule && context.rule.rule)
    || null;

  // Resolve target handler
  const targetHandlerName = resolveHandlerName(intent.category, iscRule);

  logDecision({
    what: `Routing ${intent.category}(${intent.name}) → ${targetHandlerName}`,
    why: `Intent: ${intent.category}, confidence: ${intent.confidence}, source: ${intent.source || 'regex'}`,
    confidence: intent.confidence,
  });

  // Load and execute target handler
  const handlerFn = loadHandler(targetHandlerName);

  if (!handlerFn) {
    // No handler file found — return a structured skeleton result
    return {
      status: 'routed',
      handler: targetHandlerName,
      intent,
      message: `Routed to ${targetHandlerName} (handler pending implementation)`,
      event_type: event.type || 'user.message',
      text_preview: text.slice(0, 100),
      timestamp: new Date().toISOString(),
    };
  }

  // Execute the target handler
  const handlerContext = {
    ...context,
    intent,
    parentHandler: 'user-message-router',
    targetHandlerName,
  };

  const result = await handlerFn(event, handlerContext);

  // Ensure the handler name is reported correctly
  if (result && typeof result === 'object') {
    result.handler = targetHandlerName;
  }

  return result;
}

// ─── Exports ─────────────────────────────────────────────────────

module.exports = handle;
module.exports.handle = handle;
module.exports.classifyIntent = classifyIntent;
module.exports.classifyIntentByRegex = classifyIntentByRegex;
module.exports.classifyIntentByLLM = classifyIntentByLLM;
module.exports.resolveHandlerName = resolveHandlerName;
