'use strict';

/**
 * Intent Inline Hook
 *
 * 快路：单条消息实时语义意图提取 + 立即emit事件
 * 事件前缀：intent.inline.{type}
 */

const path = require('path');
const { WORKSPACE } = require('../shared/paths');
const bus = require(path.join(WORKSPACE, 'infrastructure/event-bus/bus-adapter'));
const { callLLM } = require('./intent-extractor-llm');

const LOG_PREFIX = '[IntentInlineHook]';
const MIN_CONFIDENCE = 0.6;
const INLINE_TIMEOUT_MS = 3000;

const INLINE_EVENT_TYPES = {
  RULEIFY: 'intent.inline.ruleify',
  QUERY: 'intent.inline.query',
  FEEDBACK: 'intent.inline.feedback',
  DIRECTIVE: 'intent.inline.directive',
  REFLECT: 'intent.inline.reflect',
};

const VALID_TYPES = new Set(Object.keys(INLINE_EVENT_TYPES));

const SYSTEM_PROMPT = `你是一个高精度意图识别系统。请基于用户消息及最近5轮对话上下文，提取用户语义意图。

意图类型（MECE，且只能从这5类中选）：
1) RULEIFY：把经验/模式沉淀为规则
2) QUERY：查询信息/状态/解释
3) FEEDBACK：对系统行为的评价（正负都算）
4) DIRECTIVE：直接指令/决策
5) REFLECT：反思/复盘/总结

要求：
- 语义理解，不做关键词匹配
- 允许多意图，但最多3个
- 仅输出 confidence >= 0.6
- 无意图返回 {"intents": []}
- 严格只输出JSON，不要解释

输出格式：
{"intents":[{"type":"RULEIFY|QUERY|FEEDBACK|DIRECTIVE|REFLECT","target":"对象","summary":"一句话","confidence":0.6,"sentiment":"positive|negative|neutral"}]}`;

function withTimeout(promise, timeoutMs) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout ${timeoutMs}ms`)), timeoutMs);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

function parseLLMResponse(response) {
  if (!response) return [];
  let jsonStr = String(response);
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (codeBlockMatch) jsonStr = codeBlockMatch[1];

  const start = jsonStr.indexOf('{');
  const end = jsonStr.lastIndexOf('}');
  if (start >= 0 && end > start) jsonStr = jsonStr.slice(start, end + 1);

  try {
    const parsed = JSON.parse(jsonStr);
    const intents = Array.isArray(parsed?.intents) ? parsed.intents : [];
    return intents.filter((i) => {
      if (!i || typeof i !== 'object') return false;
      if (!VALID_TYPES.has(i.type)) return false;
      if (typeof i.summary !== 'string' || !i.summary.trim()) return false;
      if (typeof i.confidence !== 'number') return false;
      if (i.confidence < MIN_CONFIDENCE || i.confidence > 1) return false;
      return true;
    });
  } catch (_) {
    return [];
  }
}

function buildUserPrompt(message, context = {}) {
  const rounds = Array.isArray(context?.recentRounds)
    ? context.recentRounds
    : Array.isArray(context?.history)
      ? context.history
      : Array.isArray(context?.messages)
        ? context.messages
        : [];

  const last5 = rounds.slice(-5).map((r, idx) => {
    if (typeof r === 'string') return `[${idx + 1}] ${r}`;
    const role = r?.role || r?.speaker || 'unknown';
    const text = r?.text || r?.content || '';
    return `[${idx + 1}] ${role}: ${text}`;
  }).join('\n');

  return `用户当前消息：\n${message}\n\n最近5轮对话上下文：\n${last5 || '(无)'}\n\n请输出JSON。`;
}

function extractIntentHeuristic(message) {
  const text = String(message || '').trim();
  if (!text) return [];

  const intents = [];
  const hasQueryCue = /(查一下|查下|查询|看看|看下|检索|获取|当前|最近|状态|日志|报错|错误|原因|为什么|如何|多少|哪些|竞品|差异|对比|分析一下|系统状态)/.test(text);
  const hasDirectiveCue = /(创建|新建|生成|删除|更新|修改|执行|运行|帮我做|帮我处理|请你)/.test(text);
  const hasReflectCue = /(复盘|反思|总结|回顾)/.test(text);
  const hasFeedbackCue = /(太好|太差|不错|有问题|不好|满意|失望|赞|吐槽)/.test(text);
  const hasRuleifyCue = /(规则|沉淀|规范|模板|约定|以后都|统一)/.test(text);

  if (hasQueryCue) {
    intents.push({
      type: 'QUERY',
      target: text.slice(0, 24),
      summary: '用户在查询信息、状态或差异',
      confidence: 0.92,
      sentiment: 'neutral',
      extraction_path: 'heuristic',
    });
  }
  if (hasDirectiveCue && intents.length < 3) {
    intents.push({
      type: 'DIRECTIVE',
      target: text.slice(0, 24),
      summary: '用户发出直接操作指令',
      confidence: 0.78,
      sentiment: 'neutral',
      extraction_path: 'heuristic',
    });
  }
  if (hasReflectCue && intents.length < 3) {
    intents.push({ type: 'REFLECT', target: text.slice(0, 24), summary: '用户在做复盘反思', confidence: 0.74, sentiment: 'neutral', extraction_path: 'heuristic' });
  }
  if (hasFeedbackCue && intents.length < 3) {
    intents.push({ type: 'FEEDBACK', target: text.slice(0, 24), summary: '用户在评价系统行为', confidence: 0.72, sentiment: 'neutral', extraction_path: 'heuristic' });
  }
  if (hasRuleifyCue && intents.length < 3) {
    intents.push({ type: 'RULEIFY', target: text.slice(0, 24), summary: '用户希望沉淀为规则', confidence: 0.76, sentiment: 'neutral', extraction_path: 'heuristic' });
  }

  return intents;
}

async function extractIntentInline(message, context = {}) {
  const text = typeof message === 'string'
    ? message
    : (message?.text || message?.content || '');

  if (!text || !text.trim()) return null;

  const emitIntents = (intents) => {
    if (!Array.isArray(intents) || !intents.length) return null;

    const emitted = [];
    for (const intent of intents) {
      const eventType = INLINE_EVENT_TYPES[intent.type];
      if (!eventType) continue;

      bus.emit(eventType, {
        intent_type: intent.type,
        target: intent.target || 'unknown',
        summary: intent.summary,
        confidence: intent.confidence,
        sentiment: intent.sentiment || 'neutral',
        source_text: text.slice(0, 300),
        extraction_path: intent.extraction_path || 'inline',
        extracted_at: Date.now(),
        session_id: context?.session_id || context?.sessionId || 'unknown',
        channel: context?.channel || 'unknown',
      }, 'cras-intent-inline-hook', {
        layer: 'l3',
        trace_id: `ii_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        chain_depth: 0,
      });

      emitted.push({ eventType, intent });
    }

    return emitted.length ? { intents, emitted } : null;
  };

  try {
    const response = await withTimeout(
      callLLM(SYSTEM_PROMPT, buildUserPrompt(text, context), { timeout: INLINE_TIMEOUT_MS }),
      INLINE_TIMEOUT_MS
    );

    const intents = parseLLMResponse(response);
    const llmResult = emitIntents(intents);
    if (llmResult) return llmResult;

    return emitIntents(extractIntentHeuristic(text));
  } catch (err) {
    console.warn(`${LOG_PREFIX} extract timeout/fail: ${err.message}`);
    return emitIntents(extractIntentHeuristic(text));
  }
}

module.exports = async function(event, rule, context = {}) {
  const message = event?.text || event?.content || event?.message || event?.payload?.text || '';

  // 非阻塞主流程：本handler内部有3s硬超时；失败/超时直接返回null
  return extractIntentInline(message, context);
};

module.exports.extractIntentInline = extractIntentInline;
module.exports._parseLLMResponse = parseLLMResponse;
module.exports._buildUserPrompt = buildUserPrompt;
module.exports._extractIntentHeuristic = extractIntentHeuristic;
