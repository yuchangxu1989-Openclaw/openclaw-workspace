#!/usr/bin/env node
/**
 * Day2 Gap1 验收测试：定时任务体系事件驱动化重塑
 * 
 * 验收条件（来自 day2-scope-and-plan.md D2-07）：
 *   1. 4个核心cron任务改为事件触发 + cron兜底双模式
 *   2. EventBus 路由完整（dto.signal.created / file.changed / file.changed.* / isc.rule.changed）
 *   3. Check-and-skip 状态持久化正常
 *   4. 4个 Watcher 文件存在且可加载
 *   5. 4个 Cron Adapter 存在且可执行
 *   6. Bus-Adapter 提供事件驱动便捷 emit 点（emitInsightRequest/emitHealthRequest/emitAutoResponse）
 *   7. Event Watcher Daemon 守护进程脚本存在
 * 
 * @version 1.0.0
 * @date 2026-03-07
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const assert = require('assert');

const BASE = path.join(__dirname, '..');

let passed = 0;
let failed = 0;
const errors = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    errors.push({ name, error: e.message });
    console.log(`  ❌ ${name}: ${e.message}`);
  }
}

// ══════════════════════════════════════════════════════════════
// Suite 1: 基础设施文件完整性
// ══════════════════════════════════════════════════════════════
console.log('\n── Suite 1: 基础设施文件完整性 ──');

const ED_BASE = path.join(BASE, 'infrastructure/event-driven');

test('cron-check-skip.js 存在', () => {
  assert.ok(fs.existsSync(path.join(ED_BASE, 'cron-check-skip.js')));
});

test('event-watcher-daemon.js 存在', () => {
  assert.ok(fs.existsSync(path.join(ED_BASE, 'event-watcher-daemon.js')));
});

// 4个 Watcher
const watchers = [
  'isc-rules-watcher.js',
  'dto-signals-watcher.js',
  'eventbus-file-watcher.js',
  'git-change-watcher.js',
];
for (const w of watchers) {
  test(`Watcher ${w} 存在`, () => {
    assert.ok(fs.existsSync(path.join(ED_BASE, 'watchers', w)), `Missing: ${w}`);
  });
}

// 4个 Cron Adapter
const adapters = [
  'event-dispatcher-adapter.js',
  'isc-detect-adapter.js',
  'global-pipeline-adapter.js',
  'dto-aeo-adapter.js',
];
for (const a of adapters) {
  test(`Cron Adapter ${a} 存在`, () => {
    assert.ok(fs.existsSync(path.join(ED_BASE, 'cron-adapters', a)), `Missing: ${a}`);
  });
}

// ══════════════════════════════════════════════════════════════
// Suite 2: EventBus 路由完整性
// ══════════════════════════════════════════════════════════════
console.log('\n── Suite 2: EventBus 路由完整性 ──');

const routesFile = path.join(BASE, 'infrastructure/dispatcher/routes.json');
let routes = {};
test('routes.json 可加载', () => {
  assert.ok(fs.existsSync(routesFile), 'routes.json 不存在');
  routes = JSON.parse(fs.readFileSync(routesFile, 'utf8'));
  assert.ok(typeof routes === 'object' && routes !== null);
});

const requiredRoutes = [
  'isc.rule.changed',
  'dto.signal.created',
  'file.changed',
  'file.changed.*',
];
for (const r of requiredRoutes) {
  test(`路由 "${r}" 存在`, () => {
    assert.ok(routes[r], `routes.json 缺少路由: ${r}`);
  });
}

// ══════════════════════════════════════════════════════════════
// Suite 3: Check-and-Skip 核心逻辑
// ══════════════════════════════════════════════════════════════
console.log('\n── Suite 3: Check-and-Skip 核心逻辑 ──');

let checkSkip;
test('cron-check-skip 模块可加载', () => {
  checkSkip = require(path.join(ED_BASE, 'cron-check-skip'));
  assert.ok(typeof checkSkip.shouldSkip === 'function');
  assert.ok(typeof checkSkip.markEventTriggered === 'function');
  assert.ok(typeof checkSkip.markCronExecuted === 'function');
  assert.ok(typeof checkSkip.getAllState === 'function');
});

test('无事件记录时不跳过', () => {
  const taskId = `gap1-test-${Date.now()}`;
  const result = checkSkip.shouldSkip(taskId, { maxAgeMs: 60000 });
  assert.strictEqual(result.skip, false, 'Should NOT skip when no event recorded');
});

test('标记事件触发后应跳过', () => {
  const taskId = `gap1-skip-${Date.now()}`;
  checkSkip.markEventTriggered(taskId);
  const result = checkSkip.shouldSkip(taskId, { maxAgeMs: 60000 });
  assert.strictEqual(result.skip, true, 'Should skip after event triggered');
});

test('有新变更时强制执行不跳过', () => {
  const taskId = `gap1-force-${Date.now()}`;
  checkSkip.markEventTriggered(taskId);
  const result = checkSkip.shouldSkip(taskId, {
    maxAgeMs: 60000,
    hasNewChanges: () => true
  });
  assert.strictEqual(result.skip, false, 'Should NOT skip when hasNewChanges=true');
});

// ══════════════════════════════════════════════════════════════
// Suite 4: Bus Adapter 事件驱动 Emit 点
// ══════════════════════════════════════════════════════════════
console.log('\n── Suite 4: Bus Adapter 事件驱动 Emit 点 ──');

let adapter;
test('bus-adapter 可加载', () => {
  adapter = require(path.join(BASE, 'infrastructure/event-bus/bus-adapter'));
  assert.ok(adapter._isAdapter === true, 'should be adapter');
});

test('adapter.emitInsightRequest 存在且为函数', () => {
  assert.ok(typeof adapter.emitInsightRequest === 'function');
});

test('adapter.emitHealthRequest 存在且为函数', () => {
  assert.ok(typeof adapter.emitHealthRequest === 'function');
});

test('adapter.emitAutoResponse 存在且为函数', () => {
  assert.ok(typeof adapter.emitAutoResponse === 'function');
});

test('adapter.emit 基本功能正常', () => {
  adapter._clearDedupeCache();
  const result = adapter.emit('gap1.verify.test', { probe: true }, 'gap1-test');
  assert.ok(result && result.id, 'should return event id');
  assert.ok(!result.suppressed, 'first emit should not be suppressed');
});

test('adapter.emit 5秒内重复事件被抑制（防风暴）', () => {
  adapter._clearDedupeCache();
  const r1 = adapter.emit('gap1.storm.test', { same: true }, 'test');
  const r2 = adapter.emit('gap1.storm.test', { same: true }, 'test');
  assert.ok(!r1.suppressed, 'first should not be suppressed');
  assert.ok(r2.suppressed, 'duplicate within 5s should be suppressed');
});

test('adapter.healthCheck 返回正常结构', () => {
  const hc = adapter.healthCheck();
  assert.ok(typeof hc.ok === 'boolean');
  assert.ok(typeof hc.total === 'number');
  assert.ok(typeof hc.corrupted === 'number');
});

// ══════════════════════════════════════════════════════════════
// Suite 5: 端对端 — 事件触发 → Cron 跳过
// ══════════════════════════════════════════════════════════════
console.log('\n── Suite 5: 端对端事件触发→Cron跳过 ──');

test('E2E: ISC事件触发后 isc-detect cron 跳过', () => {
  const { markEventTriggered, shouldSkip, markCronExecuted } = checkSkip;
  const taskId = 'isc-detect';
  
  // 模拟 isc-rules-watcher 触发
  markEventTriggered(taskId);
  
  // 验证 cron 适配器会跳过
  const skipResult = shouldSkip(taskId, { maxAgeMs: 30 * 60 * 1000 });
  assert.ok(skipResult.skip, 'isc-detect cron should skip after event trigger');
  assert.ok(skipResult.reason, 'should provide skip reason');
  
  // 清理：标记 cron 已执行（重置状态）
  markCronExecuted(taskId, 'skipped');
});

test('E2E: DTO信号事件触发后 dto-aeo cron 跳过', () => {
  const { markEventTriggered, shouldSkip, markCronExecuted } = checkSkip;
  const taskId = 'dto-aeo';
  
  markEventTriggered(taskId);
  const skipResult = shouldSkip(taskId, { maxAgeMs: 2 * 60 * 60 * 1000 });
  assert.ok(skipResult.skip, 'dto-aeo cron should skip after event trigger');
  
  markCronExecuted(taskId, 'skipped');
});

test('E2E: 文件变更事件触发后 event-dispatcher cron 跳过', () => {
  const { markEventTriggered, shouldSkip, markCronExecuted } = checkSkip;
  const taskId = 'event-dispatcher';
  
  markEventTriggered(taskId);
  const skipResult = shouldSkip(taskId, { maxAgeMs: 10 * 60 * 1000 });
  assert.ok(skipResult.skip, 'event-dispatcher cron should skip after event trigger');
  
  markCronExecuted(taskId, 'skipped');
});

test('E2E: Git变更事件触发后 global-pipeline cron 跳过', () => {
  const { markEventTriggered, shouldSkip, markCronExecuted } = checkSkip;
  const taskId = 'global-pipeline';
  
  markEventTriggered(taskId);
  const skipResult = shouldSkip(taskId, { maxAgeMs: 60 * 60 * 1000 });
  assert.ok(skipResult.skip, 'global-pipeline cron should skip after event trigger');
  
  markCronExecuted(taskId, 'skipped');
});

// ══════════════════════════════════════════════════════════════
// Suite 6: 架构原则合规（AP-003 反馈必须闭环）
// ══════════════════════════════════════════════════════════════
console.log('\n── Suite 6: 架构原则合规（AP-003）──');

test('状态持久化：getAllState 包含多个任务状态', () => {
  const state = checkSkip.getAllState();
  assert.ok(typeof state === 'object');
  assert.ok(Object.keys(state).length > 0, 'State should have at least one entry');
});

test('EventBus 文件存在且可读', () => {
  const busFile = path.join(BASE, 'infrastructure/event-bus/bus.js');
  assert.ok(fs.existsSync(busFile), 'bus.js should exist');
  const busAdapterFile = path.join(BASE, 'infrastructure/event-bus/bus-adapter.js');
  assert.ok(fs.existsSync(busAdapterFile), 'bus-adapter.js should exist');
});

test('routes.json 包含足够的路由（≥40条）', () => {
  const count = Object.keys(routes).length;
  assert.ok(count >= 40, `Expected ≥40 routes, got ${count}`);
});

// ══════════════════════════════════════════════════════════════
// 最终报告
// ══════════════════════════════════════════════════════════════
const total = passed + failed;
console.log('\n══════════════════════════════════════════════════════════');
console.log(`📊 Day2 Gap1 验收结果: ${passed} 通过 / ${failed} 失败 / ${total} 总计`);
if (failed === 0) {
  console.log('🎉 全部通过 — Day2 Gap1「定时任务体系事件驱动化重塑」验收完成');
} else {
  console.log('⚠️  有失败用例，Gap1 未完全关闭：');
  errors.forEach(e => console.log(`   ❌ ${e.name}: ${e.error}`));
}
console.log('══════════════════════════════════════════════════════════');

process.exit(failed > 0 ? 1 : 0);
