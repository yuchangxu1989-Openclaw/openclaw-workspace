'use strict';

/**
 * LLM Context Layer — Unit Tests
 * 
 * 覆盖：
 *   - Provider 注册和发现
 *   - 能力推断
 *   - 路由选择（按 capability 过滤、按 priority 排序）
 *   - 自动 fallback（模拟 Provider 失败）
 *   - 健康检查（连续失败后排除、恢复后重新加入）
 *   - requirements 匹配（minContext、capability）
 *   - 配置读取
 *   - 技能调用标准接口
 */

const fs = require('fs');
const path = require('path');
const { test } = require('node:test');
const assert = require('node:assert/strict');

// ─── Test Fixtures ──────────────────────────────────────────────────

const TEST_CONFIG_PATH = path.join(__dirname, 'flags.json').replace('flags.json', '_test-llm-config.json');

const TEST_CONFIG = {
  models: {
    providers: {
      'test-fast': {
        baseUrl: 'https://fast.example.com/v1',
        apiKey: 'sk-fast-key',
        api: 'openai-completions',
        models: [
          { id: 'fast-chat-1', name: 'Fast Chat', contextWindow: 8192, maxTokens: 2048 },
        ],
      },
      'test-quality': {
        baseUrl: 'https://quality.example.com',
        apiKey: 'sk-quality-key',
        api: 'anthropic-messages',
        models: [
          { id: 'claude-opus-4-6-thinking', name: 'Claude Opus Thinking', reasoning: true, contextWindow: 200000, maxTokens: 16384 },
          { id: 'claude-sonnet-4-6', name: 'Claude Sonnet', contextWindow: 200000, maxTokens: 8192 },
        ],
      },
      'test-cheap': {
        baseUrl: 'https://cheap.example.com/v1',
        apiKey: 'sk-cheap-key',
        api: 'openai-completions',
        models: [
          { id: 'glm-5', name: 'GLM-5', contextWindow: 128000, maxTokens: 4096 },
        ],
      },
      'test-embedding': {
        baseUrl: 'https://embed.example.com/v1',
        apiKey: 'sk-embed-key',
        api: 'openai-completions',
        models: [
          { id: 'embedding-3', name: 'Embedding 3', contextWindow: 8192, maxTokens: 0 },
        ],
      },
      'test-vision': {
        baseUrl: 'https://vision.example.com/v1',
        apiKey: 'sk-vision-key',
        api: 'openai-completions',
        models: [
          { id: 'glm-4v-plus', name: 'GLM-4V Plus', contextWindow: 8192, maxTokens: 4096 },
        ],
      },
    },
  },
};

function setupTestConfig() {
  fs.writeFileSync(TEST_CONFIG_PATH, JSON.stringify(TEST_CONFIG, null, 2));
}

function cleanupTestConfig() {
  try { fs.unlinkSync(TEST_CONFIG_PATH); } catch (_) {}
}

// ─── Provider Registry Tests ────────────────────────────────────────

test('Provider Registry: discovers all providers from config', (t) => {
  setupTestConfig();
  t.after(cleanupTestConfig);

  const { ProviderRegistry } = require(path.join(__dirname, '../../infrastructure/llm-context/providers'));
  const registry = new ProviderRegistry(TEST_CONFIG_PATH);
  const entries = registry.getEntries();

  assert.ok(entries.length >= 5, `Expected at least 5 entries, got ${entries.length}`);
  
  const providerNames = [...new Set(entries.map(e => e.providerName))];
  assert.ok(providerNames.includes('test-fast'), 'test-fast provider discovered');
  assert.ok(providerNames.includes('test-quality'), 'test-quality provider discovered');
  assert.ok(providerNames.includes('test-cheap'), 'test-cheap provider discovered');
  assert.ok(providerNames.includes('test-embedding'), 'test-embedding provider discovered');
});

test('Provider Registry: each entry has required fields', (t) => {
  setupTestConfig();
  t.after(cleanupTestConfig);

  const { ProviderRegistry } = require(path.join(__dirname, '../../infrastructure/llm-context/providers'));
  const registry = new ProviderRegistry(TEST_CONFIG_PATH);
  const entries = registry.getEntries();

  for (const e of entries) {
    assert.ok(e.providerName, 'has providerName');
    assert.ok(e.baseUrl, 'has baseUrl');
    assert.ok(e.apiKey, 'has apiKey');
    assert.ok(e.modelId, 'has modelId');
    assert.ok(e.capabilities, 'has capabilities');
    assert.equal(typeof e.contextWindow, 'number', 'contextWindow is number');
    assert.equal(typeof e.quality, 'number', 'quality is number');
    assert.equal(typeof e.cost, 'number', 'cost is number');
    assert.equal(typeof e.speed, 'number', 'speed is number');
  }
});

test('Provider Registry: infers capabilities correctly', (t) => {
  const { inferCapabilities } = require(path.join(__dirname, '../../infrastructure/llm-context/providers'));

  const glm5 = inferCapabilities('glm-5');
  assert.equal(glm5.chat, true);
  assert.equal(glm5.code, true);
  assert.equal(glm5.reasoning, true);
  assert.equal(glm5.embedding, false);

  const embed = inferCapabilities('embedding-3');
  assert.equal(embed.embedding, true);
  assert.equal(embed.chat, false);

  const opus = inferCapabilities('claude-opus-4-6-thinking');
  assert.equal(opus.chat, true);
  assert.equal(opus.vision, true);
  assert.equal(opus.reasoning, true);
  assert.equal(opus.code, true);

  const vision = inferCapabilities('glm-4v-plus');
  assert.equal(vision.vision, true);
  assert.equal(vision.chat, true);

  // Unknown model → defaults to chat only
  const unknown = inferCapabilities('some-unknown-model');
  assert.equal(unknown.chat, true);
  assert.equal(unknown.embedding, false);
});

test('Provider Registry: filters by capability', (t) => {
  setupTestConfig();
  t.after(cleanupTestConfig);

  const { ProviderRegistry } = require(path.join(__dirname, '../../infrastructure/llm-context/providers'));
  const registry = new ProviderRegistry(TEST_CONFIG_PATH);

  const embeddings = registry.filter({ capability: 'embedding' });
  assert.ok(embeddings.length >= 1, 'Found embedding providers');
  assert.ok(embeddings.every(e => e.capabilities.embedding), 'All have embedding capability');

  const reasoning = registry.filter({ capability: 'reasoning' });
  assert.ok(reasoning.length >= 2, 'Found reasoning providers');
  assert.ok(reasoning.every(e => e.capabilities.reasoning), 'All have reasoning capability');

  const vision = registry.filter({ capability: 'vision' });
  assert.ok(vision.length >= 1, 'Found vision providers');
});

test('Provider Registry: filters by minContext', (t) => {
  setupTestConfig();
  t.after(cleanupTestConfig);

  const { ProviderRegistry } = require(path.join(__dirname, '../../infrastructure/llm-context/providers'));
  const registry = new ProviderRegistry(TEST_CONFIG_PATH);

  const large = registry.filter({ minContext: 100000 });
  assert.ok(large.every(e => e.contextWindow >= 100000), 'All have >= 100K context');
  
  const small = registry.filter({ minContext: 4096 });
  assert.ok(small.length > large.length, 'More providers with smaller context requirement');
});

// ─── Health Tracker Tests ───────────────────────────────────────────

test('Health Tracker: initially healthy', (t) => {
  const { HealthTracker } = require(path.join(__dirname, '../../infrastructure/llm-context/providers'));
  const ht = new HealthTracker();

  assert.equal(ht.isHealthy('any', 'model'), true, 'Unknown provider is healthy');
});

test('Health Tracker: excludes after 3 consecutive errors', (t) => {
  const { HealthTracker } = require(path.join(__dirname, '../../infrastructure/llm-context/providers'));
  const ht = new HealthTracker();

  ht.recordError('p1', 'm1', new Error('fail 1'));
  assert.equal(ht.isHealthy('p1', 'm1'), true, 'Still healthy after 1 error');
  
  ht.recordError('p1', 'm1', new Error('fail 2'));
  assert.equal(ht.isHealthy('p1', 'm1'), true, 'Still healthy after 2 errors');
  
  ht.recordError('p1', 'm1', new Error('fail 3'));
  assert.equal(ht.isHealthy('p1', 'm1'), false, 'Excluded after 3 errors');
});

test('Health Tracker: recovers after exclusion period', (t) => {
  const { HealthTracker } = require(path.join(__dirname, '../../infrastructure/llm-context/providers'));
  const ht = new HealthTracker();

  // Simulate 3 errors
  ht.recordError('p1', 'm1', new Error('1'));
  ht.recordError('p1', 'm1', new Error('2'));
  ht.recordError('p1', 'm1', new Error('3'));
  assert.equal(ht.isHealthy('p1', 'm1'), false);

  // Manually set excludedUntil to past
  const state = ht.getState('p1', 'm1');
  state.excludedUntil = Date.now() - 1000;
  assert.equal(ht.isHealthy('p1', 'm1'), true, 'Recovered after exclusion period');
});

test('Health Tracker: success resets error count', (t) => {
  const { HealthTracker } = require(path.join(__dirname, '../../infrastructure/llm-context/providers'));
  const ht = new HealthTracker();

  ht.recordError('p1', 'm1', new Error('1'));
  ht.recordError('p1', 'm1', new Error('2'));
  ht.recordSuccess('p1', 'm1');
  ht.recordError('p1', 'm1', new Error('3'));
  
  // Only 1 error after reset, should still be healthy
  assert.equal(ht.isHealthy('p1', 'm1'), true, 'Healthy after success + 1 error');
});

// ─── Router Tests ───────────────────────────────────────────────────

test('Router: selects by priority=quality', (t) => {
  setupTestConfig();
  t.after(cleanupTestConfig);

  const { ProviderRegistry } = require(path.join(__dirname, '../../infrastructure/llm-context/providers'));
  const { Router } = require(path.join(__dirname, '../../infrastructure/llm-context/router'));
  const registry = new ProviderRegistry(TEST_CONFIG_PATH);
  const router = new Router(registry);

  const candidates = router.select({ capability: 'chat', priority: 'quality' });
  assert.ok(candidates.length >= 2, 'Has candidates');
  // First candidate should be highest quality
  assert.ok(candidates[0].quality >= candidates[1].quality, 'Sorted by quality desc');
});

test('Router: selects by priority=cost', (t) => {
  setupTestConfig();
  t.after(cleanupTestConfig);

  const { ProviderRegistry } = require(path.join(__dirname, '../../infrastructure/llm-context/providers'));
  const { Router } = require(path.join(__dirname, '../../infrastructure/llm-context/router'));
  const registry = new ProviderRegistry(TEST_CONFIG_PATH);
  const router = new Router(registry);

  const candidates = router.select({ capability: 'chat', priority: 'cost' });
  assert.ok(candidates.length >= 2, 'Has candidates');
  // First candidate should be cheapest
  assert.ok(candidates[0].cost <= candidates[1].cost, 'Sorted by cost asc');
});

test('Router: selects by priority=speed', (t) => {
  setupTestConfig();
  t.after(cleanupTestConfig);

  const { ProviderRegistry } = require(path.join(__dirname, '../../infrastructure/llm-context/providers'));
  const { Router } = require(path.join(__dirname, '../../infrastructure/llm-context/router'));
  const registry = new ProviderRegistry(TEST_CONFIG_PATH);
  const router = new Router(registry);

  const candidates = router.select({ capability: 'chat', priority: 'speed' });
  assert.ok(candidates.length >= 2, 'Has candidates');
  assert.ok(candidates[0].speed <= candidates[1].speed, 'Sorted by speed asc');
});

test('Router: fallback on failure', async (t) => {
  setupTestConfig();
  t.after(cleanupTestConfig);

  const { ProviderRegistry } = require(path.join(__dirname, '../../infrastructure/llm-context/providers'));
  const { Router } = require(path.join(__dirname, '../../infrastructure/llm-context/router'));
  const registry = new ProviderRegistry(TEST_CONFIG_PATH);
  const router = new Router(registry);

  let callCount = 0;
  const callFn = async (entry) => {
    callCount++;
    if (callCount < 3) throw new Error(`Provider ${entry.providerName} failed`);
    return { content: 'success from fallback', tokens: { total: 10 } };
  };

  const { result, attempts } = await router.executeWithFallback(callFn, { capability: 'chat', priority: 'cost' });
  assert.equal(result.content, 'success from fallback');
  assert.equal(attempts, 3, 'Took 3 attempts');
});

test('Router: throws when all providers fail', async (t) => {
  setupTestConfig();
  t.after(cleanupTestConfig);

  const { ProviderRegistry } = require(path.join(__dirname, '../../infrastructure/llm-context/providers'));
  const { Router } = require(path.join(__dirname, '../../infrastructure/llm-context/router'));
  const registry = new ProviderRegistry(TEST_CONFIG_PATH);
  const router = new Router(registry);

  const callFn = async (entry) => {
    throw new Error(`${entry.providerName} down`);
  };

  await assert.rejects(
    () => router.executeWithFallback(callFn, { capability: 'chat' }),
    /All .+ providers failed/,
    'Throws when all fail'
  );
});

test('Router: throws when no providers match requirements', async (t) => {
  setupTestConfig();
  t.after(cleanupTestConfig);

  const { ProviderRegistry } = require(path.join(__dirname, '../../infrastructure/llm-context/providers'));
  const { Router } = require(path.join(__dirname, '../../infrastructure/llm-context/router'));
  const registry = new ProviderRegistry(TEST_CONFIG_PATH);
  const router = new Router(registry);

  await assert.rejects(
    () => router.executeWithFallback(() => {}, { capability: 'embedding', minContext: 999999 }),
    /No provider available/,
    'Throws when no match'
  );
});

// ─── LLMContext Integration Tests ───────────────────────────────────

test('LLMContext: chat() routes correctly with mock', async (t) => {
  setupTestConfig();
  t.after(cleanupTestConfig);

  const { LLMContext } = require(path.join(__dirname, '../../infrastructure/llm-context'));
  const { ProviderRegistry } = require(path.join(__dirname, '../../infrastructure/llm-context/providers'));

  const registry = new ProviderRegistry(TEST_CONFIG_PATH);
  const mockHttp = async (entry, messages, opts) => {
    return {
      content: `Response from ${entry.providerName}/${entry.modelId}`,
      tokens: { prompt: 10, completion: 20, total: 30 },
    };
  };

  const llm = new LLMContext({ registry, _httpCall: mockHttp });

  const result = await llm.chat(
    [{ role: 'user', content: 'Hello' }],
    { capability: 'chat', priority: 'cost' }
  );

  assert.ok(result.content, 'Has content');
  assert.ok(result.model, 'Has model');
  assert.ok(result.provider, 'Has provider');
  assert.ok(result.tokens, 'Has tokens');
  assert.equal(typeof result.cost_estimate, 'number', 'Has cost_estimate');
});

test('LLMContext: chat() with priority=quality picks best model', async (t) => {
  setupTestConfig();
  t.after(cleanupTestConfig);

  const { LLMContext } = require(path.join(__dirname, '../../infrastructure/llm-context'));
  const { ProviderRegistry } = require(path.join(__dirname, '../../infrastructure/llm-context/providers'));

  const registry = new ProviderRegistry(TEST_CONFIG_PATH);
  const mockHttp = async (entry) => ({
    content: 'ok',
    tokens: { total: 10 },
  });

  const llm = new LLMContext({ registry, _httpCall: mockHttp });
  const result = await llm.chat(
    [{ role: 'user', content: 'Hello' }],
    { capability: 'reasoning', priority: 'quality' }
  );

  assert.equal(result.model, 'claude-opus-4-6-thinking', 'Picks highest quality reasoning model');
});

test('LLMContext: embed() routes to embedding provider', async (t) => {
  setupTestConfig();
  t.after(cleanupTestConfig);

  const { LLMContext } = require(path.join(__dirname, '../../infrastructure/llm-context'));
  const { ProviderRegistry } = require(path.join(__dirname, '../../infrastructure/llm-context/providers'));

  const registry = new ProviderRegistry(TEST_CONFIG_PATH);
  const mockEmbed = async (entry, text) => ({
    embedding: [0.1, 0.2, 0.3],
    tokens: { total: 5 },
  });

  const llm = new LLMContext({ registry, _httpEmbed: mockEmbed, _httpCall: () => { throw new Error('should not call httpCall'); } });
  const result = await llm.embed('test text');

  assert.deepEqual(result.embedding, [0.1, 0.2, 0.3]);
  assert.equal(result.model, 'embedding-3');
});

test('LLMContext: chat() validates messages', async (t) => {
  setupTestConfig();
  t.after(cleanupTestConfig);

  const { LLMContext } = require(path.join(__dirname, '../../infrastructure/llm-context'));
  const { ProviderRegistry } = require(path.join(__dirname, '../../infrastructure/llm-context/providers'));
  const registry = new ProviderRegistry(TEST_CONFIG_PATH);
  const llm = new LLMContext({ registry });

  await assert.rejects(
    () => llm.chat([], {}),
    /non-empty array/,
    'Rejects empty messages'
  );

  await assert.rejects(
    () => llm.chat('not an array', {}),
    /non-empty array/,
    'Rejects non-array'
  );
});

test('LLMContext: vision() builds correct message format', async (t) => {
  setupTestConfig();
  t.after(cleanupTestConfig);

  const { LLMContext } = require(path.join(__dirname, '../../infrastructure/llm-context'));
  const { ProviderRegistry } = require(path.join(__dirname, '../../infrastructure/llm-context/providers'));

  const registry = new ProviderRegistry(TEST_CONFIG_PATH);
  let capturedMessages = null;
  const mockHttp = async (entry, messages) => {
    capturedMessages = messages;
    return { content: 'I see a cat', tokens: { total: 15 } };
  };

  const llm = new LLMContext({ registry, _httpCall: mockHttp });
  const result = await llm.vision('https://example.com/cat.jpg', 'What is this?');

  assert.ok(capturedMessages);
  assert.equal(capturedMessages[0].role, 'user');
  assert.ok(Array.isArray(capturedMessages[0].content), 'Content is multimodal array');
  assert.equal(capturedMessages[0].content[0].type, 'image_url');
  assert.equal(capturedMessages[0].content[1].text, 'What is this?');
  assert.equal(result.content, 'I see a cat');
});

// ─── Config from openclaw.json ──────────────────────────────────────

test('Provider Registry: reads real openclaw.json', (t) => {
  const { ProviderRegistry, CONFIG_PATH } = require(path.join(__dirname, '../../infrastructure/llm-context/providers'));
  
  if (!fs.existsSync(CONFIG_PATH)) {
    t.skip('openclaw.json not found');
    return;
  }

  const registry = new ProviderRegistry();
  const entries = registry.getEntries();
  assert.ok(entries.length > 0, 'Found providers in openclaw.json');
  
  // Should find zhipu providers
  const zhipu = entries.filter(e => e.providerName.startsWith('zhipu'));
  assert.ok(zhipu.length >= 1, 'Found zhipu providers');
});

// ─── Convenience API (singleton) ────────────────────────────────────

test('Convenience API: chat/embed/vision are functions', (t) => {
  const llmContext = require(path.join(__dirname, '../../infrastructure/llm-context'));
  
  assert.equal(typeof llmContext.chat, 'function');
  assert.equal(typeof llmContext.embed, 'function');
  assert.equal(typeof llmContext.vision, 'function');
  assert.equal(typeof llmContext.createLLMContext, 'function');
});

console.log('\n✅ LLM Context Layer — all test definitions loaded\n');
