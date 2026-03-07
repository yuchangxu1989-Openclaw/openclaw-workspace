'use strict';

/**
 * L3 Gateway — 将L3 Pipeline从旁路监听升级为主路处理
 *
 * 核心机制：
 *   1. 拦截 bus-adapter.emit()，实时捕获事件
 *   2. FeatureFlag 控制哪些事件类型走 L3 主路
 *   3. L3 处理链：IntentScanner → RuleMatcher → Dispatcher v2 → Handler
 *   4. L3 失败自动 fallback 到旧路径（事件不 ack，旧 dispatcher 自动消费）
 *   5. Shadow 模式：双路径对比日志
 *
 * FeatureFlag 环境变量：
 *   L3_MAINLINE_ENABLED   — 总开关 (default: true)
 *   L3_MAINLINE_EVENTS    — 逗号分隔的事件类型模式 (default: 'user.message')
 *   L3_SHADOW_MODE        — 影子模式，双路径对比 (default: false)
 *   L3_FALLBACK_ENABLED   — 失败时回退旧路径 (default: true)
 *
 * CommonJS · 纯 Node.js · 无外部依赖
 */

const fs = require('fs');
const path = require('path');

// ─── CRAS Inline Intent Hook（快路运行时接线） ───
let _extractIntentInline = null;
function getInlineIntentExtractor() {
  if (!_extractIntentInline) {
    ({ extractIntentInline: _extractIntentInline } = require('../../skills/cras/intent-inline-hook'));
  }
  return _extractIntentInline;
}

// ═══════════════════════════════════════════════════════════
// 依赖模块（延迟加载避免循环依赖）
// ═══════════════════════════════════════════════════════════

let _busAdapter = null;
let _legacyBus = null;
let _RuleMatcher = null;
let _IntentScanner = null;
let _Dispatcher = null;
let _decisionLog = null;

function getBusAdapter() {
  if (!_busAdapter) _busAdapter = require('../event-bus/bus-adapter');
  return _busAdapter;
}

function getLegacyBus() {
  if (!_legacyBus) _legacyBus = require('../event-bus/bus');
  return _legacyBus;
}

function getRuleMatcher() {
  if (!_RuleMatcher) {
    const mod = require('../rule-engine/isc-rule-matcher');
    _RuleMatcher = mod.getDefaultMatcher();
  }
  return _RuleMatcher;
}

function getIntentScanner() {
  if (!_IntentScanner) {
    const { IntentScanner } = require('../intent-engine/intent-scanner');
    _IntentScanner = new IntentScanner();
  }
  return _IntentScanner;
}

function getDispatcher() {
  if (!_Dispatcher) _Dispatcher = require('../dispatcher/dispatcher');
  return _Dispatcher;
}

function getDecisionLog() {
  if (_decisionLog === null) {
    try {
      _decisionLog = require('../decision-log/decision-logger');
    } catch (_) {
      _decisionLog = { log: () => {} };
    }
  }
  return _decisionLog;
}

// ═══════════════════════════════════════════════════════════
// 常量 & 日志
// ═══════════════════════════════════════════════════════════

const GATEWAY_LOG_FILE = path.join(__dirname, 'l3-gateway.log.jsonl');
const COMPARISON_LOG_FILE = path.join(__dirname, 'l3-comparison.log.jsonl');
const CONSUMER_ID = 'l3-gateway';

const CONVERSATION_PREFIXES = [
  'user.message', 'conversation.', 'chat.', 'dialog.',
];

// ═══════════════════════════════════════════════════════════
// FeatureFlag
// ═══════════════════════════════════════════════════════════

function getFlag(envKey, defaultVal) {
  const val = process.env[envKey];
  if (val === undefined || val === '') return defaultVal;
  if (typeof defaultVal === 'boolean') {
    return val !== 'false' && val !== '0';
  }
  return val;
}

function getGatewayFlags() {
  return {
    enabled: getFlag('L3_MAINLINE_ENABLED', true),
    events: getFlag('L3_MAINLINE_EVENTS', 'user.message').split(',').map(s => s.trim()).filter(Boolean),
    shadowMode: getFlag('L3_SHADOW_MODE', false),
    fallbackEnabled: getFlag('L3_FALLBACK_ENABLED', true),
  };
}

/**
 * 检查事件类型是否匹配 L3 主路事件列表
 * 支持精确匹配和前缀通配 (e.g. 'isc.rule.*')
 */
function isL3Event(eventType, patterns) {
  for (const pattern of patterns) {
    if (pattern === eventType) return true;
    if (pattern === '*') return true;
    if (pattern.endsWith('.*')) {
      const prefix = pattern.slice(0, -2);
      if (eventType === prefix || eventType.startsWith(prefix + '.')) return true;
    }
    // 前缀匹配（不带通配符也做前缀）
    if (eventType.startsWith(pattern + '.')) return true;
  }
  return false;
}

function isConversationEvent(eventType) {
  if (!eventType) return false;
  const t = eventType.toLowerCase();
  return CONVERSATION_PREFIXES.some(prefix => t.startsWith(prefix));
}

// ═══════════════════════════════════════════════════════════
// 日志写入
// ═══════════════════════════════════════════════════════════

function appendLog(filePath, entry) {
  try {
    const line = JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n';
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.appendFileSync(filePath, line, 'utf8');
  } catch (_) { /* non-fatal */ }
}

function gatewayLog(entry) {
  appendLog(GATEWAY_LOG_FILE, entry);
}

function comparisonLog(entry) {
  appendLog(COMPARISON_LOG_FILE, entry);
}

// ═══════════════════════════════════════════════════════════
// L3 单事件处理链
// ═══════════════════════════════════════════════════════════

/**
 * 通过 L3 全流程处理单个事件
 *
 * 流程：IntentScanner (对话类) → RuleMatcher → Dispatcher v2 → Handler
 *
 * @param {object} event - 标准化事件对象 { id, type, source, payload, timestamp, metadata }
 * @returns {Promise<object>} 处理结果摘要
 */
async function processEventL3(event) {
  const startTime = Date.now();
  const traceId = `l3gw_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  const result = {
    trace_id: traceId,
    event_type: event.type,
    event_id: event.id || 'unknown',
    stages: [],
    matched_rules: 0,
    intents_detected: 0,
    dispatched_actions: 0,
    success: false,
    error: null,
    duration_ms: 0,
  };

  try {
    // ─── Stage 1a: CRAS Inline Intent Hook（真正接入运行时快路） ───
    if (isConversationEvent(event.type)) {
      let inlineResult = null;
      try {
        const inlineExtractor = getInlineIntentExtractor();
        inlineResult = await inlineExtractor((event.payload && event.payload.text) || '', {
          channel: event.payload?.channel || event.channel || 'unknown',
          session_id: event.payload?.session_id || event.payload?.sessionId || event.session_id || event.sessionId || event.id || 'unknown',
          history: Array.isArray(event.payload?.history) ? event.payload.history : [],
          messages: Array.isArray(event.payload?.messages) ? event.payload.messages : [],
          recentRounds: Array.isArray(event.payload?.recentRounds) ? event.payload.recentRounds : [],
        });
      } catch (inlineErr) {
        gatewayLog({
          stage: 'intent-inline-hook',
          trace_id: traceId,
          event_type: event.type,
          status: 'failed',
          error: inlineErr.message,
        });
      }

      const inlineCount = Array.isArray(inlineResult?.intents) ? inlineResult.intents.length : 0;
      result.inline_intents_detected = inlineCount;
      result.stages.push({
        name: 'IntentInlineHook',
        status: inlineCount > 0 ? 'ok' : 'no_intent',
        intents: inlineCount,
        details: Array.isArray(inlineResult?.intents)
          ? inlineResult.intents.map(i => ({ type: i.type, confidence: i.confidence }))
          : [],
      });

      gatewayLog({
        stage: 'intent-inline-hook',
        trace_id: traceId,
        event_type: event.type,
        intents: inlineCount,
        status: inlineCount > 0 ? 'ok' : 'no_intent',
      });
    }

    // ─── Stage 1b: IntentScanner（仅对话类事件，且受 flag 控制） ───
    let scanResult = null;
    const intentEnabled = getFlag('INTENT_SCANNER_ENABLED', true) && getFlag('L3_INTENTSCANNER_ENABLED', true);
    if (isConversationEvent(event.type) && intentEnabled) {
      const scanner = getIntentScanner();
      const slice = eventToConversationSlice(event);

      if (slice.length > 0) {
        scanResult = await scanner.scan(slice);
        const intentCount = (scanResult && scanResult.intents) ? scanResult.intents.length : 0;
        result.intents_detected = intentCount;
        result.stages.push({
          name: 'IntentScanner',
          status: 'ok',
          intents: intentCount,
          method: scanResult ? scanResult.method : 'none',
          details: scanResult && scanResult.intents
            ? scanResult.intents.map(i => ({ id: i.intent_id, confidence: i.confidence }))
            : [],
        });

        gatewayLog({
          stage: 'intent-scanner',
          trace_id: traceId,
          event_type: event.type,
          intents: intentCount,
          method: scanResult ? scanResult.method : 'none',
        });
      } else {
        result.stages.push({
          name: 'IntentScanner',
          status: 'skipped',
          reason: 'empty conversation slice',
        });
      }
    } else if (isConversationEvent(event.type) && !intentEnabled) {
      result.stages.push({
        name: 'IntentScanner',
        status: 'skipped',
        reason: 'INTENT_SCANNER_ENABLED=false (runtime)',
      });
    } else {
      result.stages.push({
        name: 'IntentScanner',
        status: 'skipped',
        reason: 'non-conversation event',
      });
    }

    // ─── Stage 2: RuleMatcher ───
    const matcher = getRuleMatcher();
    const matchedRules = matcher.process(event);
    result.matched_rules = matchedRules.length;

    result.stages.push({
      name: 'RuleMatcher',
      status: 'ok',
      matched: matchedRules.length,
      rules: matchedRules.map(m => ({
        id: m.rule.id || m.rule.name || 'unnamed',
        priority: m.priority,
        match_type: m.match_type,
      })),
    });

    gatewayLog({
      stage: 'rule-matcher',
      trace_id: traceId,
      event_type: event.type,
      matched: matchedRules.length,
      rules: matchedRules.map(m => m.rule.id || m.rule.name || 'unnamed'),
    });

    // ─── Stage 3: Dispatcher v2 ───
    const dispatcher = getDispatcher();
    const dispatchResults = [];

    if (matchedRules.length > 0) {
      for (const match of matchedRules) {
        try {
          const dispResult = await dispatcher.dispatch(match.rule, event);
          dispatchResults.push({
            rule_id: match.rule.id || match.rule.name || 'unnamed',
            handler: dispResult.handler,
            success: dispResult.success,
            duration: dispResult.duration,
            retried: dispResult.retried,
          });
          if (dispResult.success) result.dispatched_actions++;
        } catch (dispErr) {
          dispatchResults.push({
            rule_id: match.rule.id || match.rule.name || 'unnamed',
            handler: 'error',
            success: false,
            error: dispErr.message,
          });
        }
      }
    } else if (event.type) {
      // 无匹配规则时，尝试直接路由（使用事件类型作为action）
      try {
        const directRule = { action: event.type };
        const dispResult = await dispatcher.dispatch(directRule, event);
        dispatchResults.push({
          rule_id: 'direct-route',
          handler: dispResult.handler,
          success: dispResult.success,
          duration: dispResult.duration,
        });
        if (dispResult.success) result.dispatched_actions++;
      } catch (dispErr) {
        dispatchResults.push({
          rule_id: 'direct-route',
          handler: 'error',
          success: false,
          error: dispErr.message,
        });
      }
    }

    result.stages.push({
      name: 'Dispatcher',
      status: dispatchResults.length > 0 ? 'ok' : 'no_dispatch',
      dispatched: dispatchResults.length,
      results: dispatchResults,
    });

    gatewayLog({
      stage: 'dispatcher',
      trace_id: traceId,
      event_type: event.type,
      dispatched: dispatchResults.length,
      results: dispatchResults.map(r => ({
        handler: r.handler,
        success: r.success,
      })),
    });

    result.success = true;
  } catch (err) {
    result.error = err.message;
    result.stages.push({
      name: 'error',
      status: 'failed',
      error: err.message,
      stack: err.stack ? err.stack.split('\n').slice(0, 3).join(' | ') : '',
    });
  }

  result.duration_ms = Date.now() - startTime;

  // Decision Log 写入
  try {
    getDecisionLog().log({
      phase: 'execution',
      component: 'L3Gateway',
      decision: result.success
        ? `L3主路处理成功: ${event.type} → ${result.dispatched_actions} dispatches`
        : `L3主路处理失败: ${event.type} → ${result.error}`,
      what: `L3 Gateway processed ${event.type}`,
      why: `stages: ${result.stages.map(s => `${s.name}:${s.status}`).join(' → ')}`,
      confidence: result.success ? 1.0 : 0.0,
      input_summary: JSON.stringify(result).slice(0, 800),
    });
  } catch (_) {}

  return result;
}

// ═══════════════════════════════════════════════════════════
// 旧路径模拟（用于 Shadow 模式对比）
// ═══════════════════════════════════════════════════════════

/**
 * 模拟旧路径处理：直接通过 Dispatcher 路由（不经过 IntentScanner/RuleMatcher）
 */
async function processEventLegacy(event) {
  const startTime = Date.now();
  try {
    const dispatcher = getDispatcher();
    const rule = { action: event.type };
    const dispResult = await dispatcher.dispatch(rule, event);
    return {
      path: 'legacy',
      success: dispResult.success,
      handler: dispResult.handler,
      duration_ms: Date.now() - startTime,
      result: dispResult.result,
    };
  } catch (err) {
    return {
      path: 'legacy',
      success: false,
      handler: 'error',
      duration_ms: Date.now() - startTime,
      error: err.message,
    };
  }
}

// ═══════════════════════════════════════════════════════════
// Shadow 模式对比
// ═══════════════════════════════════════════════════════════

async function runShadowComparison(event, l3Result) {
  try {
    const legacyResult = await processEventLegacy(event);

    const comparison = {
      event_type: event.type,
      event_id: event.id || 'unknown',
      l3: {
        success: l3Result.success,
        dispatched: l3Result.dispatched_actions,
        handler: l3Result.stages.find(s => s.name === 'Dispatcher')
          ?.results?.map(r => r.handler).join(',') || 'none',
        duration_ms: l3Result.duration_ms,
      },
      legacy: {
        success: legacyResult.success,
        handler: legacyResult.handler,
        duration_ms: legacyResult.duration_ms,
      },
      match: l3Result.success === legacyResult.success,
      delta_ms: l3Result.duration_ms - legacyResult.duration_ms,
    };

    comparisonLog(comparison);

    gatewayLog({
      stage: 'shadow-comparison',
      event_type: event.type,
      l3_success: l3Result.success,
      legacy_success: legacyResult.success,
      match: comparison.match,
      delta_ms: comparison.delta_ms,
    });

    return comparison;
  } catch (err) {
    gatewayLog({
      stage: 'shadow-comparison-error',
      event_type: event.type,
      error: err.message,
    });
    return null;
  }
}

// ═══════════════════════════════════════════════════════════
// 辅助函数
// ═══════════════════════════════════════════════════════════

function eventToConversationSlice(event) {
  const payload = event.payload || {};
  if (Array.isArray(payload.messages)) return payload.messages;
  if (Array.isArray(payload.conversation)) return payload.conversation;
  const content = payload.text || payload.content || payload.message || '';
  if (content) {
    return [{
      role: payload.role || 'user',
      content: String(content),
      timestamp: event.timestamp ? new Date(event.timestamp).toISOString() : new Date().toISOString(),
    }];
  }
  return [];
}

// ═══════════════════════════════════════════════════════════
// Gateway 拦截器
// ═══════════════════════════════════════════════════════════

let _installed = false;
let _originalEmit = null;
let _gatewayStats = {
  intercepted: 0,
  l3_processed: 0,
  l3_success: 0,
  l3_fallback: 0,
  legacy_passthrough: 0,
  shadow_comparisons: 0,
};

/**
 * 安装 L3 Gateway — 拦截 bus-adapter.emit()
 *
 * 拦截逻辑：
 *   1. 事件先正常写入 EventBus（保证不丢）
 *   2. 如果事件匹配 L3 FeatureFlag：
 *      a. 同步执行 L3 全流程
 *      b. 成功 → ack 事件（旧 dispatcher 不再消费）
 *      c. 失败 → 不 ack（旧 dispatcher 作为 fallback 消费）
 *   3. Shadow 模式额外跑旧路径做对比
 *
 * @returns {{ uninstall: Function, stats: Function }}
 */
function install() {
  if (_installed) {
    return { uninstall, stats: () => ({ ..._gatewayStats }) };
  }

  const busAdapter = getBusAdapter();
  _originalEmit = busAdapter.emit;

  busAdapter.emit = function gatewayEmit(type, payload, source, metadata) {
    // Step 1: 正常写入 EventBus（保证事件持久化）
    const emitResult = _originalEmit.call(busAdapter, type, payload, source, metadata);

    // 如果被风暴抑制，直接返回
    if (emitResult && emitResult.suppressed) {
      return emitResult;
    }

    // Step 2: 检查 FeatureFlag
    const flags = getGatewayFlags();
    if (!flags.enabled || !isL3Event(type, flags.events)) {
      _gatewayStats.legacy_passthrough++;
      return emitResult;
    }

    _gatewayStats.intercepted++;

    // Step 3: 构造标准化事件对象
    const event = {
      id: emitResult ? emitResult.id : `gw_${Date.now()}`,
      type,
      source: source || 'unknown',
      payload: payload || {},
      metadata: metadata || {},
      timestamp: Date.now(),
    };

    // Step 4: 异步执行 L3 处理（不阻塞 emit 返回）
    // Shadow 模式下先做一次轻量快速对比，避免主链超时导致测试窗口内看不到对比日志
    if (flags.shadowMode) {
      setImmediate(async () => {
        try {
          const legacyResult = await processEventLegacy(event);
          comparisonLog({
            event_type: event.type,
            event_id: event.id || 'unknown',
            l3: { pending: true },
            legacy: {
              success: legacyResult.success,
              handler: legacyResult.handler,
              duration_ms: legacyResult.duration_ms,
            },
            match: false,
            delta_ms: null,
            provisional: true,
          });
        } catch (_) {}
      });
    }

    // 使用 setImmediate 确保 emit 先返回
    setImmediate(async () => {
      try {
        _gatewayStats.l3_processed++;
        const l3Result = await processEventL3(event);

        if (l3Result.success) {
          _gatewayStats.l3_success++;

          // L3 成功 → ack 事件，旧路径不再消费
          try {
            const legacyBus = getLegacyBus();
            if (emitResult && emitResult.id) {
              legacyBus.ack(CONSUMER_ID, emitResult.id);
              // 也替 legacy dispatcher consumer ack，防止重复处理
              legacyBus.ack('dispatcher', emitResult.id);
            }
          } catch (_) { /* ack 失败不影响 */ }

          gatewayLog({
            stage: 'l3-complete',
            event_type: type,
            event_id: event.id,
            success: true,
            dispatched: l3Result.dispatched_actions,
            duration_ms: l3Result.duration_ms,
            stages: l3Result.stages.map(s => `${s.name}:${s.status}`).join(' → '),
          });
        } else {
          // L3 失败 → 不 ack → 旧路径自动 fallback
          _gatewayStats.l3_fallback++;

          gatewayLog({
            stage: 'l3-fallback',
            event_type: type,
            event_id: event.id,
            error: l3Result.error,
            duration_ms: l3Result.duration_ms,
            reason: 'L3 failed, event left for legacy dispatcher',
          });
        }

        // Shadow 模式：双路径对比
        if (flags.shadowMode) {
          const comparison = await runShadowComparison(event, l3Result);
          if (comparison) _gatewayStats.shadow_comparisons++;
        }
      } catch (err) {
        _gatewayStats.l3_fallback++;

        gatewayLog({
          stage: 'l3-crash',
          event_type: type,
          event_id: event.id,
          error: err.message,
          reason: 'L3 Gateway crashed, event left for legacy dispatcher',
        });
      }
    });

    return emitResult;
  };

  _installed = true;

  gatewayLog({
    stage: 'installed',
    flags: getGatewayFlags(),
    message: 'L3 Gateway installed — events matching FeatureFlag will go through L3 main path',
  });

  return { uninstall, stats: () => ({ ..._gatewayStats }) };
}

/**
 * 卸载 L3 Gateway，恢复原始 emit
 */
function uninstall() {
  if (!_installed || !_originalEmit) return;
  const busAdapter = getBusAdapter();
  busAdapter.emit = _originalEmit;
  _installed = false;
  _originalEmit = null;

  gatewayLog({
    stage: 'uninstalled',
    stats: { ..._gatewayStats },
  });
}

/**
 * 获取 Gateway 统计
 */
function stats() {
  return {
    installed: _installed,
    flags: getGatewayFlags(),
    ..._gatewayStats,
  };
}

/**
 * 重置统计计数器（测试用）
 */
function resetStats() {
  _gatewayStats = {
    intercepted: 0,
    l3_processed: 0,
    l3_success: 0,
    l3_fallback: 0,
    legacy_passthrough: 0,
    shadow_comparisons: 0,
  };
}

// ═══════════════════════════════════════════════════════════
// 导出
// ═══════════════════════════════════════════════════════════

module.exports = {
  // 核心 API
  install,
  uninstall,
  stats,
  resetStats,

  // 单事件处理（可独立调用）
  processEventL3,
  processEventLegacy,
  runShadowComparison,

  // FeatureFlag
  getGatewayFlags,
  isL3Event,

  // 内部（测试用）
  _internals: {
    GATEWAY_LOG_FILE,
    COMPARISON_LOG_FILE,
    CONSUMER_ID,
    eventToConversationSlice,
    isConversationEvent,
    gatewayLog,
    comparisonLog,
  },
};
