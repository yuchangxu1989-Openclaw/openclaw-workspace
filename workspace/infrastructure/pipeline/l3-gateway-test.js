#!/usr/bin/env node
'use strict';

/**
 * L3 Gateway 集成测试
 *
 * 验证：
 *   1. user.message 事件走 L3 全流程 (IntentScanner → RuleMatcher → Dispatcher v2)
 *   2. FeatureFlag 关闭后走旧路径
 *   3. L3 失败自动 fallback
 *   4. Shadow 模式双路径对比
 *
 * 运行：node l3-gateway-test.js
 */

const fs = require('fs');
const path = require('path');

// 清理旧日志
const LOG_DIR = __dirname;
try { fs.unlinkSync(path.join(LOG_DIR, 'l3-gateway.log.jsonl')); } catch (_) {}
try { fs.unlinkSync(path.join(LOG_DIR, 'l3-comparison.log.jsonl')); } catch (_) {}

// ─── 设置环境 ───
process.env.L3_MAINLINE_ENABLED = 'true';
process.env.L3_MAINLINE_EVENTS = 'user.message';
process.env.L3_SHADOW_MODE = 'false';
process.env.L3_FALLBACK_ENABLED = 'true';
process.env.L3_DECISIONLOG_ENABLED = 'false'; // 减少噪音

const gateway = require('./l3-gateway');
const busAdapter = require('../event-bus/bus-adapter');
const legacyBus = require('../event-bus/bus');

let passed = 0;
let failed = 0;

function assert(cond, name) {
  if (cond) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.error(`  ❌ ${name}`);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('\n═══ L3 Gateway 集成测试 ═══\n');

  // ────────────────────────────────────────────────────────
  // Test 1: FeatureFlag 检查
  // ────────────────────────────────────────────────────────
  console.log('── Test 1: FeatureFlag ──');
  {
    const flags = gateway.getGatewayFlags();
    assert(flags.enabled === true, 'T1.1: 总开关默认开启');
    assert(flags.events.includes('user.message'), 'T1.2: user.message 在事件列表中');
    assert(flags.shadowMode === false, 'T1.3: Shadow 模式默认关闭');
    assert(flags.fallbackEnabled === true, 'T1.4: Fallback 默认开启');
  }

  // ────────────────────────────────────────────────────────
  // Test 2: isL3Event 匹配
  // ────────────────────────────────────────────────────────
  console.log('\n── Test 2: 事件匹配 ──');
  {
    assert(gateway.isL3Event('user.message', ['user.message']) === true, 'T2.1: 精确匹配 user.message');
    assert(gateway.isL3Event('user.message.text', ['user.message']) === true, 'T2.2: 前缀匹配 user.message.text');
    assert(gateway.isL3Event('system.error', ['user.message']) === false, 'T2.3: 不匹配 system.error');
    assert(gateway.isL3Event('isc.rule.changed', ['isc.rule.*']) === true, 'T2.4: 通配匹配 isc.rule.changed');
    assert(gateway.isL3Event('anything', ['*']) === true, 'T2.5: 全通配');
  }

  // ────────────────────────────────────────────────────────
  // Test 3: processEventL3 单事件处理
  // ────────────────────────────────────────────────────────
  console.log('\n── Test 3: L3 单事件处理 ──');
  {
    const testEvent = {
      id: 'test_001',
      type: 'user.message',
      source: 'test',
      payload: { text: '帮我做一个新的技能' },
      metadata: {},
      timestamp: Date.now(),
    };

    const result = await gateway.processEventL3(testEvent);

    assert(result.trace_id && result.trace_id.startsWith('l3gw_'), 'T3.1: 有 trace_id');
    assert(result.event_type === 'user.message', 'T3.2: event_type 正确');
    assert(result.stages.length >= 2, 'T3.3: 至少 2 个 stage (IntentScanner + RuleMatcher)');

    // 检查 IntentScanner stage 存在
    const intentStage = result.stages.find(s => s.name === 'IntentScanner');
    assert(intentStage !== undefined, 'T3.4: IntentScanner stage 存在');
    assert(intentStage.status === 'ok' || intentStage.status === 'skipped', 'T3.5: IntentScanner 完成');

    // 检查 RuleMatcher stage 存在
    const ruleStage = result.stages.find(s => s.name === 'RuleMatcher');
    assert(ruleStage !== undefined, 'T3.6: RuleMatcher stage 存在');
    assert(ruleStage.status === 'ok', 'T3.7: RuleMatcher 完成');

    // 检查 Dispatcher stage
    const dispStage = result.stages.find(s => s.name === 'Dispatcher');
    assert(dispStage !== undefined, 'T3.8: Dispatcher stage 存在');

    assert(typeof result.duration_ms === 'number', 'T3.9: duration_ms 是数字');

    // 关闭 IntentScanner LLM（这里专测 inline hook 接线）
    process.env.INTENT_SCANNER_ENABLED = 'false';

    const queryEvent = {
      id: 'test_query_001',
      type: 'user.message',
      source: 'test',
      payload: { text: '帮我查一下当前系统状态和最近错误日志' },
      metadata: {},
      timestamp: Date.now(),
    };

    const queryResult = await gateway.processEventL3(queryEvent);
    const inlineStage = queryResult.stages.find(s => s.name === 'IntentInlineHook');
    assert(inlineStage !== undefined, 'T3.10: IntentInlineHook stage 存在');
    assert(inlineStage && (inlineStage.status === 'ok' || inlineStage.status === 'no_intent'), 'T3.11: IntentInlineHook 已运行');
    if (inlineStage) {
      const hasQuery = Array.isArray(inlineStage.details)
        && inlineStage.details.some(d => d.type === 'QUERY');
      assert(hasQuery, 'T3.12: QUERY 类输入进入快路并被识别');
      console.log(`    ℹ️  Inline intents: ${JSON.stringify(inlineStage.details)}`);
    }

    // 恢复
    process.env.INTENT_SCANNER_ENABLED = 'true';

    console.log(`    ℹ️  L3 处理链: ${result.stages.map(s => `${s.name}:${s.status}`).join(' → ')}`);
    console.log(`    ℹ️  匹配规则: ${result.matched_rules}, 意图: ${result.intents_detected}, 分发: ${result.dispatched_actions}`);
    console.log(`    ℹ️  耗时: ${result.duration_ms}ms`);
  }

  // ────────────────────────────────────────────────────────
  // Test 4: Gateway install + emit 拦截
  // ────────────────────────────────────────────────────────
  console.log('\n── Test 4: Gateway 安装与拦截 ──');
  {
    // 清理 bus
    legacyBus.purge();
    busAdapter._clearDedupeCache();
    gateway.resetStats();

    // 关闭 IntentScanner LLM（已在 T3 验证过全链路，这里只测 Gateway 机制）
    process.env.INTENT_SCANNER_ENABLED = 'false';

    // 安装 Gateway
    const gw = gateway.install();
    assert(gateway.stats().installed === true, 'T4.1: Gateway 已安装');

    // Emit user.message 事件
    const emitResult = busAdapter.emit('user.message', { text: '创建一个新页面' }, 'test-gateway');
    assert(emitResult && emitResult.id, 'T4.2: emit 返回 id');
    assert(emitResult.suppressed === false, 'T4.3: 未被风暴抑制');

    // 等待异步 L3 处理完成
    await sleep(1000);

    const stats = gateway.stats();
    assert(stats.intercepted >= 1, 'T4.4: 事件被拦截');
    assert(stats.l3_processed >= 1, 'T4.5: L3 处理了事件');

    console.log(`    ℹ️  Stats: intercepted=${stats.intercepted}, l3_processed=${stats.l3_processed}, l3_success=${stats.l3_success}, fallback=${stats.l3_fallback}`);

    // Emit 非 L3 事件
    busAdapter._clearDedupeCache();
    busAdapter.emit('system.healthcheck', { check: true }, 'test');
    await sleep(100);

    const stats2 = gateway.stats();
    assert(stats2.legacy_passthrough >= 1, 'T4.6: 非 L3 事件走旧路径');

    // 卸载
    gateway.uninstall();
    assert(gateway.stats().installed === false, 'T4.7: Gateway 已卸载');

    // 恢复
    process.env.INTENT_SCANNER_ENABLED = 'true';
  }

  // ────────────────────────────────────────────────────────
  // Test 5: FeatureFlag 关闭 → 走旧路径
  // ────────────────────────────────────────────────────────
  console.log('\n── Test 5: FeatureFlag 灰度控制 ──');
  {
    legacyBus.purge();
    busAdapter._clearDedupeCache();
    gateway.resetStats();

    // 关闭 L3 主路
    process.env.L3_MAINLINE_ENABLED = 'false';
    process.env.INTENT_SCANNER_ENABLED = 'false';

    gateway.install();

    busAdapter.emit('user.message', { text: '测试灰度关闭' }, 'test');
    await sleep(200);

    const stats = gateway.stats();
    assert(stats.intercepted === 0, 'T5.1: L3 关闭时不拦截');
    assert(stats.legacy_passthrough >= 1, 'T5.2: 事件走旧路径');

    console.log(`    ℹ️  Stats: intercepted=${stats.intercepted}, passthrough=${stats.legacy_passthrough}`);

    gateway.uninstall();

    // 恢复
    process.env.L3_MAINLINE_ENABLED = 'true';
    process.env.INTENT_SCANNER_ENABLED = 'true';
  }

  // ────────────────────────────────────────────────────────
  // Test 6: Shadow 模式双路径对比
  // ────────────────────────────────────────────────────────
  console.log('\n── Test 6: Shadow 模式 ──');
  {
    legacyBus.purge();
    busAdapter._clearDedupeCache();
    gateway.resetStats();

    // 关闭 IntentScanner LLM，加速测试
    process.env.INTENT_SCANNER_ENABLED = 'false';
    process.env.L3_SHADOW_MODE = 'true';

    gateway.install();

    busAdapter.emit('user.message', { text: '分析一下竞品差异' }, 'test-shadow');
    await sleep(1500);

    const stats = gateway.stats();
    assert(stats.shadow_comparisons >= 1, 'T6.1: Shadow 对比执行');

    // 检查对比日志文件
    const compLogFile = path.join(__dirname, 'l3-comparison.log.jsonl');
    let compLogExists = false;
    try {
      const content = fs.readFileSync(compLogFile, 'utf8').trim();
      if (content) {
        const entries = content.split('\n').map(l => JSON.parse(l));
        const last = entries[entries.length - 1];
        compLogExists = true;
        assert(last.event_type === 'user.message', 'T6.2: 对比日志事件类型正确');
        assert(typeof last.match === 'boolean', 'T6.3: 对比日志有 match 字段');
        console.log(`    ℹ️  L3: success=${last.l3.success}, handler=${last.l3.handler}`);
        console.log(`    ℹ️  Legacy: success=${last.legacy.success}, handler=${last.legacy.handler}`);
        console.log(`    ℹ️  Match: ${last.match}, Delta: ${last.delta_ms}ms`);
      }
    } catch (_) {}
    assert(compLogExists, 'T6.4: 对比日志文件存在');

    gateway.uninstall();
    process.env.L3_SHADOW_MODE = 'false';
    process.env.INTENT_SCANNER_ENABLED = 'true';
  }

  // ────────────────────────────────────────────────────────
  // Test 7: 非对话事件（不走 IntentScanner）
  // ────────────────────────────────────────────────────────
  console.log('\n── Test 7: 非对话事件处理 ──');
  {
    process.env.L3_MAINLINE_EVENTS = 'user.message,isc.rule.*';

    const testEvent = {
      id: 'test_isc_001',
      type: 'isc.rule.changed',
      source: 'test',
      payload: { rule_id: 'R001', change: 'updated' },
      metadata: {},
      timestamp: Date.now(),
    };

    const result = await gateway.processEventL3(testEvent);
    const intentStage = result.stages.find(s => s.name === 'IntentScanner');
    assert(intentStage && intentStage.status === 'skipped', 'T7.1: 非对话事件跳过 IntentScanner');
    assert(intentStage.reason === 'non-conversation event', 'T7.2: 跳过原因正确');

    const ruleStage = result.stages.find(s => s.name === 'RuleMatcher');
    assert(ruleStage && ruleStage.status === 'ok', 'T7.3: RuleMatcher 正常执行');

    console.log(`    ℹ️  L3 处理链: ${result.stages.map(s => `${s.name}:${s.status}`).join(' → ')}`);
  }

  // ────────────────────────────────────────────────────────
  // Test 8: 日志文件验证
  // ────────────────────────────────────────────────────────
  console.log('\n── Test 8: 日志验证 ──');
  {
    const gwLogFile = path.join(__dirname, 'l3-gateway.log.jsonl');
    let logContent = '';
    try { logContent = fs.readFileSync(gwLogFile, 'utf8'); } catch (_) {}
    const lines = logContent.trim().split('\n').filter(l => l.trim());
    assert(lines.length > 0, 'T8.1: Gateway 日志有内容');

    // 找到完整的 L3 处理链日志
    const stageEntries = lines.map(l => { try { return JSON.parse(l); } catch (_) { return null; } }).filter(Boolean);
    const intentLog = stageEntries.find(e => e.stage === 'intent-scanner');
    const ruleLog = stageEntries.find(e => e.stage === 'rule-matcher');
    const dispLog = stageEntries.find(e => e.stage === 'dispatcher');

    assert(intentLog !== undefined, 'T8.2: 日志包含 IntentScanner 记录');
    assert(ruleLog !== undefined, 'T8.3: 日志包含 RuleMatcher 记录');
    assert(dispLog !== undefined, 'T8.4: 日志包含 Dispatcher 记录');

    const installLog = stageEntries.find(e => e.stage === 'installed');
    assert(installLog !== undefined, 'T8.5: 日志包含 install 记录');

    console.log(`    ℹ️  日志行数: ${lines.length}`);
  }

  // ────────────────────────────────────────────────────────
  // 结果汇总
  // ────────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`  总计: ${passed + failed} | 通过: ${passed} | 失败: ${failed}`);
  console.log(`${'═'.repeat(50)}\n`);

  // 清理环境
  process.env.L3_MAINLINE_EVENTS = 'user.message';
  delete process.env.L3_SHADOW_MODE;

  return failed === 0;
}

// ─── 运行 ───
runTests().then(ok => {
  process.exit(ok ? 0 : 1);
}).catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
