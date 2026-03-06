#!/usr/bin/env node
'use strict';

/**
 * Intent Extractor 单元测试
 *
 * 测试覆盖：
 *   1. chunk分割逻辑
 *   2. LLM响应解析（健壮性）
 *   3. 意图验证
 *   4. 增量游标
 *   5. LLM provider选择
 *   6. 端到端烟雾测试（需要网络）
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

// 被测模块
const {
  _splitIntoChunks: splitIntoChunks,
  _parseLLMResponse: parseLLMResponse,
  _validateIntent: validateIntent,
  _INTENT_TYPES: INTENT_TYPES,
  _SYSTEM_PROMPT: SYSTEM_PROMPT,
} = require('./intent-extractor');

const {
  _selectProvider: selectProvider,
  _loadProviders: loadProviders,
} = require('./intent-extractor-llm');

let passed = 0;
let failed = 0;
let skipped = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ❌ ${name}: ${e.message}`);
  }
}

function skip(name, reason) {
  skipped++;
  console.log(`  ⏭️ ${name} (${reason})`);
}

async function asyncTest(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ❌ ${name}: ${e.message}`);
  }
}

console.log('\n🧪 Intent Extractor 单元测试\n');

// ═══════════════════════════════════════════════════════════
// 1. chunk分割
// ═══════════════════════════════════════════════════════════

console.log('--- chunk分割 ---');

test('空文本返回空数组', () => {
  assert.deepStrictEqual(splitIntoChunks('', 100), []);
  assert.deepStrictEqual(splitIntoChunks(null, 100), []);
});

test('短文本返回单个chunk', () => {
  const chunks = splitIntoChunks('Hello world', 100);
  assert.strictEqual(chunks.length, 1);
  assert.strictEqual(chunks[0], 'Hello world');
});

test('长文本按段落边界分割', () => {
  const text = 'Para 1 is here.\n\nPara 2 is here.\n\nPara 3 is here.';
  const chunks = splitIntoChunks(text, 25);
  assert.ok(chunks.length >= 2, `expected >=2 chunks, got ${chunks.length}`);
  // 所有段落内容应该被保留
  const combined = chunks.join(' ');
  assert.ok(combined.includes('Para 1'));
  assert.ok(combined.includes('Para 3'));
});

test('chunk不超过maxLen（大致）', () => {
  const paras = [];
  for (let i = 0; i < 20; i++) {
    paras.push(`Paragraph ${i}: ${'x'.repeat(80)}`);
  }
  const text = paras.join('\n\n');
  const chunks = splitIntoChunks(text, 300);
  for (const chunk of chunks) {
    // 允许少量超出（由于段落不可分割）
    assert.ok(chunk.length < 600, `chunk too long: ${chunk.length}`);
  }
});

// ═══════════════════════════════════════════════════════════
// 2. LLM响应解析
// ═══════════════════════════════════════════════════════════

console.log('\n--- LLM响应解析 ---');

test('解析标准JSON响应', () => {
  const response = JSON.stringify({
    intents: [{
      type: 'RULEIFY',
      target: 'ISC规则',
      summary: '用户想将检查规则化',
      confidence: 0.85,
      evidence: '这应该每次都自动检查',
    }]
  });
  const intents = parseLLMResponse(response);
  assert.strictEqual(intents.length, 1);
  assert.strictEqual(intents[0].type, 'RULEIFY');
  assert.strictEqual(intents[0].confidence, 0.85);
});

test('解析markdown代码块包裹的JSON', () => {
  const response = '```json\n{"intents": [{"type": "QUERY", "target": "系统状态", "summary": "查询状态", "confidence": 0.7}]}\n```';
  const intents = parseLLMResponse(response);
  assert.strictEqual(intents.length, 1);
  assert.strictEqual(intents[0].type, 'QUERY');
});

test('解析带前后文字的JSON', () => {
  const response = 'Here is the analysis:\n\n{"intents": [{"type": "FEEDBACK", "target": "AI", "summary": "正面评价", "confidence": 0.9, "sentiment": "positive"}]}\n\nDone.';
  const intents = parseLLMResponse(response);
  assert.strictEqual(intents.length, 1);
  assert.strictEqual(intents[0].type, 'FEEDBACK');
});

test('空意图列表', () => {
  const response = '{"intents": []}';
  const intents = parseLLMResponse(response);
  assert.strictEqual(intents.length, 0);
});

test('无效JSON graceful处理', () => {
  const intents = parseLLMResponse('This is not JSON at all');
  assert.strictEqual(intents.length, 0);
});

test('null/undefined graceful处理', () => {
  assert.deepStrictEqual(parseLLMResponse(null), []);
  assert.deepStrictEqual(parseLLMResponse(undefined), []);
  assert.deepStrictEqual(parseLLMResponse(''), []);
});

test('过滤无效意图类型', () => {
  const response = JSON.stringify({
    intents: [
      { type: 'INVALID_TYPE', target: 'x', summary: 's', confidence: 0.8 },
      { type: 'RULEIFY', target: 'x', summary: 's', confidence: 0.8 },
    ]
  });
  const intents = parseLLMResponse(response);
  assert.strictEqual(intents.length, 1);
  assert.strictEqual(intents[0].type, 'RULEIFY');
});

test('过滤缺少必要字段的意图', () => {
  const response = JSON.stringify({
    intents: [
      { type: 'RULEIFY' },  // 缺少summary和confidence
      { type: 'QUERY', target: 'x', summary: '查询', confidence: 0.7 },
    ]
  });
  const intents = parseLLMResponse(response);
  assert.strictEqual(intents.length, 1);
  assert.strictEqual(intents[0].type, 'QUERY');
});

test('一句话多意图', () => {
  const response = JSON.stringify({
    intents: [
      { type: 'FEEDBACK', target: '规则', summary: '做得好', confidence: 0.8, sentiment: 'positive' },
      { type: 'RULEIFY', target: '规则', summary: '以后都这样', confidence: 0.75 },
    ]
  });
  const intents = parseLLMResponse(response);
  assert.strictEqual(intents.length, 2);
});

// ═══════════════════════════════════════════════════════════
// 3. 意图验证
// ═══════════════════════════════════════════════════════════

console.log('\n--- 意图验证 ---');

test('有效意图通过验证', () => {
  assert.ok(validateIntent({
    type: 'RULEIFY', target: 'x', summary: '规则化', confidence: 0.8,
  }));
  assert.ok(validateIntent({
    type: 'QUERY', target: 'y', summary: '查询', confidence: 0.6,
  }));
  assert.ok(validateIntent({
    type: 'FEEDBACK', target: 'z', summary: '反馈', confidence: 1.0,
  }));
  assert.ok(validateIntent({
    type: 'DIRECTIVE', target: 'a', summary: '指令', confidence: 0.7,
  }));
  assert.ok(validateIntent({
    type: 'REFLECT', target: 'b', summary: '反思', confidence: 0.9,
  }));
});

test('无效类型被拒绝', () => {
  assert.ok(!validateIntent({
    type: 'INVALID', target: 'x', summary: 's', confidence: 0.8,
  }));
});

test('confidence超范围被拒绝', () => {
  assert.ok(!validateIntent({
    type: 'RULEIFY', target: 'x', summary: 's', confidence: 1.5,
  }));
  assert.ok(!validateIntent({
    type: 'RULEIFY', target: 'x', summary: 's', confidence: -0.1,
  }));
});

test('缺少summary被拒绝', () => {
  assert.ok(!validateIntent({
    type: 'RULEIFY', target: 'x', confidence: 0.8,
  }));
});

test('null/undefined被拒绝', () => {
  assert.ok(!validateIntent(null));
  assert.ok(!validateIntent(undefined));
  assert.ok(!validateIntent('string'));
});

// ═══════════════════════════════════════════════════════════
// 4. INTENT_TYPES完整性
// ═══════════════════════════════════════════════════════════

console.log('\n--- 意图类型注册 ---');

test('五种意图类型都已注册', () => {
  assert.strictEqual(Object.keys(INTENT_TYPES).length, 5);
  assert.strictEqual(INTENT_TYPES.RULEIFY, 'intent.ruleify');
  assert.strictEqual(INTENT_TYPES.QUERY, 'intent.query');
  assert.strictEqual(INTENT_TYPES.FEEDBACK, 'intent.feedback');
  assert.strictEqual(INTENT_TYPES.DIRECTIVE, 'intent.directive');
  assert.strictEqual(INTENT_TYPES.REFLECT, 'intent.reflect');
});

test('所有事件类型以intent.开头', () => {
  for (const [key, val] of Object.entries(INTENT_TYPES)) {
    assert.ok(val.startsWith('intent.'), `${key} → ${val} should start with intent.`);
  }
});

// ═══════════════════════════════════════════════════════════
// 5. LLM Provider选择
// ═══════════════════════════════════════════════════════════

console.log('\n--- LLM Provider ---');

test('loadProviders返回非空对象', () => {
  const providers = loadProviders();
  assert.ok(typeof providers === 'object');
  assert.ok(Object.keys(providers).length > 0, 'should have at least 1 provider');
});

test('selectProvider选到可用provider', () => {
  const selected = selectProvider();
  assert.ok(selected, 'should select a provider');
  assert.ok(selected.providerName, 'should have providerName');
  assert.ok(selected.model, 'should have model');
  assert.ok(selected.model.id, 'model should have id');
  assert.ok(selected.provider.baseUrl, 'provider should have baseUrl');
  assert.ok(selected.provider.apiKey, 'provider should have apiKey');
  console.log(`    → 选中: ${selected.providerName}/${selected.model.id}`);
});

// ═══════════════════════════════════════════════════════════
// 6. 端到端烟雾测试（可选，需网络）
// ═══════════════════════════════════════════════════════════

console.log('\n--- 端到端 (需网络) ---');

async function runE2ETests() {
  if (!process.argv.includes('--e2e')) {
    skip('LLM调用烟雾测试', '添加 --e2e 参数启用');
    skip('真实意图提取', '添加 --e2e 参数启用');
    return;
  }

  const { callLLM } = require('./intent-extractor-llm');

  await asyncTest('LLM调用烟雾测试', async () => {
    const response = await callLLM(
      SYSTEM_PROMPT,
      '分析以下对话片段：\n\n用户说"这个检查逻辑以后都应该自动运行，别让我每次手动跑"\nAgent回答"好的，我来设置自动化。"',
      { timeout: 30000 }
    );
    assert.ok(response, 'should get response');
    const intents = parseLLMResponse(response);
    // 至少能解析为JSON（即使没有意图）
    assert.ok(Array.isArray(intents), 'should parse into array');
  });

  await asyncTest('真实意图提取 - RULEIFY', async () => {
    const response = await callLLM(
      SYSTEM_PROMPT,
      '分析以下对话片段：\n\n用户："我觉得所有新建的技能都应该先跑一遍AEO评测，不通过不能上线，这应该是铁律"\nAgent："这个建议很好，我可以创建一条ISC规则来强制执行。"',
      { timeout: 30000 }
    );
    const intents = parseLLMResponse(response);
    assert.ok(intents.length >= 1, `expected >=1 intent, got ${intents.length}: ${response.slice(0, 300)}`);
    const hasRuleify = intents.some(i => i.type === 'RULEIFY');
    assert.ok(hasRuleify, `expected RULEIFY intent, got: ${intents.map(i => i.type).join(',')}`);
  });
}

// ═══════════════════════════════════════════════════════════
// 运行
// ═══════════════════════════════════════════════════════════

runE2ETests().then(() => {
  console.log(`\n📊 结果: ${passed} passed, ${failed} failed, ${skipped} skipped, ${passed + failed + skipped} total`);
  process.exit(failed > 0 ? 1 : 0);
}).catch(err => {
  console.error('测试执行错误:', err);
  process.exit(1);
});
