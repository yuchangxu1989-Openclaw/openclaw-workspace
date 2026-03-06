#!/usr/bin/env node
'use strict';

/**
 * CRAS Intent Extractor — Fast Path (Inline Hook)
 *
 * 双路架构中的快路：嵌入消息处理管道，每条用户消息到达时
 * 同步提取意图 → 立即emit事件。毫秒级响应。这是主路径。
 *
 * 设计原则：
 *   - 非阻塞：LLM调用异步，不阻塞消息处理主流程
 *   - 快速降级：LLM超时/失败 → 不影响消息投递
 *   - 去重：与慢路(cron)的结果通过fingerprint去重
 *   - 轻量：每条消息一次LLM调用，prompt精简
 *
 * 使用方式：
 *   const { InlineIntentHook } = require('./intent-extractor-inline');
 *   const hook = new InlineIntentHook();
 *   // 在消息处理管道中调用：
 *   hook.onMessage(messageText, context);
 *   // 或直接提取（不emit）：
 *   const intents = await hook.extractFromText(messageText);
 *
 * @module cras-intent-extractor-inline
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const { WORKSPACE } = require('../shared/paths');

// ─── 事件总线 ───
const bus = require(path.join(WORKSPACE, 'infrastructure/event-bus/bus-adapter'));

// ─── LLM调用层（复用慢路的LLM基础设施） ───
const { callLLM } = require('./intent-extractor-llm');

// ─── 常量 ───
const LOG_PREFIX = '[IntentExtractor:Fast]';

/**
 * 意图分类体系（与慢路完全一致，保证两路产出可合并）
 */
const INTENT_TYPES = {
  RULEIFY:   'intent.ruleify',
  QUERY:     'intent.query',
  FEEDBACK:  'intent.feedback',
  DIRECTIVE: 'intent.directive',
  REFLECT:   'intent.reflect',
};

const VALID_INTENT_TYPES = new Set(Object.keys(INTENT_TYPES));

/**
 * 快路专用System Prompt — 比慢路精简，针对单条消息优化
 *
 * 区别于慢路：
 *   - 不需要处理多轮上下文（那是慢路的职责）
 *   - 更强调速度和JSON遵从
 *   - 只处理表层意图（深层/隐含意图交给慢路）
 */
const FAST_SYSTEM_PROMPT = `你是一个高速意图识别系统。分析单条用户消息，识别直接意图。

## 意图分类（五类互斥穷尽）
1. RULEIFY — 想把经验/模式变成规则或代码
2. QUERY — 寻找信息、查询状态
3. FEEDBACK — 对系统行为评价（正面/负面）
4. DIRECTIVE — 直接操作指令或决策
5. REFLECT — 反思、复盘、总结

## 输出规则
- 只输出JSON，不要任何其他文字
- 直接以 { 开头
- confidence >= 0.6 才输出
- 闲聊返回 {"intents": []}
- 最多2个意图

## JSON格式
{"intents": [{"type": "RULEIFY|QUERY|FEEDBACK|DIRECTIVE|REFLECT", "target": "对象", "summary": "一句话", "confidence": 0.6-1.0, "sentiment": "positive|negative|neutral"}]}`;


// ═══════════════════════════════════════════════════════════
// 去重：快路和慢路的fingerprint一致性
// ═══════════════════════════════════════════════════════════

/** @type {Map<string, number>} fingerprint → timestamp */
const _recentIntents = new Map();
const DEDUP_WINDOW_MS = 10 * 60 * 1000; // 10分钟去重窗口

/**
 * 生成意图指纹（与慢路兼容，用于跨路去重）
 */
function intentFingerprint(intentType, target, summary) {
  // 粗粒度fingerprint：类型+目标前20字符
  const key = `${intentType}::${(target || '').slice(0, 20)}::${(summary || '').slice(0, 30)}`;
  return key;
}

function isDuplicate(fp) {
  _pruneDedup();
  return _recentIntents.has(fp);
}

function markEmitted(fp) {
  _recentIntents.set(fp, Date.now());
}

function _pruneDedup() {
  const now = Date.now();
  for (const [key, ts] of _recentIntents) {
    if (now - ts > DEDUP_WINDOW_MS) _recentIntents.delete(key);
  }
}

// ═══════════════════════════════════════════════════════════
// LLM响应解析（复用慢路逻辑）
// ═══════════════════════════════════════════════════════════

function validateIntent(intent) {
  if (!intent || typeof intent !== 'object') return false;
  if (!VALID_INTENT_TYPES.has(intent.type)) return false;
  if (typeof intent.confidence !== 'number' || intent.confidence < 0 || intent.confidence > 1) return false;
  if (!intent.summary || typeof intent.summary !== 'string') return false;
  return true;
}

function parseLLMResponse(response) {
  if (!response) return [];

  let jsonStr = response;
  const codeBlockMatch = response.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (codeBlockMatch) jsonStr = codeBlockMatch[1];

  const jsonStart = jsonStr.indexOf('{');
  const jsonEnd = jsonStr.lastIndexOf('}');
  if (jsonStart >= 0 && jsonEnd > jsonStart) {
    jsonStr = jsonStr.slice(jsonStart, jsonEnd + 1);
  }

  try {
    const parsed = JSON.parse(jsonStr);
    if (parsed && Array.isArray(parsed.intents)) {
      return parsed.intents.filter(validateIntent);
    }
    return [];
  } catch (_) {
    return [];
  }
}


// ═══════════════════════════════════════════════════════════
// InlineIntentHook 主类
// ═══════════════════════════════════════════════════════════

class InlineIntentHook {
  /**
   * @param {object} [options]
   * @param {number} [options.timeout=15000] - LLM调用超时（快路要快）
   * @param {number} [options.minConfidence=0.6] - 最低置信度
   * @param {number} [options.minTextLength=10] - 文本最短长度（过短不提取）
   * @param {boolean} [options.emitEvents=true] - 是否自动emit到事件总线
   * @param {boolean} [options.blocking=false] - 是否阻塞消息处理等待LLM（默认非阻塞）
   */
  constructor(options = {}) {
    this.timeout = options.timeout || 15000;
    this.minConfidence = options.minConfidence || 0.6;
    this.minTextLength = options.minTextLength || 10;
    this.emitEvents = options.emitEvents !== false;
    this.blocking = options.blocking || false;

    // 统计
    this.stats = {
      messages_processed: 0,
      intents_detected: 0,
      events_emitted: 0,
      llm_calls: 0,
      llm_failures: 0,
      skipped_short: 0,
      skipped_dedup: 0,
    };
  }

  /**
   * 消息处理钩子 — 核心入口
   *
   * 在消息处理管道中调用，每条用户消息到达时触发。
   * 默认非阻塞：fire-and-forget LLM调用，不延迟消息投递。
   *
   * @param {string|object} message - 用户消息（字符串或{text, ...}对象）
   * @param {object} [context={}] - 消息上下文（channel, session_id等）
   * @returns {Promise<{intents: Array, events: string[]}>|void} blocking模式返回Promise，否则fire-and-forget
   */
  onMessage(message, context = {}) {
    const text = typeof message === 'string' ? message : (message?.text || message?.content || '');
    this.stats.messages_processed++;

    // 过短消息跳过
    if (text.length < this.minTextLength) {
      this.stats.skipped_short++;
      return this.blocking
        ? Promise.resolve({ intents: [], events: [] })
        : undefined;
    }

    // 非阻塞模式：fire-and-forget
    if (!this.blocking) {
      this._extractAndEmit(text, context).catch(err => {
        console.error(`${LOG_PREFIX} 非阻塞提取失败（不影响消息投递）: ${err.message}`);
      });
      return undefined;
    }

    // 阻塞模式：等待LLM结果
    return this._extractAndEmit(text, context);
  }

  /**
   * 纯提取接口 — 不emit事件，只返回意图列表
   *
   * 适用于需要立即使用意图结果的场景（如路由决策）。
   *
   * @param {string} text - 用户消息文本
   * @param {object} [context={}] - 上下文
   * @returns {Promise<Array<{type: string, target: string, summary: string, confidence: number, sentiment: string}>>}
   */
  async extractFromText(text, context = {}) {
    if (!text || text.length < this.minTextLength) return [];

    this.stats.llm_calls++;

    try {
      const userPrompt = `分析用户消息：\n\n"${text}"`;
      const response = await callLLM(FAST_SYSTEM_PROMPT, userPrompt, {
        timeout: this.timeout,
      });

      const intents = parseLLMResponse(response)
        .filter(i => i.confidence >= this.minConfidence);

      return intents;
    } catch (err) {
      this.stats.llm_failures++;
      console.error(`${LOG_PREFIX} LLM调用失败: ${err.message}`);
      return [];
    }
  }

  /**
   * 内部：提取意图 + emit事件
   * @private
   */
  async _extractAndEmit(text, context) {
    const intents = await this.extractFromText(text, context);
    const emittedEvents = [];

    for (const intent of intents) {
      const eventType = INTENT_TYPES[intent.type];
      if (!eventType) continue;

      // 去重检查
      const fp = intentFingerprint(intent.type, intent.target, intent.summary);
      if (isDuplicate(fp)) {
        this.stats.skipped_dedup++;
        continue;
      }

      if (this.emitEvents) {
        const emitResult = bus.emit(eventType, {
          intent_type: intent.type,
          target: intent.target || 'unknown',
          summary: intent.summary,
          confidence: intent.confidence,
          sentiment: intent.sentiment || 'neutral',
          source_text: text.slice(0, 200), // 截断，保护隐私
          extraction_path: 'fast',         // 标记来源：快路
          channel: context.channel || 'unknown',
          session_id: context.session_id || context.sessionId || 'unknown',
          extracted_at: Date.now(),
          extractor_version: '1.0.0',
        }, 'cras-intent-extractor-inline', {
          layer: 'l3',
          trace_id: `fi_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          chain_depth: 0,
        });

        if (emitResult && !emitResult.suppressed) {
          emittedEvents.push(eventType);
          markEmitted(fp);
          this.stats.events_emitted++;
          this.stats.intents_detected++;
          console.log(`${LOG_PREFIX} 🎯 ${eventType} [${intent.confidence}]: ${intent.summary}`);
        }
      }
    }

    return { intents, events: emittedEvents };
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * 重置统计
   */
  resetStats() {
    for (const key of Object.keys(this.stats)) {
      this.stats[key] = 0;
    }
  }
}


// ═══════════════════════════════════════════════════════════
// 单例 + 集成到现有MessageHook
// ═══════════════════════════════════════════════════════════

let _defaultInstance = null;

/**
 * 获取默认单例
 */
function getDefaultHook(options) {
  if (!_defaultInstance) {
    _defaultInstance = new InlineIntentHook(options);
  }
  return _defaultInstance;
}

/**
 * 升级现有MessageHook — 在关键词匹配之后追加LLM语义意图提取
 *
 * 用法：
 *   const { MessageHook } = require('../infrastructure/message-hook');
 *   const { patchMessageHook } = require('./intent-extractor-inline');
 *   patchMessageHook(messageHookInstance);
 *
 * 或在OpenClaw gateway启动时：
 *   const hook = getDefaultHook();
 *   // 在消息处理中间件中：
 *   hook.onMessage(userMessage, { channel: 'feishu', session_id: sid });
 */
function patchMessageHook(messageHookInstance, options = {}) {
  if (!messageHookInstance || typeof messageHookInstance.onMessage !== 'function') {
    console.warn(`${LOG_PREFIX} patchMessageHook: 无效的MessageHook实例`);
    return;
  }

  const inlineHook = new InlineIntentHook(options);
  const originalOnMessage = messageHookInstance.onMessage.bind(messageHookInstance);

  messageHookInstance.onMessage = function(message, context) {
    // 1. 先执行原有的关键词匹配（保持兼容）
    const metadata = originalOnMessage(message, context);

    // 2. 异步追加LLM语义意图提取（非阻塞）
    const text = typeof message === 'string' ? message : (message?.text || '');
    inlineHook.onMessage(text, context);

    // 3. 将inline hook引用挂到metadata上供下游使用
    if (metadata) {
      metadata._inlineIntentHook = inlineHook;
    }

    return metadata;
  };

  // 暴露inline hook的stats
  messageHookInstance.getInlineIntentStats = () => inlineHook.getStats();

  console.log(`${LOG_PREFIX} ✅ MessageHook已升级为双路意图提取`);
  return inlineHook;
}


// ═══════════════════════════════════════════════════════════
// 导出
// ═══════════════════════════════════════════════════════════

module.exports = {
  InlineIntentHook,
  getDefaultHook,
  patchMessageHook,
  // 慢路兼容
  INTENT_TYPES,
  // 测试辅助
  _parseLLMResponse: parseLLMResponse,
  _validateIntent: validateIntent,
  _intentFingerprint: intentFingerprint,
  _FAST_SYSTEM_PROMPT: FAST_SYSTEM_PROMPT,
  _recentIntents,
};


// ═══════════════════════════════════════════════════════════
// CLI入口
// ═══════════════════════════════════════════════════════════

if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--test-message')) {
    // 快速测试单条消息
    const msg = args.slice(args.indexOf('--test-message') + 1).join(' ') || '这个规则应该自动化执行';
    const hook = new InlineIntentHook({ blocking: true, emitEvents: false });

    console.log(`${LOG_PREFIX} 测试消息: "${msg}"\n`);
    hook.extractFromText(msg).then(intents => {
      if (intents.length === 0) {
        console.log('  (无意图识别)');
      } else {
        for (const i of intents) {
          console.log(`  🎯 ${i.type} [${i.confidence}] ${i.summary}`);
        }
      }
      console.log(`\n${LOG_PREFIX} Stats: ${JSON.stringify(hook.getStats())}`);
    }).catch(err => {
      console.error(`错误: ${err.message}`);
      process.exit(1);
    });
  } else if (args.includes('--stats')) {
    const hook = getDefaultHook();
    console.log(JSON.stringify(hook.getStats(), null, 2));
  } else {
    console.log(`用法:
  node intent-extractor-inline.js --test-message "你的消息"
  node intent-extractor-inline.js --stats

快路意图提取器 — 嵌入消息处理管道，每条消息实时提取意图。
`);
  }
}
