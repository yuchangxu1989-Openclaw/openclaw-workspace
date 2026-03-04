'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Feature Flag 统一配置模块
 * 
 * 优先级：环境变量 > 配置文件 > 默认值
 * 支持运行时 reload（不重启进程）
 */

// ── 默认值（硬编码兜底） ──────────────────────────────
const DEFAULTS = Object.freeze({
  L3_PIPELINE_ENABLED:        false,
  L3_EVENTBUS_ENABLED:        true,
  L3_RULEMATCHER_ENABLED:     true,
  L3_INTENTSCANNER_ENABLED:   true,
  L3_DISPATCHER_ENABLED:      true,
  L3_DECISIONLOG_ENABLED:     true,
  L3_CIRCUIT_BREAKER_DEPTH:   5,
});

// ── 类型元数据（用于环境变量解析） ─────────────────────
const FLAG_TYPES = Object.freeze({
  L3_PIPELINE_ENABLED:        'boolean',
  L3_EVENTBUS_ENABLED:        'boolean',
  L3_RULEMATCHER_ENABLED:     'boolean',
  L3_INTENTSCANNER_ENABLED:   'boolean',
  L3_DISPATCHER_ENABLED:      'boolean',
  L3_DECISIONLOG_ENABLED:     'boolean',
  L3_CIRCUIT_BREAKER_DEPTH:   'number',
});

// ── 配置文件路径 ──────────────────────────────────────
const CONFIG_FILE = path.resolve(__dirname, 'flags.json');

// ── 内部状态 ──────────────────────────────────────────
let _fileConfig = {};   // 从 flags.json 读取的配置
let _resolved = {};     // 最终合并后的配置快照
let _lastLoadTime = 0;  // 上次加载时间戳

// ── 辅助函数 ──────────────────────────────────────────

/**
 * 将字符串按目标类型解析
 */
function parseValue(raw, type) {
  if (raw === undefined || raw === null) return undefined;
  switch (type) {
    case 'boolean':
      if (typeof raw === 'boolean') return raw;
      if (typeof raw === 'string') {
        const lower = raw.trim().toLowerCase();
        if (lower === 'true' || lower === '1' || lower === 'yes') return true;
        if (lower === 'false' || lower === '0' || lower === 'no' || lower === '') return false;
      }
      if (typeof raw === 'number') return raw !== 0;
      return Boolean(raw);
    case 'number':
      if (typeof raw === 'number') return raw;
      const n = Number(raw);
      return Number.isNaN(n) ? undefined : n;
    default:
      return raw;
  }
}

/**
 * 从配置文件加载（容错：文件不存在或格式错误返回空对象）
 */
function loadFileConfig() {
  try {
    // 绕过 require 缓存，支持热重载
    const content = fs.readFileSync(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
    return {};
  } catch (_e) {
    return {};
  }
}

/**
 * 从环境变量读取某个 flag
 */
function readEnv(flagName) {
  const raw = process.env[flagName];
  if (raw === undefined) return undefined;
  const type = FLAG_TYPES[flagName] || 'string';
  return parseValue(raw, type);
}

/**
 * 合并三层配置源，生成最终快照
 */
function resolve() {
  const result = {};
  const allKeys = new Set([
    ...Object.keys(DEFAULTS),
    ...Object.keys(_fileConfig),
  ]);
  for (const key of allKeys) {
    // 优先级：env > file > default
    const envVal = readEnv(key);
    if (envVal !== undefined) {
      result[key] = envVal;
      continue;
    }
    const fileVal = _fileConfig[key];
    if (fileVal !== undefined) {
      const type = FLAG_TYPES[key];
      const parsed = type ? parseValue(fileVal, type) : fileVal;
      if (parsed !== undefined) {
        result[key] = parsed;
        continue;
      }
    }
    if (DEFAULTS[key] !== undefined) {
      result[key] = DEFAULTS[key];
    }
  }
  return result;
}

// ── 初始加载 ──────────────────────────────────────────
function init() {
  _fileConfig = loadFileConfig();
  _resolved = resolve();
  _lastLoadTime = Date.now();
}

init();

// ── 公共 API ──────────────────────────────────────────

/**
 * 获取 flag 值（任意类型）
 * @param {string} flagName - flag 名称
 * @returns {*} flag 值，未定义返回 undefined
 */
function get(flagName) {
  // 每次 get 都实时检查 env（env 可能运行时变化）
  const envVal = readEnv(flagName);
  if (envVal !== undefined) return envVal;
  return _resolved[flagName];
}

/**
 * 获取所有 flag 快照（返回浅拷贝）
 * @returns {Object} 所有 flag 键值对
 */
function getAll() {
  // 合并实时 env 覆盖
  const snapshot = { ..._resolved };
  for (const key of Object.keys(snapshot)) {
    const envVal = readEnv(key);
    if (envVal !== undefined) snapshot[key] = envVal;
  }
  return snapshot;
}

/**
 * 判断 boolean flag 是否启用
 * @param {string} flagName - flag 名称
 * @returns {boolean}
 */
function isEnabled(flagName) {
  const val = get(flagName);
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val > 0;
  return false;
}

/**
 * 运行时重新加载配置文件（不重启进程）
 * 环境变量无需 reload，每次 get 已实时读取
 * @returns {{ loaded: number, resolved: Object }} 加载结果
 */
function reload() {
  _fileConfig = loadFileConfig();
  _resolved = resolve();
  _lastLoadTime = Date.now();
  return {
    loaded: _lastLoadTime,
    resolved: { ..._resolved },
  };
}

/**
 * 获取默认值表（只读）
 * @returns {Object}
 */
function getDefaults() {
  return { ...DEFAULTS };
}

/**
 * 获取上次加载时间戳
 * @returns {number}
 */
function getLastLoadTime() {
  return _lastLoadTime;
}

/**
 * 获取配置文件路径
 * @returns {string}
 */
function getConfigPath() {
  return CONFIG_FILE;
}

// ── 导出 ──────────────────────────────────────────────
module.exports = {
  get,
  getAll,
  isEnabled,
  reload,
  getDefaults,
  getLastLoadTime,
  getConfigPath,
  // 内部常量导出（供测试使用）
  _DEFAULTS: DEFAULTS,
  _FLAG_TYPES: FLAG_TYPES,
};
