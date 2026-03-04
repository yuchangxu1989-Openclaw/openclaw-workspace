'use strict';

/**
 * EventBus 适配层 (Bus Adapter)
 * 
 * 对外暴露新event-bus.js兼容API，内部委托旧bus.js执行。
 * 解决新旧总线API不兼容 + events.jsonl数据竞争问题。
 * 
 * 映射关系：
 *   emit(type, payload, source, metadata)  → bus.emit(type, payload, source) + 风暴抑制 + 钩子
 *   consume({type_filter, since, layer, limit}) → bus.consume(consumerId, {types, limit}) 适配
 *   healthCheck()  → 文件完整性校验
 *   stats()        → bus.stats() + 扩展字段
 * 
 * @module infrastructure/event-bus/bus-adapter
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bus = require('./bus');

// ─── Observability: Metrics ───
let _metrics = null;
try { _metrics = require('../observability/metrics'); } catch (_) {}

// ─── 常量 ───
const DEFAULT_CONSUMER_ID = 'l3-pipeline';
const DEDUPE_WINDOW_MS = 5000; // 5秒去重窗口

// ─── 风暴抑制缓存 ───
/** @type {Map<string, number>} key: fingerprint, value: timestamp (ms) */
const _recentEmits = new Map();

/**
 * 清理过期的去重指纹
 * @private
 */
function _pruneDedupeCache() {
  const now = Date.now();
  for (const [key, ts] of _recentEmits) {
    if (now - ts > DEDUPE_WINDOW_MS) {
      _recentEmits.delete(key);
    }
  }
}

/**
 * 计算事件指纹，用于风暴抑制
 * @param {string} type
 * @param {object} payload
 * @returns {string}
 * @private
 */
function _fingerprint(type, payload) {
  const payloadStr = JSON.stringify(payload || {}).slice(0, 200);
  const hash = crypto.createHash('md5').update(payloadStr).digest('hex').slice(0, 8);
  return `${type}::${hash}`;
}

/**
 * 通配符匹配（兼容新event-bus.js的匹配语义）
 * 支持：
 *   - 精确匹配: 'skill.created'
 *   - 前缀通配: 'skill.*' → 匹配 skill.created, skill.updated 等
 *   - 后缀通配: '*.failed' → 匹配 task.failed 等
 *   - 全匹配: '*'
 * @param {string} eventType
 * @param {string} pattern
 * @returns {boolean}
 * @private
 */
function _matchWildcard(eventType, pattern) {
  if (!pattern || pattern === '*') return true;
  if (pattern === eventType) return true;
  if (!pattern.includes('*')) return eventType === pattern;
  // 转正则: 'skill.*' → /^skill\..+$/
  const regexStr = '^' + pattern
    .replace(/\./g, '\\.')
    .replace(/\*/g, '.+')
    + '$';
  return new RegExp(regexStr).test(eventType);
}

// ─── ISC Rule 钩子 ───
let _ruleMatcherModule = null;

/**
 * emit后钩子：isc.rule.* 事件触发 RuleMatcher.reload()
 * 延迟加载避免循环依赖
 * @param {string} type
 * @private
 */
function _postEmitHook(type) {
  if (!_matchWildcard(type, 'isc.rule.*')) return;
  try {
    if (!_ruleMatcherModule) {
      _ruleMatcherModule = require('../rule-engine/isc-rule-matcher');
    }
    const matcher = _ruleMatcherModule.getDefaultMatcher();
    if (matcher && typeof matcher.reload === 'function') {
      matcher.reload();
    }
  } catch (_) {
    // 非致命：RuleMatcher可能未初始化
  }
}

// ═══════════════════════════════════════════════════════════
// 公共API
// ═══════════════════════════════════════════════════════════

/**
 * 发射事件（兼容新event-bus.js签名，内部走旧bus.js文件锁保护）
 * 
 * @param {string} type - 事件类型
 * @param {object} [payload={}] - 事件载荷
 * @param {string} [source='unknown'] - 事件来源
 * @param {object} [metadata={}] - 元数据（chain_depth, trace_id, confidence 等）
 * @returns {{ id: string, suppressed: boolean } | null}
 */
function emit(type, payload, source, metadata) {
  if (!type || typeof type !== 'string') {
    throw new Error('EventBus.emit: type is required and must be a string');
  }

  payload = payload || {};
  source = source || 'unknown';
  metadata = metadata || {};

  // ─── 风暴抑制：5秒去重 ───
  _pruneDedupeCache();
  const fp = _fingerprint(type, payload);
  const lastEmit = _recentEmits.get(fp);
  if (lastEmit && (Date.now() - lastEmit) < DEDUPE_WINDOW_MS) {
    if (_metrics) _metrics.inc('events_dropped_total');
    return { id: null, suppressed: true };
  }

  // ─── 委托旧bus.js emit（文件锁保护） ───
  // 旧bus.emit签名: (type, payload, source) → event
  // 将metadata合入payload传递（保持旧bus兼容，metadata作为payload的子字段）
  const enrichedPayload = Object.assign({}, payload);
  if (Object.keys(metadata).length > 0) {
    enrichedPayload._metadata = metadata;
  }

  const event = bus.emit(type, enrichedPayload, source);

  // 更新去重缓存
  _recentEmits.set(fp, Date.now());

  // ─── emit后钩子 ───
  _postEmitHook(type);

  return { id: event.id, suppressed: false };
}

/**
 * 消费事件（兼容新event-bus.js签名，内部走旧bus.js的cursor+consumerId模式）
 * 
 * 适配逻辑：
 *   新API的time-window模式 → 旧bus的cursor+consumerId模式
 *   type_filter通配符 → 旧bus的types数组
 * 
 * @param {object} [options={}]
 * @param {string} [options.type_filter] - 事件类型过滤器（支持 * 通配符）
 * @param {number} [options.since] - 只返回此时间戳之后的事件（ms）
 * @param {string} [options.layer] - 按事件层级过滤
 * @param {number} [options.limit] - 最大返回数量
 * @param {string} [options.consumerId] - 消费者ID（默认 'l3-pipeline'）
 * @returns {Array<object>} 匹配的事件数组
 */
function consume(options) {
  options = options || {};
  const consumerId = options.consumerId || DEFAULT_CONSUMER_ID;

  // ─── 构建旧bus consume的types参数 ───
  const types = [];
  if (options.type_filter && options.type_filter !== '*') {
    types.push(options.type_filter);
  }

  // ─── 调用旧bus.consume（cursor + consumerId模式） ───
  const busOptions = {};
  if (types.length > 0) busOptions.types = types;
  if (options.limit) busOptions.limit = options.limit;

  let events = bus.consume(consumerId, busOptions);

  // ─── since 过滤（旧bus.consume不支持since，需要后过滤） ───
  if (options.since && typeof options.since === 'number') {
    events = events.filter(e => e.timestamp >= options.since);
  }

  // ─── layer 过滤 ───
  if (options.layer) {
    events = events.filter(e => {
      return e.layer === options.layer ||
        (e.metadata && e.metadata.layer === options.layer) ||
        (e.payload && e.payload._metadata && e.payload._metadata.layer === options.layer);
    });
  }

  // ─── 规范化事件结构（让旧bus事件看起来像新event-bus格式） ───
  events = events.map(e => {
    const normalized = Object.assign({}, e);
    // 提取 _metadata 到顶层 metadata 字段
    if (e.payload && e.payload._metadata) {
      normalized.metadata = e.payload._metadata;
      // 清理payload中的_metadata（返回副本，不修改原始）
      normalized.payload = Object.assign({}, e.payload);
      delete normalized.payload._metadata;
    }
    if (!normalized.metadata) {
      normalized.metadata = {};
    }
    return normalized;
  });

  return events;
}

/**
 * 事件总线健康检查
 * 
 * 校验events.jsonl完整性（读取旧bus管理的文件）
 * 
 * @returns {{ ok: boolean, total: number, corrupted: number, file_exists: boolean, file_size: number }}
 */
function healthCheck() {
  const eventsFile = bus._EVENTS_FILE;

  if (!fs.existsSync(eventsFile)) {
    return { ok: true, total: 0, corrupted: 0, file_exists: false, file_size: 0 };
  }

  let content;
  try {
    content = fs.readFileSync(eventsFile, 'utf8');
  } catch (e) {
    return { ok: false, total: 0, corrupted: 0, file_exists: true, file_size: 0, error: e.message };
  }

  const lines = content.split('\n').filter(l => l.trim());
  let validCount = 0;
  let corruptedCount = 0;

  for (const line of lines) {
    try {
      JSON.parse(line);
      validCount++;
    } catch (_) {
      corruptedCount++;
    }
  }

  let fileSize = 0;
  try {
    fileSize = fs.statSync(eventsFile).size;
  } catch (_) {}

  return {
    ok: corruptedCount === 0,
    total: validCount,
    corrupted: corruptedCount,
    file_exists: true,
    file_size: fileSize,
  };
}

/**
 * 获取事件总线统计信息（兼容新event-bus.js的返回格式）
 * 
 * @returns {{ total_events: number, file_size: number, dedupe_cache_size: number, consumers: number, events_by_type: object }}
 */
function stats() {
  const busStats = bus.stats();

  let fileSize = 0;
  try {
    fileSize = fs.statSync(bus._EVENTS_FILE).size;
  } catch (_) {}

  return {
    total_events: busStats.totalEvents,
    file_size: fileSize,
    dedupe_cache_size: _recentEmits.size,
    consumers: busStats.consumers,
    events_by_type: busStats.eventsByType,
    oldest_event: busStats.oldestEvent,
    newest_event: busStats.newestEvent,
    emergency_exists: false, // 适配层走旧bus，无emergency文件
    adapter: true, // 标记来自适配层
  };
}

/**
 * 清除风暴抑制缓存（测试用）
 * @private
 */
function _clearDedupeCache() {
  _recentEmits.clear();
}

// ═══════════════════════════════════════════════════════════
// 导出
// ═══════════════════════════════════════════════════════════

module.exports = {
  emit,
  consume,
  healthCheck,
  stats,

  // 兼容新event-bus.js导出的常量
  EVENTS_FILE: bus._EVENTS_FILE,
  DATA_DIR: path.dirname(bus._EVENTS_FILE),
  DEDUPE_WINDOW_MS,

  // 旧bus透传（渐进迁移用）
  legacy: bus,

  // 测试辅助
  _clearDedupeCache,
  _fingerprint,
  _matchWildcard,

  // 适配层标识
  _isAdapter: true,
};


// ═══════════════════════════════════════════════════════════
// 单元测试 — node bus-adapter.js 直接运行
// ═══════════════════════════════════════════════════════════
if (require.main === module) {
  const assert = require('assert');

  let passed = 0;
  let failed = 0;

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

  console.log('\n🧪 Bus Adapter 单元测试\n');

  // ─── 准备：备份并清空 ───
  const eventsFile = bus._EVENTS_FILE;
  const cursorFile = bus._CURSOR_FILE;
  let backupEvents = null;
  let backupCursors = null;
  try { backupEvents = fs.readFileSync(eventsFile, 'utf8'); } catch (_) {}
  try { backupCursors = fs.readFileSync(cursorFile, 'utf8'); } catch (_) {}

  bus.purge(); // 清空事件和游标
  _clearDedupeCache();

  // ─── Test 1: emit 基本功能 ───
  test('emit() 返回 {id, suppressed: false}', () => {
    _clearDedupeCache();
    const result = emit('test.adapter.basic', { foo: 'bar' }, 'test-adapter');
    assert.ok(result, 'emit should return result');
    assert.ok(result.id, 'should have id');
    assert.ok(result.id.startsWith('evt_'), `id should start with evt_, got: ${result.id}`);
    assert.strictEqual(result.suppressed, false);
  });

  // ─── Test 2: emit 写入旧bus的events.jsonl ───
  test('emit() 写入旧bus管理的events.jsonl', () => {
    const history = bus.history({ type: 'test.adapter.basic' });
    assert.ok(history.length >= 1, 'old bus history should find the event');
    const evt = history[history.length - 1];
    assert.strictEqual(evt.type, 'test.adapter.basic');
    assert.strictEqual(evt.source, 'test-adapter');
    assert.deepStrictEqual(evt.payload.foo, 'bar');
  });

  // ─── Test 3: 风暴抑制 ───
  test('emit() 5秒内相同事件被抑制', () => {
    _clearDedupeCache();
    const r1 = emit('test.storm', { key: 'same' }, 'test');
    const r2 = emit('test.storm', { key: 'same' }, 'test');
    assert.strictEqual(r1.suppressed, false, 'first should not be suppressed');
    assert.strictEqual(r2.suppressed, true, 'second should be suppressed');
  });

  test('emit() 不同payload不被抑制', () => {
    _clearDedupeCache();
    const r1 = emit('test.storm2', { key: 'a' }, 'test');
    const r2 = emit('test.storm2', { key: 'b' }, 'test');
    assert.strictEqual(r1.suppressed, false);
    assert.strictEqual(r2.suppressed, false);
  });

  // ─── Test 4: metadata 透传 ───
  test('emit() metadata通过_metadata字段透传', () => {
    _clearDedupeCache();
    emit('test.meta', { data: 1 }, 'test', { chain_depth: 3, trace_id: 'tr-001' });
    const history = bus.history({ type: 'test.meta' });
    const evt = history[history.length - 1];
    assert.ok(evt.payload._metadata, 'payload should have _metadata');
    assert.strictEqual(evt.payload._metadata.chain_depth, 3);
    assert.strictEqual(evt.payload._metadata.trace_id, 'tr-001');
  });

  // ─── Test 5: consume 基本功能 ───
  test('consume() 通过cursor模式读取事件', () => {
    bus.purge();
    _clearDedupeCache();
    // 通过旧bus直接emit
    bus.emit('test.consume1', { val: 'from-old-bus' }, 'old-bus');
    // 通过adapter emit
    emit('test.consume2', { val: 'from-adapter' }, 'adapter');

    const events = consume({ consumerId: 'test-consumer-1' });
    assert.ok(events.length >= 2, `expected >= 2 events, got ${events.length}`);
    const types = events.map(e => e.type);
    assert.ok(types.includes('test.consume1'), 'should include old bus event');
    assert.ok(types.includes('test.consume2'), 'should include adapter event');
  });

  // ─── Test 6: consume type_filter ───
  test('consume() type_filter通配符过滤', () => {
    bus.purge();
    _clearDedupeCache();
    bus.emit('skill.created', { name: 'a' }, 'test');
    bus.emit('skill.updated', { name: 'b' }, 'test');
    bus.emit('rule.violated', { id: 'R001' }, 'test');

    const skills = consume({ type_filter: 'skill.*', consumerId: 'test-filter-1' });
    assert.strictEqual(skills.length, 2, `expected 2, got ${skills.length}`);
    assert.ok(skills.every(e => e.type.startsWith('skill.')));
  });

  // ─── Test 7: consume since过滤 ───
  test('consume() since时间过滤', () => {
    bus.purge();
    _clearDedupeCache();
    bus.emit('test.since', { old: true }, 'test');
    const futureTs = Date.now() + 100000;
    const events = consume({ since: futureTs, consumerId: 'test-since-1' });
    assert.strictEqual(events.length, 0, 'future since should return 0');
  });

  // ─── Test 8: consume metadata规范化 ───
  test('consume() 规范化_metadata到顶层metadata', () => {
    bus.purge();
    _clearDedupeCache();
    emit('test.normalize', { data: 1 }, 'test', { chain_depth: 2 });
    const events = consume({ type_filter: 'test.normalize', consumerId: 'test-norm-1' });
    assert.ok(events.length >= 1);
    const evt = events[0];
    assert.ok(evt.metadata, 'should have metadata at top level');
    assert.strictEqual(evt.metadata.chain_depth, 2);
    // payload不应包含_metadata
    assert.ok(!evt.payload._metadata, 'payload should not have _metadata after normalization');
  });

  // ─── Test 9: 互操作 — 旧bus emit → adapter consume ───
  test('互操作: 旧bus.emit → adapter.consume 能读到', () => {
    bus.purge();
    _clearDedupeCache();
    bus.emit('interop.old2new', { origin: 'old-bus' }, 'old-bus');
    const events = consume({ type_filter: 'interop.old2new', consumerId: 'test-interop-1' });
    assert.ok(events.length >= 1, 'adapter should consume old bus events');
    assert.strictEqual(events[0].payload.origin, 'old-bus');
  });

  // ─── Test 10: 互操作 — adapter emit → 旧bus consume ───
  test('互操作: adapter.emit → 旧bus.consume 能读到', () => {
    bus.purge();
    _clearDedupeCache();
    emit('interop.new2old', { origin: 'adapter' }, 'adapter');
    const events = bus.consume('test-interop-2', { types: ['interop.new2old'] });
    assert.ok(events.length >= 1, 'old bus should consume adapter events');
    assert.strictEqual(events[0].payload.origin, 'adapter');
  });

  // ─── Test 11: healthCheck ───
  test('healthCheck() 返回正确结构', () => {
    const result = healthCheck();
    assert.strictEqual(typeof result.ok, 'boolean');
    assert.strictEqual(typeof result.total, 'number');
    assert.strictEqual(typeof result.corrupted, 'number');
    assert.strictEqual(typeof result.file_exists, 'boolean');
    assert.strictEqual(typeof result.file_size, 'number');
  });

  // ─── Test 12: stats ───
  test('stats() 返回兼容格式', () => {
    const s = stats();
    assert.strictEqual(typeof s.total_events, 'number');
    assert.strictEqual(typeof s.file_size, 'number');
    assert.strictEqual(typeof s.dedupe_cache_size, 'number');
    assert.strictEqual(s.adapter, true, 'should mark as adapter');
  });

  // ─── Test 13: emit参数校验 ───
  test('emit() type为空时抛出错误', () => {
    assert.throws(() => emit('', {}, 'test'), /type is required/);
    assert.throws(() => emit(null, {}, 'test'), /type is required/);
  });

  // ─── Test 14: _matchWildcard ───
  test('_matchWildcard() 各种模式匹配', () => {
    assert.strictEqual(_matchWildcard('skill.created', 'skill.*'), true);
    assert.strictEqual(_matchWildcard('skill.updated', 'skill.*'), true);
    assert.strictEqual(_matchWildcard('rule.violated', 'skill.*'), false);
    assert.strictEqual(_matchWildcard('task.failed', '*.failed'), true);
    assert.strictEqual(_matchWildcard('isc.rule.created', 'isc.rule.*'), true);
    assert.strictEqual(_matchWildcard('anything', '*'), true);
    assert.strictEqual(_matchWildcard('exact.match', 'exact.match'), true);
    assert.strictEqual(_matchWildcard('not.match', 'exact.match'), false);
  });

  // ─── Test 15: consume 默认 consumerId ───
  test('consume() 默认consumerId为l3-pipeline', () => {
    bus.purge();
    _clearDedupeCache();
    bus.emit('test.default.consumer', {}, 'test');
    // 不传consumerId，使用默认
    const events = consume({ type_filter: 'test.default.consumer' });
    assert.ok(events.length >= 1);
    // 验证cursor.json中有l3-pipeline的记录
    const cursorContent = JSON.parse(fs.readFileSync(cursorFile, 'utf8'));
    assert.ok(cursorContent['l3-pipeline'], 'should create cursor for l3-pipeline');
  });

  // ─── 清理：恢复备份 ───
  if (backupEvents !== null) {
    fs.writeFileSync(eventsFile, backupEvents);
  } else {
    try { fs.unlinkSync(eventsFile); } catch (_) {}
  }
  if (backupCursors !== null) {
    fs.writeFileSync(cursorFile, backupCursors);
  } else {
    try { fs.unlinkSync(cursorFile); } catch (_) {}
  }
  _clearDedupeCache();

  // ─── 报告 ───
  console.log(`\n📊 结果: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  process.exit(failed > 0 ? 1 : 0);
}
