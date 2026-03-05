'use strict';

/**
 * @deprecated Use bus-adapter.js instead. Direct usage causes data race with bus.js.
 * This file will be removed after full migration to bus-adapter.js.
 * 
 * EventBus - 事件总线核心模块（已废弃）
 * 
 * 基于 events.jsonl 的文件级事件总线，支持：
 * - 原子写入（tmp → rename）
 * - 风暴抑制（相同事件5秒去重）
 * - 通配符消费（skill.* 匹配 skill.created, skill.updated 等）
 * - 容灾降级（emit失败时写入 /tmp/events-emergency.jsonl）
 * - 文件完整性自检与修复
 * 
 * @module event-bus
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

// ─── 路径常量 ───
const DATA_DIR = path.join(__dirname, 'data');
const EVENTS_FILE = path.join(DATA_DIR, 'events.jsonl');
const EMERGENCY_FILE = '/tmp/events-emergency.jsonl';
const CORRUPTED_FILE = EVENTS_FILE + '.corrupted';

// ─── 风暴抑制配置 ───
const DEDUPE_WINDOW_MS = 5000; // 5秒去重窗口

/**
 * 最近事件指纹缓存，用于风暴抑制
 * key: fingerprint string, value: timestamp (ms)
 * @type {Map<string, number>}
 */
const _recentEmits = new Map();

/**
 * 清理过期的去重指纹（超过窗口期的条目）
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
 * 生成事件ID：evt_{timestamp36}_{random6}
 * @returns {string} 事件唯一标识
 * @private
 */
function _generateId() {
  const ts = Date.now().toString(36);
  const rand = crypto.randomBytes(3).toString('hex');
  return `evt_${ts}_${rand}`;
}

/**
 * 计算事件指纹，用于风暴抑制去重
 * 指纹 = type + payload的JSON摘要（前200字符的hash）
 * @param {string} type - 事件类型
 * @param {object} payload - 事件载荷
 * @returns {string} 指纹字符串
 * @private
 */
function _fingerprint(type, payload) {
  const payloadStr = JSON.stringify(payload || {}).slice(0, 200);
  const hash = crypto.createHash('md5').update(payloadStr).digest('hex').slice(0, 8);
  return `${type}::${hash}`;
}

/**
 * 确保数据目录存在
 * @private
 */
function _ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * 原子追加写入：写入临时文件后rename，确保不会出现半写行
 * @param {string} filePath - 目标文件路径
 * @param {string} line - 要写入的一行内容（含换行符）
 * @private
 */
function _atomicAppend(filePath, line) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // 策略：先读取现有内容，追加新行，写到tmp，rename覆盖
  // 对于追加操作，直接用临时文件写新行再拼接更安全
  const tmpFile = path.join(dir, `.evt_tmp_${process.pid}_${Date.now()}`);
  try {
    // 读取现有内容
    let existing = '';
    try {
      existing = fs.readFileSync(filePath, 'utf8');
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
      // 文件不存在，从空开始
    }

    // 写入临时文件：existing + new line
    fs.writeFileSync(tmpFile, existing + line, { flag: 'w' });
    fs.renameSync(tmpFile, filePath);
  } finally {
    // 清理可能残留的临时文件
    try { fs.unlinkSync(tmpFile); } catch (_) { /* ignore */ }
  }
}

/**
 * 发射事件到事件总线
 * 
 * 功能：
 * 1. 生成结构化事件（含id, type, timestamp等）
 * 2. 风暴抑制：相同事件5秒内去重
 * 3. 原子写入 events.jsonl（临时文件→rename）
 * 4. 降级：写入失败时自动切换到 /tmp/events-emergency.jsonl
 * 
 * @param {string} type - 事件类型，格式: domain.object.verb (如 skill.created, rule.violated)
 * @param {object} [payload={}] - 事件载荷
 * @param {string} [source='unknown'] - 事件来源标识（emitter_id）
 * @param {object} [metadata={}] - 元数据（trace_id, correlation_id, confidence等）
 * @returns {{ id: string, suppressed: boolean } | null} 事件ID和是否被抑制，失败返回null
 * 
 * @example
 * // 基本使用
 * emit('skill.created', { skill_name: 'weather' }, 'skill-watcher');
 * 
 * // 带元数据
 * emit('user.intent.file_request.inferred', { text: '发文件' }, 'cras-probe', { confidence: 0.92 });
 */
function emit(type, payload, source, metadata) {
  if (!type || typeof type !== 'string') {
    throw new Error('EventBus.emit: type is required and must be a string');
  }

  payload = payload || {};
  source = source || 'unknown';
  metadata = metadata || {};

  // ─── 风暴抑制：相同事件5秒去重 ───
  _pruneDedupeCache();
  const fp = _fingerprint(type, payload);
  const lastEmit = _recentEmits.get(fp);
  if (lastEmit && (Date.now() - lastEmit) < DEDUPE_WINDOW_MS) {
    return { id: null, suppressed: true };
  }

  // 构造事件对象（符合v4 Schema）
  const event = {
    id: _generateId(),
    type,
    source,
    timestamp: Date.now(),
    payload,
    metadata
  };

  const line = JSON.stringify(event) + '\n';

  // ─── 尝试原子写入主文件 ───
  try {
    _ensureDataDir();
    _atomicAppend(EVENTS_FILE, line);
    _recentEmits.set(fp, event.timestamp);
    return { id: event.id, suppressed: false };
  } catch (primaryErr) {
    // ─── 降级：写入紧急文件 ───
    try {
      fs.appendFileSync(EMERGENCY_FILE, line);
      _recentEmits.set(fp, event.timestamp);
      return { id: event.id, suppressed: false, degraded: true };
    } catch (emergencyErr) {
      // 双重失败，输出到stderr作为最后手段
      process.stderr.write(`[EventBus CRITICAL] emit failed: ${primaryErr.message}, emergency also failed: ${emergencyErr.message}\n`);
      return null;
    }
  }
}

/**
 * 从事件总线消费事件
 * 
 * 支持：
 * - 精确匹配：type_filter = 'skill.created'
 * - 通配符匹配：type_filter = 'skill.*' 匹配 skill.created, skill.updated 等
 * - 前缀通配：'user.intent.*' 匹配 user.intent.file_request.inferred
 * - 后缀通配：'*.failed' 匹配 task.failed, handler.failed 等
 * - 时间过滤：since (ms timestamp)
 * - 层级过滤：layer (L1-L5, META)
 * - 数量限制：limit
 * 
 * @param {object} [options={}] - 消费选项
 * @param {string} [options.type_filter] - 事件类型过滤器，支持 * 通配符
 * @param {number} [options.since] - 只返回此时间戳之后的事件（ms）
 * @param {string} [options.layer] - 按事件层级过滤 (L1|L2|L3|L4|L5|META)
 * @param {number} [options.limit] - 最大返回数量
 * @returns {Array<object>} 匹配的事件数组
 * 
 * @example
 * // 获取最近5分钟的所有skill事件
 * consume({ type_filter: 'skill.*', since: Date.now() - 5 * 60 * 1000 });
 * 
 * // 获取最近10条L3层事件
 * consume({ layer: 'L3', limit: 10 });
 */
function consume(options) {
  options = options || {};

  // ─── 读取事件文件 ───
  let lines;
  try {
    const content = fs.readFileSync(EVENTS_FILE, 'utf8');
    lines = content.split('\n').filter(l => l.trim());
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }

  // ─── 解析所有行 ───
  let events = [];
  for (const line of lines) {
    try {
      events.push(JSON.parse(line));
    } catch (_) {
      // 跳过损坏行（healthCheck会修复）
    }
  }

  // ─── type_filter: 精确匹配 + 通配符 ───
  if (options.type_filter && options.type_filter !== '*') {
    const filter = options.type_filter;

    if (filter.includes('*')) {
      // 通配符 → 正则
      // 'skill.*' → /^skill\..+$/
      // '*.failed' → /^.+\.failed$/
      const regexStr = '^' + filter
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.+')
        + '$';
      const regex = new RegExp(regexStr);
      events = events.filter(e => regex.test(e.type));
    } else {
      events = events.filter(e => e.type === filter);
    }
  }

  // ─── since: 时间戳过滤 ───
  if (options.since && typeof options.since === 'number') {
    events = events.filter(e => e.timestamp >= options.since);
  }

  // ─── layer: 按层级过滤 ───
  if (options.layer) {
    events = events.filter(e => {
      // layer可能在顶层或metadata中
      return e.layer === options.layer ||
        (e.metadata && e.metadata.layer === options.layer);
    });
  }

  // ─── limit: 限制返回数量 ───
  if (options.limit && typeof options.limit === 'number') {
    events = events.slice(0, options.limit);
  }

  return events;
}

/**
 * 事件总线健康检查
 * 
 * 检查 events.jsonl 文件完整性：
 * - 验证每行是否为合法JSON
 * - 将损坏行移至 .corrupted 备份文件
 * - 重写主文件，仅保留有效行
 * - 如有修复，自动emit修复事件
 * 
 * @returns {{ ok: boolean, total: number, corrupted: number, file_exists: boolean, file_size: number }}
 * 
 * @example
 * const result = healthCheck();
 * // { ok: true, total: 42, corrupted: 0, file_exists: true, file_size: 8192 }
 */
function healthCheck() {
  _ensureDataDir();

  // 文件不存在 → 正常（首次启动）
  if (!fs.existsSync(EVENTS_FILE)) {
    return { ok: true, total: 0, corrupted: 0, file_exists: false, file_size: 0 };
  }

  let content;
  try {
    content = fs.readFileSync(EVENTS_FILE, 'utf8');
  } catch (e) {
    return { ok: false, total: 0, corrupted: 0, file_exists: true, file_size: 0, error: e.message };
  }

  const lines = content.split('\n').filter(l => l.trim());
  const validLines = [];
  let corruptedCount = 0;

  for (const line of lines) {
    try {
      JSON.parse(line);
      validLines.push(line);
    } catch (_) {
      corruptedCount++;
      // 损坏行保留到 .corrupted 文件作为证据
      try {
        fs.appendFileSync(CORRUPTED_FILE, line + '\n');
      } catch (_e) { /* best effort */ }
    }
  }

  // 如果有损坏行，重写文件
  if (corruptedCount > 0) {
    const repaired = validLines.join('\n') + (validLines.length ? '\n' : '');
    const tmpFile = EVENTS_FILE + '.repair_tmp';
    try {
      fs.writeFileSync(tmpFile, repaired);
      fs.renameSync(tmpFile, EVENTS_FILE);
    } catch (_) {
      try { fs.unlinkSync(tmpFile); } catch (_e) { /* ignore */ }
    }

    // emit修复事件（避免递归，直接appendFile）
    try {
      const repairEvent = {
        id: _generateId(),
        type: 'system.eventbus.repaired',
        source: 'bus-healthcheck',
        timestamp: Date.now(),
        payload: { corrupted_lines: corruptedCount, total_valid: validLines.length },
        metadata: {}
      };
      fs.appendFileSync(EVENTS_FILE, JSON.stringify(repairEvent) + '\n');
    } catch (_) { /* best effort */ }
  }

  const stat = fs.statSync(EVENTS_FILE);
  return {
    ok: true,
    total: validLines.length,
    corrupted: corruptedCount,
    file_exists: true,
    file_size: stat.size
  };
}

/**
 * 获取事件总线统计信息
 * @returns {{ total_events: number, file_size: number, dedupe_cache_size: number, emergency_exists: boolean }}
 */
function stats() {
  let totalEvents = 0;
  let fileSize = 0;

  try {
    const stat = fs.statSync(EVENTS_FILE);
    fileSize = stat.size;
    const content = fs.readFileSync(EVENTS_FILE, 'utf8');
    totalEvents = content.split('\n').filter(l => l.trim()).length;
  } catch (_) { /* file may not exist */ }

  let emergencyExists = false;
  try {
    fs.accessSync(EMERGENCY_FILE);
    emergencyExists = true;
  } catch (_) { /* no emergency file */ }

  return {
    total_events: totalEvents,
    file_size: fileSize,
    dedupe_cache_size: _recentEmits.size,
    emergency_exists: emergencyExists,
    events_file: EVENTS_FILE,
    data_dir: DATA_DIR
  };
}

/**
 * 清除风暴抑制缓存（测试用）
 * @private
 */
function _clearDedupeCache() {
  _recentEmits.clear();
}

// ─── 导出 ───
module.exports = {
  emit,
  consume,
  healthCheck,
  stats,
  // 内部常量导出（便于测试和外部引用）
  EVENTS_FILE,
  EMERGENCY_FILE,
  DATA_DIR,
  DEDUPE_WINDOW_MS,
  // 测试辅助
  _clearDedupeCache,
  _generateId,
  _fingerprint
};


// ═══════════════════════════════════════════════════════════
// 单元测试 — node event-bus.js 直接运行
// ═══════════════════════════════════════════════════════════
if (require.main === module) {
  const assert = require('assert');
  const testDir = path.join(os.tmpdir(), `eventbus-test-${Date.now()}`);
  const testEventsFile = path.join(testDir, 'events.jsonl');

  // 临时覆盖内部路径（通过修改模块内部变量实现不了，用独立测试函数）
  // 改用独立的测试方式：直接操作文件验证

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

  console.log('\n🧪 EventBus 单元测试\n');

  // ─── 准备：清理测试环境 ───
  // 备份并清空主events文件
  let backupContent = null;
  try {
    backupContent = fs.readFileSync(EVENTS_FILE, 'utf8');
  } catch (_) { /* no file to backup */ }

  // 确保data目录存在
  _ensureDataDir();

  // 清空events文件用于测试
  try { fs.writeFileSync(EVENTS_FILE, ''); } catch (_) {}
  _clearDedupeCache();

  // ─── Test 1: emit 基本功能 ───
  test('emit() 返回事件ID', () => {
    const result = emit('test.basic', { foo: 'bar' }, 'unit-test');
    assert.ok(result, 'emit should return a result');
    assert.ok(result.id, 'result should have id');
    assert.ok(result.id.startsWith('evt_'), `id should start with evt_, got: ${result.id}`);
    assert.strictEqual(result.suppressed, false);
  });

  // ─── Test 2: emit 写入文件 ───
  test('emit() 写入events.jsonl', () => {
    const content = fs.readFileSync(EVENTS_FILE, 'utf8');
    const lines = content.split('\n').filter(l => l.trim());
    assert.ok(lines.length >= 1, 'should have at least 1 event');
    const event = JSON.parse(lines[lines.length - 1]);
    assert.strictEqual(event.type, 'test.basic');
    assert.strictEqual(event.source, 'unit-test');
    assert.deepStrictEqual(event.payload, { foo: 'bar' });
  });

  // ─── Test 3: 风暴抑制 ───
  test('emit() 5秒内相同事件被抑制', () => {
    _clearDedupeCache();
    const r1 = emit('test.storm', { key: 'same' }, 'unit-test');
    const r2 = emit('test.storm', { key: 'same' }, 'unit-test');
    assert.strictEqual(r1.suppressed, false, 'first should not be suppressed');
    assert.strictEqual(r2.suppressed, true, 'second should be suppressed');
  });

  test('emit() 不同payload不被抑制', () => {
    _clearDedupeCache();
    const r1 = emit('test.storm2', { key: 'a' }, 'unit-test');
    const r2 = emit('test.storm2', { key: 'b' }, 'unit-test');
    assert.strictEqual(r1.suppressed, false);
    assert.strictEqual(r2.suppressed, false);
  });

  // ─── Test 4: consume 基本功能 ───
  test('consume() 读取所有事件', () => {
    const events = consume();
    assert.ok(events.length >= 1, 'should have events');
  });

  // ─── Test 5: consume 精确过滤 ───
  test('consume() 精确type_filter', () => {
    _clearDedupeCache();
    fs.writeFileSync(EVENTS_FILE, '');
    emit('skill.created', { name: 'a' }, 'test');
    emit('skill.updated', { name: 'b' }, 'test');
    emit('rule.violated', { id: 'R001' }, 'test');

    const skills = consume({ type_filter: 'skill.created' });
    assert.strictEqual(skills.length, 1);
    assert.strictEqual(skills[0].type, 'skill.created');
  });

  // ─── Test 6: consume 通配符过滤 ───
  test('consume() 通配符 skill.*', () => {
    const skills = consume({ type_filter: 'skill.*' });
    assert.strictEqual(skills.length, 2, `expected 2 skill events, got ${skills.length}`);
    assert.ok(skills.every(e => e.type.startsWith('skill.')));
  });

  test('consume() 通配符 *.violated', () => {
    const violated = consume({ type_filter: '*.violated' });
    assert.strictEqual(violated.length, 1);
    assert.strictEqual(violated[0].type, 'rule.violated');
  });

  // ─── Test 7: consume since过滤 ───
  test('consume() since时间过滤', () => {
    const futureTs = Date.now() + 100000;
    const result = consume({ since: futureTs });
    assert.strictEqual(result.length, 0, 'future since should return 0 events');
  });

  // ─── Test 8: consume limit ───
  test('consume() limit限制', () => {
    const result = consume({ limit: 1 });
    assert.strictEqual(result.length, 1);
  });

  // ─── Test 9: healthCheck 正常文件 ───
  test('healthCheck() 正常文件返回ok', () => {
    const result = healthCheck();
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.corrupted, 0);
    assert.ok(result.total >= 1);
  });

  // ─── Test 10: healthCheck 损坏行修复 ───
  test('healthCheck() 修复损坏行', () => {
    // 注入一行损坏数据
    fs.appendFileSync(EVENTS_FILE, 'THIS IS NOT JSON\n');
    const result = healthCheck();
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.corrupted, 1);

    // 验证修复后文件不含损坏行
    const content = fs.readFileSync(EVENTS_FILE, 'utf8');
    assert.ok(!content.includes('THIS IS NOT JSON'), 'corrupted line should be removed');
  });

  // ─── Test 11: stats ───
  test('stats() 返回统计信息', () => {
    const s = stats();
    assert.ok(typeof s.total_events === 'number');
    assert.ok(typeof s.file_size === 'number');
    assert.ok(typeof s.dedupe_cache_size === 'number');
  });

  // ─── Test 12: emit 参数校验 ───
  test('emit() type为空时抛出错误', () => {
    assert.throws(() => emit('', {}, 'test'), /type is required/);
    assert.throws(() => emit(null, {}, 'test'), /type is required/);
  });

  // ─── Test 13: _generateId 格式 ───
  test('_generateId() 格式正确', () => {
    const id = _generateId();
    assert.ok(id.startsWith('evt_'));
    const parts = id.split('_');
    assert.strictEqual(parts.length, 3);
  });

  // ─── Test 14: _fingerprint 一致性 ───
  test('_fingerprint() 相同输入相同输出', () => {
    const fp1 = _fingerprint('test.type', { a: 1 });
    const fp2 = _fingerprint('test.type', { a: 1 });
    assert.strictEqual(fp1, fp2);
  });

  test('_fingerprint() 不同输入不同输出', () => {
    const fp1 = _fingerprint('test.type', { a: 1 });
    const fp2 = _fingerprint('test.type', { a: 2 });
    assert.notStrictEqual(fp1, fp2);
  });

  // ─── Test 15: consume 空文件 ───
  test('consume() events文件不存在返回空数组', () => {
    const bak = fs.readFileSync(EVENTS_FILE, 'utf8');
    fs.unlinkSync(EVENTS_FILE);
    const result = consume();
    assert.deepStrictEqual(result, []);
    fs.writeFileSync(EVENTS_FILE, bak);
  });

  // ─── 清理：恢复备份 ───
  if (backupContent !== null) {
    fs.writeFileSync(EVENTS_FILE, backupContent);
  } else {
    try { fs.unlinkSync(EVENTS_FILE); } catch (_) {}
  }
  // 清理corrupted文件
  try { fs.unlinkSync(CORRUPTED_FILE); } catch (_) {}
  _clearDedupeCache();

  // ─── 报告 ───
  console.log(`\n📊 结果: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  process.exit(failed > 0 ? 1 : 0);
}
