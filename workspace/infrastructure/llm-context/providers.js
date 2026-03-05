'use strict';

/**
 * Provider Registry — 自动从 openclaw.json 发现并注册所有LLM Provider
 * 
 * 职责：
 *   1. 读取 openclaw.json models.providers 配置
 *   2. 为每个 provider+model 构建标准化能力标签
 *   3. 维护健康状态（成功/失败/排除）
 */

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = '/root/.openclaw/openclaw.json';
const CACHE_TTL = 60_000; // 1分钟配置缓存

// ─── 能力推断表 ─────────────────────────────────────────────────────

const CAPABILITY_INFERENCE = {
  // 按模型 id 模式匹配推断能力
  'embedding': { chat: false, embedding: true, vision: false, code: false, reasoning: false },
  'glm-4v':    { chat: true,  embedding: false, vision: true,  code: false, reasoning: false },
  'glm-5':     { chat: true,  embedding: false, vision: false, code: true,  reasoning: true },
  'claude-opus-4-6-thinking':   { chat: true, embedding: false, vision: true, code: true, reasoning: true },
  'claude-opus-4-6':            { chat: true, embedding: false, vision: true, code: true, reasoning: false },
  'claude-sonnet-4-6-thinking': { chat: true, embedding: false, vision: true, code: true, reasoning: true },
  'claude-sonnet-4-6':          { chat: true, embedding: false, vision: true, code: true, reasoning: false },
  'gpt-5.3-codex':              { chat: true, embedding: false, vision: true, code: true, reasoning: true },
};

// 质量评分（数字越大越强）
const QUALITY_SCORE = {
  'claude-opus-4-6-thinking': 100,
  'claude-opus-4-6': 95,
  'gpt-5.3-codex': 90,
  'claude-sonnet-4-6-thinking': 85,
  'claude-sonnet-4-6': 80,
  'glm-5': 70,
  'glm-4v-plus': 65,
  'embedding-3': 50,
};

// 成本评分（数字越小越便宜）
const COST_SCORE = {
  'glm-5': 10,
  'glm-4v-plus': 15,
  'embedding-3': 5,
  'claude-sonnet-4-6': 40,
  'claude-sonnet-4-6-thinking': 50,
  'claude-opus-4-6': 80,
  'claude-opus-4-6-thinking': 100,
  'gpt-5.3-codex': 60,
};

// 速度评分（数字越小越快）
const SPEED_SCORE = {
  'glm-5': 20,
  'embedding-3': 10,
  'glm-4v-plus': 30,
  'claude-sonnet-4-6': 25,
  'claude-sonnet-4-6-thinking': 40,
  'claude-opus-4-6': 50,
  'claude-opus-4-6-thinking': 70,
  'gpt-5.3-codex': 35,
};

function inferCapabilities(modelId) {
  // 精确匹配
  if (CAPABILITY_INFERENCE[modelId]) return { ...CAPABILITY_INFERENCE[modelId] };
  // 前缀匹配
  for (const [prefix, caps] of Object.entries(CAPABILITY_INFERENCE)) {
    if (modelId.startsWith(prefix)) return { ...caps };
  }
  // 默认: chat only
  return { chat: true, embedding: false, vision: false, code: false, reasoning: false };
}

// ─── 健康状态管理 ────────────────────────────────────────────────────

class HealthTracker {
  constructor() {
    // key: `${providerName}/${modelId}`
    this._state = new Map();
  }

  _key(providerName, modelId) {
    return `${providerName}/${modelId}`;
  }

  recordSuccess(providerName, modelId) {
    const k = this._key(providerName, modelId);
    this._state.set(k, {
      lastSuccess: Date.now(),
      lastError: this._state.get(k)?.lastError || null,
      errorCount: 0,
      excludedUntil: 0,
    });
  }

  recordError(providerName, modelId, error) {
    const k = this._key(providerName, modelId);
    const prev = this._state.get(k) || { lastSuccess: null, lastError: null, errorCount: 0, excludedUntil: 0 };
    prev.errorCount += 1;
    prev.lastError = { time: Date.now(), message: String(error?.message || error) };
    // 连续3次错误 → 排除60秒
    if (prev.errorCount >= 3) {
      prev.excludedUntil = Date.now() + 60_000;
    }
    this._state.set(k, prev);
  }

  isHealthy(providerName, modelId) {
    const k = this._key(providerName, modelId);
    const s = this._state.get(k);
    if (!s) return true; // 未知 → 假设健康
    if (s.excludedUntil && Date.now() < s.excludedUntil) return false;
    // 排除时间过了 → 重新允许（但保留 errorCount，下次失败立即排除）
    return true;
  }

  getState(providerName, modelId) {
    return this._state.get(this._key(providerName, modelId)) || null;
  }

  reset(providerName, modelId) {
    this._state.delete(this._key(providerName, modelId));
  }

  resetAll() {
    this._state.clear();
  }
}

// ─── Provider 注册表 ─────────────────────────────────────────────────

class ProviderRegistry {
  constructor(configPath) {
    this._configPath = configPath || CONFIG_PATH;
    this._cache = null;
    this._cacheTime = 0;
    this._entries = null; // Flattened provider+model entries
    this.health = new HealthTracker();
  }

  /**
   * 从 openclaw.json 加载配置（带缓存）
   */
  _loadConfig() {
    const now = Date.now();
    if (this._cache && (now - this._cacheTime) < CACHE_TTL) return this._cache;
    const raw = fs.readFileSync(this._configPath, 'utf8');
    this._cache = JSON.parse(raw);
    this._cacheTime = now;
    this._entries = null; // 清除展平缓存
    return this._cache;
  }

  /**
   * 获取所有展平后的 Provider+Model 条目
   * 每个条目: { providerName, baseUrl, apiKey, api, modelId, modelName, capabilities, contextWindow, maxTokens, quality, cost, speed }
   */
  getEntries() {
    if (this._entries) return this._entries;

    const config = this._loadConfig();
    const providers = config?.models?.providers || {};
    const entries = [];

    for (const [providerName, providerConfig] of Object.entries(providers)) {
      const { baseUrl, apiKey, api, models } = providerConfig;
      if (!models || !Array.isArray(models)) continue;

      for (const model of models) {
        const modelId = model.id;
        const capabilities = inferCapabilities(modelId);
        
        entries.push({
          providerName,
          baseUrl: (baseUrl || '').replace(/\/+$/, ''),
          apiKey,
          api: api || 'openai-completions',
          modelId,
          modelName: model.name || modelId,
          capabilities,
          contextWindow: model.contextWindow || 8192,
          maxTokens: model.maxTokens || 4096,
          reasoning: model.reasoning || false,
          quality: QUALITY_SCORE[modelId] || 50,
          cost: COST_SCORE[modelId] || 50,
          speed: SPEED_SCORE[modelId] || 50,
        });
      }
    }

    this._entries = entries;
    return entries;
  }

  /**
   * 按条件筛选可用条目
   */
  filter({ capability, minContext, excludeUnhealthy = true } = {}) {
    let entries = this.getEntries();

    // 按能力过滤
    if (capability) {
      entries = entries.filter(e => e.capabilities[capability]);
    }

    // 按最小上下文窗口过滤
    if (minContext) {
      entries = entries.filter(e => e.contextWindow >= minContext);
    }

    // 排除不健康的
    if (excludeUnhealthy) {
      entries = entries.filter(e => this.health.isHealthy(e.providerName, e.modelId));
    }

    return entries;
  }

  /**
   * 清除缓存，强制下次重新读取配置
   */
  invalidateCache() {
    this._cache = null;
    this._cacheTime = 0;
    this._entries = null;
  }
}

module.exports = {
  ProviderRegistry,
  HealthTracker,
  inferCapabilities,
  QUALITY_SCORE,
  COST_SCORE,
  SPEED_SCORE,
  CONFIG_PATH,
};
