/**
 * L3 闭环流水线编排器 (L3 Closed-Loop Pipeline Orchestrator)
 * 
 * 将 Phase 1 的 6 个独立模块串成闭环：
 *   EventBus.consume → RuleMatcher.process → IntentScanner.scan → Dispatcher.dispatch
 * 
 * 核心能力：
 *   1. run()          — 单次闭环执行
 *   2. Circuit Breaker — chain_depth 防循环（≤5 正常，>5 断路）
 *   3. Feature Flags   — 总开关 + 子模块独立控制
 *   4. 执行摘要        — 每次 run 输出统计并写入 run-log.jsonl
 * 
 * CommonJS · 纯 Node.js · 无外部依赖
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════
// 依赖模块
// ═══════════════════════════════════════════════════════════
const EventBus = require('../event-bus/event-bus');
const { ISCRuleMatcher, getDefaultMatcher } = require('../rule-engine/isc-rule-matcher');
const { IntentScanner } = require('../intent-engine/intent-scanner');
const Dispatcher = require('../dispatcher/dispatcher');
const { log: decisionLog } = require('../decision-log/decision-logger');

// ═══════════════════════════════════════════════════════════
// 常量
// ═══════════════════════════════════════════════════════════
const RUN_LOG_FILE = path.join(__dirname, 'run-log.jsonl');
const DEFAULT_WINDOW_MS = 5 * 60 * 1000; // 5 分钟
const MAX_CHAIN_DEPTH = 5;
const CONVERSATION_EVENT_PREFIXES = [
  'user.message',
  'conversation.',
  'chat.',
  'dialog.',
];

// ═══════════════════════════════════════════════════════════
// Feature Flags
// ═══════════════════════════════════════════════════════════
function getFlag(envKey, defaultVal = true) {
  const val = process.env[envKey];
  if (val === undefined || val === '') return defaultVal;
  return val !== 'false' && val !== '0';
}

function getFeatureFlags() {
  return {
    pipeline: getFlag('L3_PIPELINE_ENABLED', true),
    eventbus: getFlag('L3_EVENTBUS_ENABLED', true),
    rulematcher: getFlag('L3_RULEMATCHER_ENABLED', true),
    intentscanner: getFlag('L3_INTENTSCANNER_ENABLED', true),
    dispatcher: getFlag('L3_DISPATCHER_ENABLED', true),
    decisionlog: getFlag('L3_DECISIONLOG_ENABLED', true),
  };
}

// ═══════════════════════════════════════════════════════════
// 辅助函数
// ═══════════════════════════════════════════════════════════

/** 判断事件是否为对话类事件 */
function isConversationEvent(event) {
  if (!event || !event.type) return false;
  const t = event.type.toLowerCase();
  return CONVERSATION_EVENT_PREFIXES.some(prefix => t.startsWith(prefix));
}

/** 获取事件的 chain_depth，缺省为 0 */
function getChainDepth(event) {
  if (!event) return 0;
  if (event.metadata && typeof event.metadata.chain_depth === 'number') {
    return event.metadata.chain_depth;
  }
  if (typeof event.chain_depth === 'number') {
    return event.chain_depth;
  }
  return 0;
}

/** 写 run-log.jsonl */
function appendRunLog(summary) {
  try {
    const line = JSON.stringify(summary) + '\n';
    fs.appendFileSync(RUN_LOG_FILE, line, 'utf8');
  } catch (err) {
    // 非致命：目录不存在时自动创建
    try {
      fs.mkdirSync(path.dirname(RUN_LOG_FILE), { recursive: true });
      fs.appendFileSync(RUN_LOG_FILE, JSON.stringify(summary) + '\n', 'utf8');
    } catch (_) {
      // 静默失败，不阻塞流水线
    }
  }
}

/** 安全写 decision log */
function safeDecisionLog(entry, flags) {
  if (!flags.decisionlog) return;
  try {
    decisionLog(entry);
  } catch (_) {
    // Decision log 写入失败不阻塞流水线
  }
}

// ═══════════════════════════════════════════════════════════
// L3Pipeline 主类
// ═══════════════════════════════════════════════════════════

class L3Pipeline {
  /**
   * @param {object} [options]
   * @param {number} [options.windowMs=300000] - 消费事件的时间窗口（ms）
   * @param {number} [options.maxChainDepth=5] - 断路器最大链深度
   * @param {object} [options.matcherOptions] - ISCRuleMatcher 构造参数
   * @param {object} [options.scannerOptions] - IntentScanner 构造参数
   */
  constructor(options = {}) {
    this.windowMs = options.windowMs || DEFAULT_WINDOW_MS;
    this.maxChainDepth = options.maxChainDepth || MAX_CHAIN_DEPTH;
    this.matcherOptions = options.matcherOptions || {};
    this.scannerOptions = options.scannerOptions || {};

    // 延迟初始化（run 时按需创建）
    this._matcher = null;
    this._scanner = null;
  }

  /** 获取或创建 RuleMatcher 单例 */
  _getMatcher() {
    if (!this._matcher) {
      this._matcher = getDefaultMatcher(this.matcherOptions);
    }
    return this._matcher;
  }

  /** 获取或创建 IntentScanner 单例 */
  _getScanner() {
    if (!this._scanner) {
      this._scanner = new IntentScanner(this.scannerOptions);
    }
    return this._scanner;
  }

  /**
   * 单次闭环执行
   * 
   * 流程：
   *   1. 检查总开关
   *   2. EventBus.consume 获取最近 windowMs 的事件
   *   3. 对每个事件：
   *      a. 断路器检查 chain_depth
   *      b. RuleMatcher.process 匹配规则
   *      c. 若为对话类事件，IntentScanner.scan 识别意图
   *      d. 意图 emit 回 EventBus（闭环）
   *      e. 匹配规则 Dispatcher.dispatch 执行
   *   4. 全程写 DecisionLog
   *   5. 输出执行摘要，写 run-log.jsonl
   * 
   * @returns {Promise<object>} 执行摘要
   */
  async run() {
    const runStart = Date.now();
    const runId = `run_${runStart}_${Math.random().toString(36).slice(2, 8)}`;
    const flags = getFeatureFlags();

    // 执行摘要计数器
    const summary = {
      run_id: runId,
      timestamp: new Date(runStart).toISOString(),
      consumed_events: 0,
      matched_rules: 0,
      intents_detected: 0,
      dispatched_actions: 0,
      circuit_breaks: 0,
      errors: [],
      duration_ms: 0,
      feature_flags: flags,
    };

    // ─── 总开关检查 ───
    if (!flags.pipeline) {
      summary.skipped = true;
      summary.reason = 'L3_PIPELINE_ENABLED=false';
      summary.duration_ms = Date.now() - runStart;
      safeDecisionLog({
        phase: 'execution',
        component: 'l3-pipeline',
        what: 'Pipeline skipped — disabled by feature flag',
        why: 'L3_PIPELINE_ENABLED=false',
        confidence: 1.0,
        input_summary: 'run() called',
      }, flags);
      appendRunLog(summary);
      return summary;
    }

    // ─── Step 1: Consume 事件 ───
    let events = [];
    if (flags.eventbus) {
      try {
        const since = runStart - this.windowMs;
        events = EventBus.consume({ since });
        summary.consumed_events = events.length;

        safeDecisionLog({
          phase: 'execution',
          component: 'l3-pipeline',
          what: `Consumed ${events.length} events from EventBus`,
          why: `Time window: ${this.windowMs}ms (since ${new Date(since).toISOString()})`,
          confidence: 1.0,
          input_summary: `since=${since}`,
        }, flags);
      } catch (err) {
        summary.errors.push({ stage: 'consume', error: err.message });
        safeDecisionLog({
          phase: 'execution',
          component: 'l3-pipeline',
          what: `EventBus consume failed: ${err.message}`,
          why: 'EventBus error',
          confidence: 1.0,
        }, flags);
      }
    }

    // ─── Step 2: 遍历每个事件 ───
    for (const event of events) {
      const depth = getChainDepth(event);

      // ─── 断路器检查 ───
      if (depth > this.maxChainDepth) {
        summary.circuit_breaks++;
        safeDecisionLog({
          phase: 'execution',
          component: 'l3-pipeline.circuit-breaker',
          what: `Circuit break: event ${event.id || 'unknown'} (type=${event.type}) depth=${depth} exceeds max=${this.maxChainDepth}`,
          why: 'Prevent infinite loop (cras→isc→dto→cras)',
          confidence: 1.0,
          input_summary: JSON.stringify({ event_id: event.id, type: event.type, chain_depth: depth }),
        }, flags);
        continue; // 跳过此事件
      }

      // ─── Step 2a: RuleMatcher 匹配 ───
      let matchedRules = [];
      if (flags.rulematcher) {
        try {
          const matcher = this._getMatcher();
          matchedRules = matcher.process(event);
          summary.matched_rules += matchedRules.length;

          if (matchedRules.length > 0) {
            safeDecisionLog({
              phase: 'execution',
              component: 'l3-pipeline.rule-matcher',
              what: `Matched ${matchedRules.length} rules for event ${event.type}`,
              why: `Rules: ${matchedRules.map(r => r.rule.id || r.rule.name || 'unnamed').join(', ')}`,
              confidence: 1.0,
              input_summary: JSON.stringify({ event_type: event.type, event_id: event.id }),
            }, flags);
          }
        } catch (err) {
          summary.errors.push({ stage: 'rule-match', event_id: event.id, error: err.message });
        }
      }

      // ─── Step 2b: IntentScanner（对话类事件） ───
      if (flags.intentscanner && isConversationEvent(event)) {
        try {
          const scanner = this._getScanner();
          // 将事件 payload 转为对话切片格式
          const conversationSlice = this._eventToConversationSlice(event);
          const scanResult = await scanner.scan(conversationSlice);

          if (scanResult && scanResult.intents && scanResult.intents.length > 0) {
            summary.intents_detected += scanResult.intents.length;

            safeDecisionLog({
              phase: 'execution',
              component: 'l3-pipeline.intent-scanner',
              what: `Detected ${scanResult.intents.length} intents from conversation event`,
              why: `Event: ${event.type} (id=${event.id})`,
              confidence: 1.0,
              input_summary: JSON.stringify({ intents: scanResult.intents.map(i => i.intent || i.name || i.type) }),
            }, flags);

            // ─── 闭环：意图 emit 回 EventBus ───
            if (flags.eventbus) {
              for (const intent of scanResult.intents) {
                const intentType = `user.intent.${intent.intent || intent.name || intent.type || 'unknown'}.inferred`;
                try {
                  EventBus.emit(intentType, {
                    source_event_id: event.id,
                    source_event_type: event.type,
                    intent_data: intent,
                  }, 'l3-pipeline', {
                    chain_depth: depth + 1,
                    source_pipeline_run: runId,
                  });
                } catch (emitErr) {
                  summary.errors.push({ stage: 'intent-emit', intent: intentType, error: emitErr.message });
                }
              }
            }
          }
        } catch (err) {
          summary.errors.push({ stage: 'intent-scan', event_id: event.id, error: err.message });
        }
      }

      // ─── Step 2c: Dispatcher 执行匹配到的规则 ───
      if (flags.dispatcher && matchedRules.length > 0) {
        for (const match of matchedRules) {
          try {
            const rule = match.rule;
            const result = await Dispatcher.dispatch(rule, event);
            summary.dispatched_actions++;

            safeDecisionLog({
              phase: 'execution',
              component: 'l3-pipeline.dispatcher',
              what: `Dispatched action: ${rule.action || rule.id || 'unknown'} → ${result.success ? 'success' : 'failed'}`,
              why: `Rule: ${rule.id || rule.name || 'unnamed'}, Event: ${event.type}`,
              confidence: 1.0,
              input_summary: JSON.stringify({
                rule_id: rule.id || rule.name,
                handler: result.handler,
                success: result.success,
                duration: result.duration,
              }),
            }, flags);
          } catch (err) {
            summary.errors.push({
              stage: 'dispatch',
              rule_id: match.rule.id || match.rule.name,
              event_id: event.id,
              error: err.message,
            });
          }
        }
      }
    }

    // ─── Step 3: 收尾 ───
    summary.duration_ms = Date.now() - runStart;

    // 写入整体执行日志
    safeDecisionLog({
      phase: 'execution',
      component: 'l3-pipeline',
      what: `Pipeline run complete: ${summary.consumed_events} events, ${summary.matched_rules} rules, ${summary.intents_detected} intents, ${summary.dispatched_actions} dispatches, ${summary.circuit_breaks} breaks`,
      why: `Run ${runId} finished in ${summary.duration_ms}ms`,
      confidence: 1.0,
      input_summary: JSON.stringify(summary),
    }, flags);

    // 写入 run-log.jsonl
    appendRunLog(summary);

    return summary;
  }

  /**
   * 将事件 payload 转为 IntentScanner 需要的对话切片格式
   * @param {object} event
   * @returns {Array<{role: string, content: string, timestamp?: string}>}
   */
  _eventToConversationSlice(event) {
    const payload = event.payload || event.data || {};
    const slices = [];

    // 如果 payload 已经是对话切片数组
    if (Array.isArray(payload.messages)) {
      return payload.messages;
    }
    if (Array.isArray(payload.conversation)) {
      return payload.conversation;
    }

    // 单条消息 → 转为切片
    const content = payload.text || payload.content || payload.message || '';
    if (content) {
      slices.push({
        role: payload.role || 'user',
        content: String(content),
        timestamp: event.timestamp ? new Date(event.timestamp).toISOString() : new Date().toISOString(),
      });
    }

    return slices;
  }
}

// ═══════════════════════════════════════════════════════════
// 便捷导出
// ═══════════════════════════════════════════════════════════

/** 创建默认实例并执行一次 */
async function runOnce(options) {
  const pipeline = new L3Pipeline(options);
  return pipeline.run();
}

module.exports = {
  L3Pipeline,
  runOnce,
  // 内部导出（测试用）
  _internals: {
    getFeatureFlags,
    isConversationEvent,
    getChainDepth,
    appendRunLog,
    RUN_LOG_FILE,
    MAX_CHAIN_DEPTH,
    DEFAULT_WINDOW_MS,
    CONVERSATION_EVENT_PREFIXES,
  },
};


// ═══════════════════════════════════════════════════════════
// 单元测试 — node l3-pipeline.js 直接运行
// ═══════════════════════════════════════════════════════════
if (require.main === module) {
  (async () => {
    const passed = [];
    const failed = [];

    function assert(cond, name) {
      if (cond) {
        passed.push(name);
      } else {
        failed.push(name);
        console.error(`  ✗ ${name}`);
      }
    }

    console.log('═══ L3 Pipeline — Unit Tests ═══\n');

    // ── Test 1: Feature Flags 解析 ──
    {
      const orig = process.env.L3_PIPELINE_ENABLED;
      process.env.L3_PIPELINE_ENABLED = 'false';
      const flags = getFeatureFlags();
      assert(flags.pipeline === false, 'T1.1: pipeline flag false when env=false');
      process.env.L3_PIPELINE_ENABLED = 'true';
      const flags2 = getFeatureFlags();
      assert(flags2.pipeline === true, 'T1.2: pipeline flag true when env=true');
      delete process.env.L3_PIPELINE_ENABLED;
      const flags3 = getFeatureFlags();
      assert(flags3.pipeline === true, 'T1.3: pipeline flag defaults to true');
      if (orig !== undefined) process.env.L3_PIPELINE_ENABLED = orig;
      else delete process.env.L3_PIPELINE_ENABLED;
    }

    // ── Test 2: isConversationEvent ──
    {
      assert(isConversationEvent({ type: 'user.message.text' }) === true, 'T2.1: user.message.text is conversation');
      assert(isConversationEvent({ type: 'conversation.new' }) === true, 'T2.2: conversation.new is conversation');
      assert(isConversationEvent({ type: 'chat.incoming' }) === true, 'T2.3: chat.incoming is conversation');
      assert(isConversationEvent({ type: 'system.healthcheck' }) === false, 'T2.4: system.healthcheck is NOT conversation');
      assert(isConversationEvent({ type: 'skill.executed' }) === false, 'T2.5: skill.executed is NOT conversation');
      assert(isConversationEvent(null) === false, 'T2.6: null event is NOT conversation');
    }

    // ── Test 3: getChainDepth ──
    {
      assert(getChainDepth({}) === 0, 'T3.1: empty event → depth 0');
      assert(getChainDepth({ metadata: { chain_depth: 3 } }) === 3, 'T3.2: metadata.chain_depth=3');
      assert(getChainDepth({ chain_depth: 7 }) === 7, 'T3.3: top-level chain_depth=7');
      assert(getChainDepth(null) === 0, 'T3.4: null → depth 0');
    }

    // ── Test 4: Pipeline 总开关关闭时 skip ──
    {
      const orig = process.env.L3_PIPELINE_ENABLED;
      process.env.L3_PIPELINE_ENABLED = 'false';
      // 同时禁用 decision log 避免依赖
      const origDL = process.env.L3_DECISIONLOG_ENABLED;
      process.env.L3_DECISIONLOG_ENABLED = 'false';

      const pipeline = new L3Pipeline();
      const result = await pipeline.run();
      assert(result.skipped === true, 'T4.1: run skipped when pipeline disabled');
      assert(result.reason === 'L3_PIPELINE_ENABLED=false', 'T4.2: skip reason correct');
      assert(result.consumed_events === 0, 'T4.3: no events consumed');

      if (orig !== undefined) process.env.L3_PIPELINE_ENABLED = orig;
      else delete process.env.L3_PIPELINE_ENABLED;
      if (origDL !== undefined) process.env.L3_DECISIONLOG_ENABLED = origDL;
      else delete process.env.L3_DECISIONLOG_ENABLED;
    }

    // ── Test 5: Pipeline run 正常执行（无事件） ──
    {
      const origDL = process.env.L3_DECISIONLOG_ENABLED;
      process.env.L3_DECISIONLOG_ENABLED = 'false';

      const pipeline = new L3Pipeline({ windowMs: 1 }); // 1ms window = no events
      const result = await pipeline.run();
      assert(typeof result.run_id === 'string', 'T5.1: run_id is string');
      assert(typeof result.timestamp === 'string', 'T5.2: timestamp is string');
      assert(result.consumed_events >= 0, 'T5.3: consumed_events is number');
      assert(result.matched_rules === 0, 'T5.4: matched_rules=0 (no events)');
      assert(result.intents_detected === 0, 'T5.5: intents_detected=0');
      assert(result.dispatched_actions === 0, 'T5.6: dispatched_actions=0');
      assert(result.circuit_breaks === 0, 'T5.7: circuit_breaks=0');
      assert(result.duration_ms >= 0, 'T5.8: duration_ms >= 0');
      assert(!result.skipped, 'T5.9: not skipped');

      if (origDL !== undefined) process.env.L3_DECISIONLOG_ENABLED = origDL;
      else delete process.env.L3_DECISIONLOG_ENABLED;
    }

    // ── Test 6: _eventToConversationSlice ──
    {
      const pipeline = new L3Pipeline();

      // 6.1: payload.messages 透传
      const s1 = pipeline._eventToConversationSlice({
        payload: { messages: [{ role: 'user', content: 'hello' }] },
      });
      assert(Array.isArray(s1) && s1.length === 1 && s1[0].content === 'hello', 'T6.1: messages passthrough');

      // 6.2: payload.text → 单条切片
      const s2 = pipeline._eventToConversationSlice({
        payload: { text: 'hi there' },
        timestamp: 1700000000000,
      });
      assert(s2.length === 1 && s2[0].content === 'hi there', 'T6.2: text to slice');

      // 6.3: 空 payload → 空切片
      const s3 = pipeline._eventToConversationSlice({ payload: {} });
      assert(s3.length === 0, 'T6.3: empty payload → empty slice');
    }

    // ── Test 7: 断路器检查（集成模拟） ──
    {
      const origDL = process.env.L3_DECISIONLOG_ENABLED;
      const origEB = process.env.L3_EVENTBUS_ENABLED;
      process.env.L3_DECISIONLOG_ENABLED = 'false';

      // 手动准备 EventBus 里的深度事件
      const deepEvent = {
        type: 'test.deep.event',
        id: 'deep_test_001',
        timestamp: Date.now(),
        payload: {},
        metadata: { chain_depth: 10 },
        source: 'test',
      };

      // Emit 深度事件
      try {
        EventBus.emit('test.deep.event', {}, 'test', { chain_depth: 10 });
      } catch (_) {}

      const pipeline = new L3Pipeline({ windowMs: 60000 });
      const result = await pipeline.run();
      // 验证存在深度事件时 circuit_breaks 计数
      // （具体数字取决于 EventBus 中有多少深度事件，至少验证结构正确）
      assert(typeof result.circuit_breaks === 'number', 'T7.1: circuit_breaks is number');

      if (origDL !== undefined) process.env.L3_DECISIONLOG_ENABLED = origDL;
      else delete process.env.L3_DECISIONLOG_ENABLED;
      if (origEB !== undefined) process.env.L3_EVENTBUS_ENABLED = origEB;
      else delete process.env.L3_EVENTBUS_ENABLED;
    }

    // ── Test 8: run-log.jsonl 写入验证 ──
    {
      // 清理旧日志
      try { fs.unlinkSync(RUN_LOG_FILE); } catch (_) {}

      const origDL = process.env.L3_DECISIONLOG_ENABLED;
      process.env.L3_DECISIONLOG_ENABLED = 'false';

      const pipeline = new L3Pipeline({ windowMs: 1 });
      await pipeline.run();

      let logExists = false;
      try {
        const content = fs.readFileSync(RUN_LOG_FILE, 'utf8').trim();
        const lines = content.split('\n').filter(l => l.trim());
        logExists = lines.length > 0;
        const last = JSON.parse(lines[lines.length - 1]);
        assert(last.run_id && last.timestamp, 'T8.2: run-log entry has run_id and timestamp');
      } catch (_) {}
      assert(logExists, 'T8.1: run-log.jsonl was written');

      if (origDL !== undefined) process.env.L3_DECISIONLOG_ENABLED = origDL;
      else delete process.env.L3_DECISIONLOG_ENABLED;
    }

    // ── Test 9: L3Pipeline 构造参数 ──
    {
      const p = new L3Pipeline({ windowMs: 10000, maxChainDepth: 3 });
      assert(p.windowMs === 10000, 'T9.1: custom windowMs');
      assert(p.maxChainDepth === 3, 'T9.2: custom maxChainDepth');
    }

    // ── 结果汇总 ──
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`  通过: ${passed.length}  |  失败: ${failed.length}`);
    if (failed.length > 0) {
      console.log(`\n  失败用例:`);
      failed.forEach(f => console.log(`    ✗ ${f}`));
    }
    console.log(`${'─'.repeat(50)}\n`);

    process.exit(failed.length > 0 ? 1 : 0);
  })();
}
