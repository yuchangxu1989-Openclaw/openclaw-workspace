'use strict';

/**
 * LLM Context — 标准 LLM 上下文注入层
 * 
 * 技能不知道也不关心用什么模型。
 * 技能只通过这个标准接口获取 LLM 能力，运行时环境负责注入。
 * 
 * Usage:
 *   const { createLLMContext } = require('./infrastructure/llm-context');
 *   const llm = createLLMContext();  // 自动读取 openclaw.json 配置
 * 
 *   const result = await llm.chat(
 *     [{ role: 'user', content: '...' }],
 *     { capability: 'reasoning', priority: 'quality' }
 *   );
 *   // result: { content, model, provider, tokens, cost_estimate }
 */

const { ProviderRegistry } = require('./providers');
const { Router } = require('./router');

// ─── HTTP Client (OpenAI-compatible & Anthropic) ─────────────────────

async function httpCall(entry, messages, options = {}) {
  const { temperature = 0.7, maxTokens, timeout = 120_000 } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    let url, headers, body;

    if (entry.api === 'anthropic-messages') {
      // Anthropic Messages API
      url = `${entry.baseUrl}/v1/messages`;
      headers = {
        'Content-Type': 'application/json',
        'x-api-key': entry.apiKey,
        'anthropic-version': '2023-06-01',
      };

      // Extract system message
      const systemMsgs = messages.filter(m => m.role === 'system');
      const nonSystemMsgs = messages.filter(m => m.role !== 'system');

      body = {
        model: entry.modelId,
        messages: nonSystemMsgs,
        max_tokens: maxTokens || entry.maxTokens || 4096,
        temperature,
      };
      if (systemMsgs.length > 0) {
        body.system = systemMsgs.map(m => m.content).join('\n\n');
      }
    } else {
      // OpenAI-compatible API (default)
      url = `${entry.baseUrl}/chat/completions`;
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${entry.apiKey}`,
      };
      body = {
        model: entry.modelId,
        messages,
        temperature,
        max_tokens: maxTokens || entry.maxTokens || 4096,
      };
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
    }

    const json = await res.json();

    // Parse response (handle both OpenAI and Anthropic formats)
    let content, tokens;

    if (entry.api === 'anthropic-messages') {
      content = json.content?.[0]?.text || '';
      tokens = {
        prompt: json.usage?.input_tokens || 0,
        completion: json.usage?.output_tokens || 0,
        total: (json.usage?.input_tokens || 0) + (json.usage?.output_tokens || 0),
      };
    } else {
      content = json.choices?.[0]?.message?.content || '';
      tokens = {
        prompt: json.usage?.prompt_tokens || 0,
        completion: json.usage?.completion_tokens || 0,
        total: json.usage?.total_tokens || 0,
      };
    }

    if (!content) throw new Error('Empty response from LLM');

    return { content, tokens };

  } finally {
    clearTimeout(timer);
  }
}

// ─── Embedding HTTP Client ──────────────────────────────────────────

async function httpEmbed(entry, text, options = {}) {
  const { timeout = 30_000 } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const url = `${entry.baseUrl}/embeddings`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${entry.apiKey}`,
      },
      body: JSON.stringify({
        model: entry.modelId,
        input: text,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${errText.slice(0, 300)}`);
    }

    const json = await res.json();
    const embedding = json.data?.[0]?.embedding;
    if (!embedding) throw new Error('Empty embedding response');

    return {
      embedding,
      tokens: { total: json.usage?.total_tokens || 0 },
    };
  } finally {
    clearTimeout(timer);
  }
}

// ─── LLMContext Class ───────────────────────────────────────────────

class LLMContext {
  /**
   * @param {object} [config]
   * @param {string} [config.configPath] - 配置文件路径（默认 openclaw.json）
   * @param {ProviderRegistry} [config.registry] - 注入 registry（测试用）
   * @param {Function} [config._httpCall] - 覆盖 HTTP 调用（测试用）
   * @param {Function} [config._httpEmbed] - 覆盖嵌入调用（测试用）
   */
  constructor(config = {}) {
    this._registry = config.registry || new ProviderRegistry(config.configPath);
    this._router = new Router(this._registry);
    this._httpCall = config._httpCall || httpCall;
    this._httpEmbed = config._httpEmbed || httpEmbed;
  }

  /**
   * 聊天/推理/代码生成 — 技能调用的主接口
   * 
   * @param {Array<{role: string, content: string}>} messages - 消息列表
   * @param {object} [requirements]
   * @param {string} [requirements.capability='chat'] - 'chat' | 'code' | 'reasoning' | 'vision'
   * @param {string} [requirements.priority='cost'] - 'speed' | 'quality' | 'cost'
   * @param {number} [requirements.minContext] - 最小上下文窗口
   * @param {number} [requirements.maxCost] - 最大成本分数
   * @param {number} [requirements.temperature] - 温度
   * @param {number} [requirements.maxTokens] - 最大输出 token
   * @param {number} [requirements.timeout] - 超时 ms
   * @returns {Promise<{content: string, model: string, provider: string, tokens: object, cost_estimate: number}>}
   */
  async chat(messages, requirements = {}) {
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error('[llm-context] messages must be a non-empty array');
    }

    const { temperature, maxTokens, timeout, ...routeReqs } = requirements;
    if (!routeReqs.capability) routeReqs.capability = 'chat';

    const callFn = async (entry) => {
      return this._httpCall(entry, messages, { temperature, maxTokens, timeout });
    };

    const { result, entry, attempts } = await this._router.executeWithFallback(callFn, routeReqs);

    return {
      content: result.content,
      model: entry.modelId,
      provider: entry.providerName,
      tokens: result.tokens,
      cost_estimate: (result.tokens?.total || 0) * (entry.cost / 1000),
      _meta: { attempts },
    };
  }

  /**
   * 文本嵌入
   */
  async embed(text, requirements = {}) {
    if (!text) throw new Error('[llm-context] text is required for embedding');

    const routeReqs = { ...requirements, capability: 'embedding' };
    const { timeout, ...rest } = requirements;

    const callFn = async (entry) => {
      return this._httpEmbed(entry, text, { timeout });
    };

    const { result, entry } = await this._router.executeWithFallback(callFn, routeReqs);

    return {
      embedding: result.embedding,
      model: entry.modelId,
      provider: entry.providerName,
      tokens: result.tokens,
    };
  }

  /**
   * 视觉理解
   */
  async vision(image, prompt, requirements = {}) {
    if (!image) throw new Error('[llm-context] image is required for vision');

    const messages = [
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: image } },
          { type: 'text', text: prompt || 'Describe this image.' },
        ],
      },
    ];

    return this.chat(messages, { ...requirements, capability: 'vision' });
  }

  /**
   * 获取 Provider 注册表（高级用途）
   */
  get registry() {
    return this._registry;
  }

  /**
   * 获取路由器（高级用途）
   */
  get router() {
    return this._router;
  }
}

// ─── 工厂函数 ────────────────────────────────────────────────────────

/**
 * 创建 LLMContext 实例
 * @param {object} [config] - 可选配置（通常不需要传）
 * @returns {LLMContext}
 */
function createLLMContext(config) {
  return new LLMContext(config);
}

// 单例（技能直接 require 时可用）
let _singleton = null;

function getSingleton() {
  if (!_singleton) {
    _singleton = createLLMContext();
  }
  return _singleton;
}

// ─── 便捷接口（可直接 require('...llm-context').chat(...)）────────

module.exports = {
  LLMContext,
  createLLMContext,

  // 便捷方法 — 使用单例
  chat: (messages, requirements) => getSingleton().chat(messages, requirements),
  embed: (text, requirements) => getSingleton().embed(text, requirements),
  vision: (image, prompt, requirements) => getSingleton().vision(image, prompt, requirements),

  // 重置单例（测试用）
  _resetSingleton: () => { _singleton = null; },
  _setSingleton: (instance) => { _singleton = instance; },
};
