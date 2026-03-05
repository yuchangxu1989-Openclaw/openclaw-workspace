'use strict';

/**
 * Feature Flag 模块测试
 * 运行：node infrastructure/config/feature-flags.test.js
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

// ── 清理 require 缓存的辅助函数 ─────────────────────
function freshRequire(modPath) {
  const resolved = require.resolve(modPath);
  delete require.cache[resolved];
  return require(modPath);
}

const CONFIG_FILE = path.resolve(__dirname, 'flags.json');
let originalConfig;

// 保存原始配置
try {
  originalConfig = fs.readFileSync(CONFIG_FILE, 'utf-8');
} catch (_) {
  originalConfig = null;
}

// 清除可能存在的环境变量
const FLAG_NAMES = [
  'L3_PIPELINE_ENABLED',
  'L3_EVENTBUS_ENABLED',
  'L3_RULEMATCHER_ENABLED',
  'L3_INTENTSCANNER_ENABLED',
  'L3_DISPATCHER_ENABLED',
  'L3_DECISIONLOG_ENABLED',
  'L3_CIRCUIT_BREAKER_DEPTH',
];

function cleanEnv() {
  for (const k of FLAG_NAMES) delete process.env[k];
}

function restoreConfig() {
  if (originalConfig !== null) {
    fs.writeFileSync(CONFIG_FILE, originalConfig, 'utf-8');
  }
}

let passed = 0;
let failed = 0;

function test(name, fn) {
  cleanEnv();
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ❌ ${name}`);
    console.log(`     ${e.message}`);
  }
}

console.log('\n🧪 Feature Flag 模块测试\n');

// ── Test 1: 默认值 ────────────────────────────────────
test('默认值：L3_PIPELINE_ENABLED = false', () => {
  const ff = freshRequire('./feature-flags');
  assert.strictEqual(ff.get('L3_PIPELINE_ENABLED'), false);
});

test('默认值：L3_EVENTBUS_ENABLED = true', () => {
  const ff = freshRequire('./feature-flags');
  assert.strictEqual(ff.get('L3_EVENTBUS_ENABLED'), true);
});

test('默认值：L3_CIRCUIT_BREAKER_DEPTH = 5', () => {
  const ff = freshRequire('./feature-flags');
  assert.strictEqual(ff.get('L3_CIRCUIT_BREAKER_DEPTH'), 5);
});

// ── Test 2: isEnabled ─────────────────────────────────
test('isEnabled：已启用的 boolean flag 返回 true', () => {
  const ff = freshRequire('./feature-flags');
  assert.strictEqual(ff.isEnabled('L3_EVENTBUS_ENABLED'), true);
});

test('isEnabled：未启用的 boolean flag 返回 false', () => {
  const ff = freshRequire('./feature-flags');
  assert.strictEqual(ff.isEnabled('L3_PIPELINE_ENABLED'), false);
});

test('isEnabled：数字 > 0 返回 true', () => {
  const ff = freshRequire('./feature-flags');
  assert.strictEqual(ff.isEnabled('L3_CIRCUIT_BREAKER_DEPTH'), true);
});

test('isEnabled：未定义 flag 返回 false', () => {
  const ff = freshRequire('./feature-flags');
  assert.strictEqual(ff.isEnabled('NONEXISTENT_FLAG'), false);
});

// ── Test 3: getAll ────────────────────────────────────
test('getAll 返回所有 flag', () => {
  const ff = freshRequire('./feature-flags');
  const all = ff.getAll();
  assert.strictEqual(typeof all, 'object');
  assert.strictEqual(all.L3_PIPELINE_ENABLED, false);
  assert.strictEqual(all.L3_EVENTBUS_ENABLED, true);
  assert.strictEqual(all.L3_CIRCUIT_BREAKER_DEPTH, 5);
  // 确保返回的是拷贝
  all.L3_PIPELINE_ENABLED = true;
  assert.strictEqual(ff.get('L3_PIPELINE_ENABLED'), false);
});

// ── Test 4: 环境变量优先 ──────────────────────────────
test('环境变量覆盖默认值（boolean）', () => {
  process.env.L3_PIPELINE_ENABLED = 'true';
  const ff = freshRequire('./feature-flags');
  assert.strictEqual(ff.get('L3_PIPELINE_ENABLED'), true);
  assert.strictEqual(ff.isEnabled('L3_PIPELINE_ENABLED'), true);
});

test('环境变量覆盖默认值（number）', () => {
  process.env.L3_CIRCUIT_BREAKER_DEPTH = '10';
  const ff = freshRequire('./feature-flags');
  assert.strictEqual(ff.get('L3_CIRCUIT_BREAKER_DEPTH'), 10);
});

test('环境变量支持多种 true 格式', () => {
  for (const val of ['true', '1', 'yes', 'TRUE', 'Yes']) {
    process.env.L3_PIPELINE_ENABLED = val;
    const ff = freshRequire('./feature-flags');
    assert.strictEqual(ff.get('L3_PIPELINE_ENABLED'), true, `"${val}" should be true`);
  }
});

test('环境变量支持多种 false 格式', () => {
  for (const val of ['false', '0', 'no', 'FALSE', '']) {
    process.env.L3_EVENTBUS_ENABLED = val;
    const ff = freshRequire('./feature-flags');
    assert.strictEqual(ff.get('L3_EVENTBUS_ENABLED'), false, `"${val}" should be false`);
  }
});

// ── Test 5: 配置文件优先级 ────────────────────────────
test('配置文件覆盖默认值', () => {
  cleanEnv();
  const custom = { L3_PIPELINE_ENABLED: true, L3_CIRCUIT_BREAKER_DEPTH: 3 };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(custom), 'utf-8');
  const ff = freshRequire('./feature-flags');
  assert.strictEqual(ff.get('L3_PIPELINE_ENABLED'), true);
  assert.strictEqual(ff.get('L3_CIRCUIT_BREAKER_DEPTH'), 3);
  // 未在配置文件中的 flag 仍用默认值
  assert.strictEqual(ff.get('L3_EVENTBUS_ENABLED'), true);
  restoreConfig();
});

test('环境变量优先于配置文件', () => {
  const custom = { L3_PIPELINE_ENABLED: true };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(custom), 'utf-8');
  process.env.L3_PIPELINE_ENABLED = 'false';
  const ff = freshRequire('./feature-flags');
  assert.strictEqual(ff.get('L3_PIPELINE_ENABLED'), false);
  restoreConfig();
});

// ── Test 6: reload ────────────────────────────────────
test('reload 重新加载配置文件', () => {
  cleanEnv();
  restoreConfig();
  const ff = freshRequire('./feature-flags');
  assert.strictEqual(ff.get('L3_PIPELINE_ENABLED'), false);

  // 修改配置文件
  const custom = { L3_PIPELINE_ENABLED: true };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(custom), 'utf-8');

  // reload 前值不变（已缓存）
  // reload 后值更新
  const result = ff.reload();
  assert.strictEqual(ff.get('L3_PIPELINE_ENABLED'), true);
  assert.strictEqual(typeof result.loaded, 'number');
  assert.strictEqual(result.resolved.L3_PIPELINE_ENABLED, true);

  restoreConfig();
});

test('reload 后环境变量仍然优先', () => {
  cleanEnv();
  restoreConfig();
  const ff = freshRequire('./feature-flags');
  
  // 配置文件设为 true
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({ L3_PIPELINE_ENABLED: true }), 'utf-8');
  ff.reload();
  
  // env 设为 false，应覆盖文件
  process.env.L3_PIPELINE_ENABLED = 'false';
  assert.strictEqual(ff.get('L3_PIPELINE_ENABLED'), false);

  restoreConfig();
});

// ── Test 7: 容错 ──────────────────────────────────────
test('配置文件不存在时使用默认值', () => {
  cleanEnv();
  // 临时移除配置文件
  const backup = fs.readFileSync(CONFIG_FILE, 'utf-8');
  fs.unlinkSync(CONFIG_FILE);
  
  const ff = freshRequire('./feature-flags');
  assert.strictEqual(ff.get('L3_PIPELINE_ENABLED'), false);
  assert.strictEqual(ff.get('L3_EVENTBUS_ENABLED'), true);
  
  // 恢复
  fs.writeFileSync(CONFIG_FILE, backup, 'utf-8');
});

test('配置文件格式错误时使用默认值', () => {
  cleanEnv();
  fs.writeFileSync(CONFIG_FILE, 'NOT VALID JSON!!!', 'utf-8');
  
  const ff = freshRequire('./feature-flags');
  assert.strictEqual(ff.get('L3_PIPELINE_ENABLED'), false);
  assert.strictEqual(ff.get('L3_CIRCUIT_BREAKER_DEPTH'), 5);
  
  restoreConfig();
});

// ── Test 8: getDefaults / meta ────────────────────────
test('getDefaults 返回默认值表', () => {
  const ff = freshRequire('./feature-flags');
  const defaults = ff.getDefaults();
  assert.strictEqual(defaults.L3_PIPELINE_ENABLED, false);
  assert.strictEqual(defaults.L3_CIRCUIT_BREAKER_DEPTH, 5);
  // 确保是拷贝
  defaults.L3_PIPELINE_ENABLED = true;
  assert.strictEqual(ff.getDefaults().L3_PIPELINE_ENABLED, false);
});

test('getLastLoadTime 返回时间戳', () => {
  const ff = freshRequire('./feature-flags');
  const t = ff.getLastLoadTime();
  assert.strictEqual(typeof t, 'number');
  assert(t > 0);
});

test('getConfigPath 返回配置文件路径', () => {
  const ff = freshRequire('./feature-flags');
  assert.ok(ff.getConfigPath().endsWith('flags.json'));
});

test('get 未定义 flag 返回 undefined', () => {
  const ff = freshRequire('./feature-flags');
  assert.strictEqual(ff.get('TOTALLY_UNKNOWN'), undefined);
});

// ── 清理 & 汇总 ──────────────────────────────────────
cleanEnv();
restoreConfig();

console.log(`\n📊 结果：${passed} 通过，${failed} 失败（共 ${passed + failed} 项）`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log('✅ 全部通过\n');
}
