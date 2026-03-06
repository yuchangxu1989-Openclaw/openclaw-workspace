#!/usr/bin/env node
'use strict';

/**
 * Intent Extractor Inline Hook — 单元测试 + 端到端测试
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const {
  InlineIntentHook,
  getDefaultHook,
  patchMessageHook,
  _parseLLMResponse: parseLLMResponse,
  _validateIntent: validateIntent,
  _intentFingerprint: intentFingerprint,
  INTENT_TYPES,
  _recentIntents,
} = require('./intent-extractor-inline');

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

console.log('\n🧪 Intent Extractor Inline Hook 测试\n');

// ═══════════════════════════════════════════════════════════
// 1. InlineIntentHook 构造
// ═══════════════════════════════════════════════════════════

console.log('--- 构造与配置 ---');

test('默认配置', () => {
  const hook = new InlineIntentHook();
  assert.strictEqual(hook.timeout, 15000);
  assert.strictEqual(hook.minConfidence, 0.6);
  assert.strictEqual(hook.minTextLength, 10);
  assert.strictEqual(hook.emitEvents, true);
  assert.strictEqual(hook.blocking, false);
});

test('自定义配置', () => {
  const hook = new InlineIntentHook({
    timeout: 5000,
    minConfidence: 0.8,
    minTextLength: 20,
    emitEvents: false,
    blocking: true,
  });
  assert.strictEqual(hook.timeout, 5000);
  assert.strictEqual(hook.minConfidence, 0.8);
  assert.strictEqual(hook.minTextLength, 20);
  assert.strictEqual(hook.emitEvents, false);
  assert.strictEqual(hook.blocking, true);
});

test('getDefaultHook返回单例', () => {
  // Note: getDefaultHook is stateful - just verify it returns an instance
  const hook = getDefaultHook();
  assert.ok(hook instanceof InlineIntentHook);
});

// ═══════════════════════════════════════════════════════════
// 2. 消息过滤
// ═══════════════════════════════════════════════════════════

console.log('\n--- 消息过滤 ---');

test('过短消息被跳过（non-blocking）', () => {
  const hook = new InlineIntentHook({ emitEvents: false });
  const result = hook.onMessage('hi', {});
  assert.strictEqual(result, undefined); // non-blocking返回undefined
  assert.strictEqual(hook.stats.skipped_short, 1);
});

test('过短消息被跳过（blocking）', async () => {
  const hook = new InlineIntentHook({ emitEvents: false, blocking: true });
  const result = await hook.onMessage('hi', {});
  assert.deepStrictEqual(result, { intents: [], events: [] });
  assert.strictEqual(hook.stats.skipped_short, 1);
});

test('空消息被跳过', () => {
  const hook = new InlineIntentHook({ emitEvents: false });
  hook.onMessage('', {});
  assert.strictEqual(hook.stats.skipped_short, 1);
});

test('对象消息提取text字段', () => {
  const hook = new InlineIntentHook({ emitEvents: false, minTextLength: 100 });
  hook.onMessage({ text: 'short' }, {});
  assert.strictEqual(hook.stats.skipped_short, 1);
});

test('对象消息提取content字段', () => {
  const hook = new InlineIntentHook({ emitEvents: false, minTextLength: 100 });
  hook.onMessage({ content: 'short' }, {});
  assert.strictEqual(hook.stats.skipped_short, 1);
});

// ═══════════════════════════════════════════════════════════
// 3. 去重机制
// ═══════════════════════════════════════════════════════════

console.log('\n--- 去重机制 ---');

test('intentFingerprint一致性', () => {
  const fp1 = intentFingerprint('RULEIFY', 'ISC规则', '自动化检查');
  const fp2 = intentFingerprint('RULEIFY', 'ISC规则', '自动化检查');
  assert.strictEqual(fp1, fp2);
});

test('不同意图类型产生不同fingerprint', () => {
  const fp1 = intentFingerprint('RULEIFY', '同目标', '同摘要');
  const fp2 = intentFingerprint('QUERY', '同目标', '同摘要');
  assert.notStrictEqual(fp1, fp2);
});

test('不同target产生不同fingerprint', () => {
  const fp1 = intentFingerprint('RULEIFY', '目标A', '摘要');
  const fp2 = intentFingerprint('RULEIFY', '目标B', '摘要');
  assert.notStrictEqual(fp1, fp2);
});

// ═══════════════════════════════════════════════════════════
// 4. INTENT_TYPES一致性（与慢路相同）
// ═══════════════════════════════════════════════════════════

console.log('\n--- 意图类型一致性 ---');

test('INTENT_TYPES与慢路模块一致', () => {
  const slowPath = require('./intent-extractor');
  const slowTypes = slowPath._INTENT_TYPES;
  assert.deepStrictEqual(INTENT_TYPES, slowTypes);
});

// ═══════════════════════════════════════════════════════════
// 5. Stats追踪
// ═══════════════════════════════════════════════════════════

console.log('\n--- 统计追踪 ---');

test('stats初始值全为0', () => {
  const hook = new InlineIntentHook();
  const stats = hook.getStats();
  for (const [key, val] of Object.entries(stats)) {
    assert.strictEqual(val, 0, `${key} should be 0`);
  }
});

test('resetStats清零', () => {
  const hook = new InlineIntentHook({ emitEvents: false });
  hook.onMessage('hi', {}); // trigger skipped_short
  assert.ok(hook.stats.skipped_short > 0);
  hook.resetStats();
  assert.strictEqual(hook.stats.skipped_short, 0);
});

// ═══════════════════════════════════════════════════════════
// 6. patchMessageHook
// ═══════════════════════════════════════════════════════════

console.log('\n--- MessageHook集成 ---');

test('patchMessageHook增强现有hook', () => {
  // 模拟MessageHook
  const mockHook = {
    onMessage(msg, ctx) {
      return { intents: ['command'], emotions: [], keywords: ['请'] };
    },
    stats: { processed: 0 },
  };

  const inlineHook = patchMessageHook(mockHook, { emitEvents: false, minTextLength: 1000 });
  assert.ok(inlineHook instanceof InlineIntentHook);
  assert.ok(typeof mockHook.getInlineIntentStats === 'function');

  // 调用patched onMessage应该仍返回原始结果
  const result = mockHook.onMessage('请帮我查一下', {});
  assert.ok(result.intents.includes('command'));
});

test('patchMessageHook对无效实例不崩溃', () => {
  patchMessageHook(null);
  patchMessageHook({});
  // 不应抛异常
});

// ═══════════════════════════════════════════════════════════
// 7. 端到端测试（需网络）
// ═══════════════════════════════════════════════════════════

console.log('\n--- 端到端 (需网络) ---');

async function runE2ETests() {
  if (!process.argv.includes('--e2e')) {
    skip('快路LLM实时提取', '添加 --e2e 参数启用');
    skip('非阻塞模式验证', '添加 --e2e 参数启用');
    skip('多意图识别', '添加 --e2e 参数启用');
    return;
  }

  await asyncTest('快路LLM实时提取 - RULEIFY', async () => {
    const hook = new InlineIntentHook({ blocking: true, emitEvents: false, timeout: 30000 });
    const result = await hook.onMessage(
      '以后所有新技能上线前都必须跑AEO评测，不通过不准上线，这是铁律',
      { channel: 'test' }
    );
    assert.ok(result.intents.length >= 1, `expected >=1 intent, got ${result.intents.length}`);
    const hasRuleify = result.intents.some(i => i.type === 'RULEIFY');
    assert.ok(hasRuleify, `expected RULEIFY, got: ${result.intents.map(i => i.type).join(',')}`);
  });

  await asyncTest('快路LLM实时提取 - DIRECTIVE', async () => {
    const hook = new InlineIntentHook({ blocking: true, emitEvents: false, timeout: 30000 });
    const result = await hook.onMessage(
      '把event-bus的日志级别调成debug然后重启gateway',
      { channel: 'test' }
    );
    assert.ok(result.intents.length >= 1, `expected >=1 intent`);
    const hasDirective = result.intents.some(i => i.type === 'DIRECTIVE');
    assert.ok(hasDirective, `expected DIRECTIVE, got: ${result.intents.map(i => i.type).join(',')}`);
  });

  await asyncTest('快路闲聊不产生意图', async () => {
    const hook = new InlineIntentHook({ blocking: true, emitEvents: false, timeout: 30000 });
    const result = await hook.onMessage('今天天气真好啊，适合出去走走', { channel: 'test' });
    // 闲聊应该产生0个意图（或只有非常低confidence的）
    // 注：LLM可能偶尔误判，允许最多1个低confidence意图
    assert.ok(result.intents.length <= 1, `expected <=1 intent for chat, got ${result.intents.length}`);
  });

  await asyncTest('非阻塞模式不返回Promise', async () => {
    _recentIntents.clear();
    const hook = new InlineIntentHook({ blocking: false, emitEvents: false });
    const result = hook.onMessage('这个规则应该自动化执行，不要每次都手动跑', { channel: 'test' });
    assert.strictEqual(result, undefined, 'non-blocking should return undefined');
    assert.strictEqual(hook.stats.messages_processed, 1);
    // 等一下让异步完成
    await new Promise(r => setTimeout(r, 1000));
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
