'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Feature Flag 统一配置模块 v2
 * 
 * Day 2 凌霄阁裁决：每个L3功能必须自带降级开关
 * 
 * 优先级：环境变量 > 配置文件 > 默认值
 * 支持运行时 reload（不重启进程）
 * 支持原子性全量降级（pipeline.enabled=false → L2直通）
 */

// ── 默认值（硬编码兜底） ──────────────────────────────
const DEFAULTS = Object.freeze({
  // ─── 核心模块开关 ───
  L3_PIPELINE_ENABLED:              false,   // 总开关，false = L2直通
  L3_EVENTBUS_ENABLED:              true,
  L3_RULEMATCHER_ENABLED:           true,
  L3_INTENTSCANNER_ENABLED:         true,
  L3_INTENTSCANNER_LLM_ENABLED:     true,    // LLM路径开关，false = regex降级
  L3_DISPATCHER_ENABLED:            true,
  L3_DECISIONLOG_ENABLED:           true,
  L3_STORM_SUPPRESSION_ENABLED:     true,    // EventBus风暴抑制
  L3_OBSERVABILITY_ENABLED:         true,    // 可观测性模块
  L3_CIRCUIT_BREAKER_DEPTH:         5,       // 断路器最大链深度

  // ─── Handler 独立开关 ───
  L3_HANDLER_USER_MESSAGE_ROUTER:   true,
  L3_HANDLER_INTENT_DISPATCH:       true,
  L3_HANDLER_ISC_RULE:              true,
  L3_HANDLER_SKILL_ISC:             true,
  L3_HANDLER_SKILL_DTO:             true,
  L3_HANDLER_SKILL_CRAS:            true,
  L3_HANDLER_CRAS_FEEDBACK:         true,
  L3_HANDLER_CRAS_KNOWLEDGE:        true,
  L3_HANDLER_DEV_TASK:              true,
  L3_HANDLER_ANALYSIS:              true,
  L3_HANDLER_MEMORY_ARCHIVER:       true,
  L3_HANDLER_ECHO:                  true,
});

// ── 类型元数据（用于环境变量解析） ─────────────────────
const FLAG_TYPES = Object.freeze({
  L3_PIPELINE_ENABLED:              'boolean',
  L3_EVENTBUS_ENABLED:              'boolean',
  L3_RULEMATCHER_ENABLED:           'boolean',
  L3_INTENTSCANNER_ENABLED:         'boolean',
  L3_INTENTSCANNER_LLM_ENABLED:     'boolean',
  L3_DISPATCHER_ENABLED:            'boolean',
  L3_DECISIONLOG_ENABLED:           'boolean',
  L3_STORM_SUPPRESSION_ENABLED:     'boolean',
  L3_OBSERVABILITY_ENABLED:         'boolean',
  L3_CIRCUIT_BREAKER_DEPTH:         'number',

  L3_HANDLER_USER_MESSAGE_ROUTER:   'boolean',
  L3_HANDLER_INTENT_DISPATCH:       'boolean',
  L3_HANDLER_ISC_RULE:              'boolean',
  L3_HANDLER_SKILL_ISC:             'boolean',
  L3_HANDLER_SKILL_DTO:             'boolean',
  L3_HANDLER_SKILL_CRAS:            'boolean',
  L3_HANDLER_CRAS_FEEDBACK:         'boolean',
  L3_HANDLER_CRAS_KNOWLEDGE:        'boolean',
  L3_HANDLER_DEV_TASK:              'boolean',
  L3_HANDLER_ANALYSIS:              'boolean',
  L3_HANDLER_MEMORY_ARCHIVER:       'boolean',
  L3_HANDLER_ECHO:                  'boolean',
});

// ── Handler 名称 → Flag 名称映射 ─────────────────────
const HANDLER_FLAG_MAP = Object.freeze({
  'user-message-router':   'L3_HANDLER_USER_MESSAGE_ROUTER',
  'intent-dispatch':       'L3_HANDLER_INTENT_DISPATCH',
  'isc-rule-handler':      'L3_HANDLER_ISC_RULE',
  'skill-isc-handler':     'L3_HANDLER_SKILL_ISC',
  'skill-dto-handler':     'L3_HANDLER_SKILL_DTO',
  'skill-cras-handler':    'L3_HANDLER_SKILL_CRAS',
  'cras-feedback-handler': 'L3_HANDLER_CRAS_FEEDBACK',
  'cras-knowledge-handler':'L3_HANDLER_CRAS_KNOWLEDGE',
  'dev-task-handler':      'L3_HANDLER_DEV_TASK',
  'analysis-handler':      'L3_HANDLER_ANALYSIS',
  'memory-archiver':       'L3_HANDLER_MEMORY_ARCHIVER',
  'echo':                  'L3_HANDLER_ECHO',
});

// ── 配置文件路径 ──────────────────────────────────────
const CONFIG_FILE = path.resolve(__dirname, 'flags.json');

// ── 内部状态 ──────────────────────────────────────────
let _fileConfig = {};
let _resolved = {};
let _lastLoadTime = 0;
let _listeners = [];      // onChange listeners

// ── 辅助函数 ──────────────────────────────────────────

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

function loadFileConfig() {
  try {
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

function readEnv(flagName) {
  const raw = process.env[flagName];
  if (raw === undefined) return undefined;
  const type = FLAG_TYPES[flagName] || 'string';
  return parseValue(raw, type);
}

function resolve() {
  const result = {};
  const allKeys = new Set([
    ...Object.keys(DEFAULTS),
    ...Object.keys(_fileConfig),
  ]);
  for (const key of allKeys) {
    const envVal = readEnv(key);
    if (envVal !== undefined) { result[key] = envVal; continue; }
    const fileVal = _fileConfig[key];
    if (fileVal !== undefined) {
      const type = FLAG_TYPES[key];
      const parsed = type ? parseValue(fileVal, type) : fileVal;
      if (parsed !== undefined) { result[key] = parsed; continue; }
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

function get(flagName) {
  const envVal = readEnv(flagName);
  if (envVal !== undefined) return envVal;
  return _resolved[flagName];
}

function getAll() {
  const snapshot = { ..._resolved };
  for (const key of Object.keys(snapshot)) {
    const envVal = readEnv(key);
    if (envVal !== undefined) snapshot[key] = envVal;
  }
  return snapshot;
}

function isEnabled(flagName) {
  const val = get(flagName);
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val > 0;
  return false;
}

/**
 * 检查某个 handler 是否启用
 * @param {string} handlerName - handler 文件名（不含 .js）
 * @returns {boolean}
 */
function isHandlerEnabled(handlerName) {
  const flagName = HANDLER_FLAG_MAP[handlerName];
  if (!flagName) return true; // 未注册的 handler 默认启用
  return isEnabled(flagName);
}

/**
 * 原子性设置 flag 并持久化到配置文件
 * 用于降级演练和紧急降级
 * @param {string} flagName
 * @param {*} value
 * @returns {{ success: boolean, previous: *, current: *, persistedAt: number }}
 */
function set(flagName, value) {
  const previous = get(flagName);
  _fileConfig[flagName] = value;
  
  // 持久化到 flags.json
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(_fileConfig, null, 2) + '\n', 'utf-8');
  } catch (err) {
    // 回滚内存状态
    if (previous !== undefined) _fileConfig[flagName] = previous;
    else delete _fileConfig[flagName];
    return { success: false, error: err.message };
  }
  
  _resolved = resolve();
  const persistedAt = Date.now();
  _lastLoadTime = persistedAt;

  // 通知 listeners
  for (const fn of _listeners) {
    try { fn(flagName, previous, value); } catch (_) {}
  }

  return { success: true, previous, current: value, persistedAt };
}

/**
 * 全量降级：关闭 L3 Pipeline，切换到 L2 直通
 * @returns {{ success: boolean, switchTime: number }}
 */
function degradeToL2() {
  const start = Date.now();
  const result = set('L3_PIPELINE_ENABLED', false);
  const switchTime = Date.now() - start;
  return { ...result, switchTime };
}

/**
 * 恢复 L3 Pipeline
 * @returns {{ success: boolean, switchTime: number }}
 */
function restoreL3() {
  const start = Date.now();
  const result = set('L3_PIPELINE_ENABLED', true);
  const switchTime = Date.now() - start;
  return { ...result, switchTime };
}

function reload() {
  _fileConfig = loadFileConfig();
  _resolved = resolve();
  _lastLoadTime = Date.now();
  return { loaded: _lastLoadTime, resolved: { ..._resolved } };
}

function getDefaults() { return { ...DEFAULTS }; }
function getLastLoadTime() { return _lastLoadTime; }
function getConfigPath() { return CONFIG_FILE; }
function getHandlerFlagMap() { return { ...HANDLER_FLAG_MAP }; }

/**
 * 注册变更监听器
 * @param {Function} fn - (flagName, oldVal, newVal) => void
 * @returns {Function} 取消注册函数
 */
function onChange(fn) {
  _listeners.push(fn);
  return () => { _listeners = _listeners.filter(f => f !== fn); };
}

// ── 导出 ──────────────────────────────────────────────
module.exports = {
  get,
  getAll,
  isEnabled,
  isHandlerEnabled,
  set,
  degradeToL2,
  restoreL3,
  reload,
  onChange,
  getDefaults,
  getLastLoadTime,
  getConfigPath,
  getHandlerFlagMap,
  _DEFAULTS: DEFAULTS,
  _FLAG_TYPES: FLAG_TYPES,
  _HANDLER_FLAG_MAP: HANDLER_FLAG_MAP,
};
