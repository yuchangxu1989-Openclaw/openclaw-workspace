#!/usr/bin/env node
'use strict';

/**
 * L3 闭环端到端集成测试
 * 
 * 验证 EventBus → RuleMatcher → Dispatcher → DecisionLog 全链路
 * 以及 IntentScanner 的LLM/正则/降级/断路器/Feature Flag各路径
 * 
 * 用法:
 *   node l3-e2e-test.js              运行所有测试
 *   node l3-e2e-test.js --test=1     只运行场景1
 *   node l3-e2e-test.js --test=2,3   运行场景2和3
 * 
 * @module infrastructure/tests/l3-e2e-test
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

// ─── 模块导入 ─────────────────────────────────────────────────────────
const EventBus = require('../event-bus/event-bus.js');
const { ISCRuleMatcher } = require('../rule-engine/isc-rule-matcher.js');
const dispatcher = require('../dispatcher/dispatcher.js');
const decisionLogger = require('../decision-log/decision-logger.js');
const { IntentScanner } = require('../intent-engine/intent-scanner.js');

// ─── 测试基础设施 ─────────────────────────────────────────────────────

let _passed = 0;
let _failed = 0;
let _skipped = 0;
const _results = [];

/**
 * 单个断言包装，输出 PASS/FAIL
 */
function check(label, fn) {
  try {
    fn();
    _passed++;
    _results.push({ label, status: 'PASS' });
    console.log(`    ✅ PASS: ${label}`);
  } catch (e) {
    _failed++;
    _results.push({ label, status: 'FAIL', error: e.message });
    console.log(`    ❌ FAIL: ${label}`);
    console.log(`           ${e.message}`);
  }
}

/**
 * 备份和恢复EventBus events文件，避免污染生产数据
 */
function backupEventsFile() {
  const eventsFile = EventBus.EVENTS_FILE;
  let backup = null;
  try {
    backup = fs.readFileSync(eventsFile, 'utf8');
  } catch (_) { /* no file */ }
  return {
    restore() {
      if (backup !== null) {
        fs.mkdirSync(path.dirname(eventsFile), { recursive: true });
        fs.writeFileSync(eventsFile, backup);
      } else {
        try { fs.unlinkSync(eventsFile); } catch (_) {}
      }
    },
    clear() {
      fs.mkdirSync(path.dirname(eventsFile), { recursive: true });
      fs.writeFileSync(eventsFile, '');
    }
  };
}

/**
 * 备份和恢复DecisionLog文件
 */
function backupDecisionLog() {
  const logFile = decisionLogger.LOG_FILE;
  let backup = null;
  try {
    backup = fs.readFileSync(logFile, 'utf8');
  } catch (_) {}
  return {
    restore() {
      if (backup !== null) {
        fs.writeFileSync(logFile, backup);
      } else {
        try { fs.unlinkSync(logFile); } catch (_) {}
      }
    },
    clear() {
      try { fs.writeFileSync(logFile, ''); } catch (_) {}
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════
// 场景 1: Happy Path - L1事件 → 规则匹配 → 执行
// ═══════════════════════════════════════════════════════════════════════

async function test1_happyPath_eventToExecution() {
  console.log('\n🧪 场景1: Happy Path - L1事件→规则匹配→执行\n');

  const evBak = backupEventsFile();
  const dlBak = backupDecisionLog();
  evBak.clear();
  dlBak.clear();
  EventBus._clearDedupeCache();

  try {
    // ── Step 1: emit isc.rule.created 事件 ──
    const emitResult = EventBus.emit('isc.rule.created', {
      rule_id: 'TEST-001',
      rule_name: 'test-rule',
      description: 'E2E test rule creation'
    }, 'l3-e2e-test', { trace_id: 'e2e-trace-001' });

    check('1.1 EventBus.emit 返回有效事件ID', () => {
      assert.ok(emitResult, 'emit should return result');
      assert.ok(emitResult.id, 'result should have id');
      assert.strictEqual(emitResult.suppressed, false, 'should not be suppressed');
    });

    // ── Step 2: consume验证事件已写入 ──
    const consumed = EventBus.consume({ type_filter: 'isc.rule.created' });

    check('1.2 EventBus.consume 能读到事件', () => {
      assert.ok(consumed.length >= 1, `expected >= 1 event, got ${consumed.length}`);
      const evt = consumed[consumed.length - 1];
      assert.strictEqual(evt.type, 'isc.rule.created');
      assert.strictEqual(evt.payload.rule_id, 'TEST-001');
      assert.strictEqual(evt.source, 'l3-e2e-test');
    });

    // ── Step 3: RuleMatcher 匹配规则 ──
    const matcher = new ISCRuleMatcher({ hotReload: false });
    matcher.loadRules();

    const event = consumed[consumed.length - 1];
    const matches = matcher.match(event);

    check('1.3 RuleMatcher.match 返回匹配规则', () => {
      assert.ok(matches.length >= 1, `expected >= 1 match, got ${matches.length}. ` +
        `Event type: isc.rule.created. Indexed patterns: ` +
        `exact=${matcher.exactIndex.size}, prefix=${matcher.prefixPatterns.length}`);
    });

    check('1.4 匹配规则含有效的rule对象', () => {
      const m = matches[0];
      assert.ok(m.rule, 'match should have rule object');
      assert.ok(m.rule.id || m.rule.name, 'rule should have id or name');
      assert.ok(m.priority !== undefined, 'match should have priority');
      assert.ok(m.match_type, 'match should have match_type');
    });

    // ── Step 4: Dispatcher 找到handler或记录到manual-queue ──
    const rule = matches[0].rule;
    // Dispatcher期望action为字符串（事件类型），ISC rule的action字段是对象
    const actionStr = event.type;
    const dispatchResult = await dispatcher.dispatch(
      { action: actionStr, handler: rule.handler || null, ...rule, action: actionStr },
      event,
      { timeoutMs: 5000 }
    );

    check('1.5 Dispatcher.dispatch 返回结果（success或file_dispatched或manual-queue）', () => {
      assert.ok(dispatchResult, 'dispatch should return result');
      assert.ok(typeof dispatchResult.handler === 'string', 'should have handler field');
      assert.ok(typeof dispatchResult.duration === 'number', 'should have duration');
      // handler可能是dto-sync（routes.json中isc.rule.*的handler）
      // 如果handler没有实际代码文件，会file_dispatch或enqueue manual
    });

    check('1.6 Dispatcher处理链完整（handler已识别或已入队）', () => {
      // 不管成功还是失败，都应该有明确的处理路径
      const validResults = ['success', 'file_dispatched', 'skipped (dispatcher disabled)'];
      if (dispatchResult.success) {
        assert.ok(true, `dispatch succeeded: ${dispatchResult.result}`);
      } else {
        // 失败意味着写入了manual-queue，也是合法路径
        assert.ok(dispatchResult.error, 'failed dispatch should have error');
        // 验证manual-queue有记录
        if (fs.existsSync(dispatcher.MANUAL_QUEUE_FILE)) {
          const queueContent = fs.readFileSync(dispatcher.MANUAL_QUEUE_FILE, 'utf8');
          assert.ok(queueContent.length > 0, 'manual queue should have entries');
        }
      }
    });

    // ── Step 5: DecisionLog 有记录 ──
    decisionLogger.log({
      phase: 'execution',
      component: 'l3-e2e-test',
      what: `dispatched isc.rule.created to ${dispatchResult.handler}`,
      why: `rule ${rule.id || rule.name} matched via ${matches[0].match_type}`,
      confidence: 1.0,
      decision_method: 'rule_match',
      input_summary: `event: isc.rule.created, rule_id: TEST-001`,
      output_summary: `dispatch result: ${dispatchResult.success ? 'success' : 'queued'}`
    });

    const logs = decisionLogger.query({ component: 'l3-e2e-test', limit: 5 });

    check('1.7 DecisionLog 有记录', () => {
      assert.ok(logs.length >= 1, `expected >= 1 log entry, got ${logs.length}`);
      const log = logs[0];
      assert.strictEqual(log.component, 'l3-e2e-test');
      assert.strictEqual(log.phase, 'execution');
      assert.ok(log.what.includes('isc.rule.created'), 'log.what should reference event type');
    });

    // ── Step 6: RuleMatcher内部decision log也有记录 ──
    const matcherDecisions = matcher.getDecisionLog(10);

    check('1.8 RuleMatcher内部决策日志有记录', () => {
      assert.ok(matcherDecisions.length >= 1, 'matcher should have decision log entries');
      const lastDecision = matcherDecisions[matcherDecisions.length - 1];
      assert.ok(lastDecision.event_type === 'isc.rule.created' || lastDecision.type === 'evaluation',
        'decision should reference our event');
    });

    matcher.destroy();

  } finally {
    evBak.restore();
    dlBak.restore();
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 场景 2: Happy Path - 意图识别 → 事件emit
// ═══════════════════════════════════════════════════════════════════════

async function test2_happyPath_intentToEvent() {
  console.log('\n🧪 场景2: Happy Path - 意图识别→事件emit\n');

  // 模拟对话：含情绪（IC1）+ 规则触发关键词（IC2）
  const conversationSlice = [
    { role: 'user', content: '这个规则太烦了，每次发布都要检查合规，能不能修改规则让流程简单点？', timestamp: '2026-03-05T00:00:00Z' },
    { role: 'assistant', content: '我理解你的挫败感。当前ISC规则要求发布前合规检查是为了保证质量。', timestamp: '2026-03-05T00:00:05Z' },
    { role: 'user', content: '我知道，但现在的标准太严了，建议新增一个简化规则适用于小改动', timestamp: '2026-03-05T00:00:10Z' },
  ];

  // 使用正则路径（确定性测试，不依赖外部LLM API）
  const scanner = new IntentScanner({
    zhipuKey: 'invalid_key_for_regex_fallback_test',
    zhipuUrl: 'https://localhost:1/nonexistent',
    timeout: 2000,
  });

  // 收集emit的事件
  const emittedIntents = [];
  scanner.on('intent.detected', (data) => {
    emittedIntents.push(data);
  });

  const degradedEvents = [];
  scanner.on('system.capability.degraded', (data) => {
    degradedEvents.push(data);
  });

  const result = await scanner.scan(conversationSlice);

  check('2.1 IntentScanner.scan 返回结果', () => {
    assert.ok(result, 'scan should return result');
    assert.strictEqual(result.skipped, false, 'should not be skipped');
  });

  check('2.2 识别到IC1意图（情绪关键词：烦）', () => {
    const ic1 = result.intents.find(i => i.intent_id === 'IC1');
    assert.ok(ic1, `IC1 not found in intents: ${JSON.stringify(result.intents.map(i => i.intent_id))}`);
    assert.ok(ic1.confidence > 0, 'IC1 confidence should be > 0');
    assert.ok(ic1.evidence, 'IC1 should have evidence');
  });

  check('2.3 识别到IC2意图（规则关键词：规则、合规、修改规则）', () => {
    const ic2 = result.intents.find(i => i.intent_id === 'IC2');
    assert.ok(ic2, `IC2 not found in intents: ${JSON.stringify(result.intents.map(i => i.intent_id))}`);
    assert.ok(ic2.confidence > 0, 'IC2 confidence should be > 0');
    assert.ok(ic2.evidence, 'IC2 should have evidence');
  });

  check('2.4 decision_logs记录了识别过程', () => {
    assert.ok(result.decision_logs.length >= 1, 'should have decision logs');
    // 验证日志含有识别方法
    const hasMethod = result.decision_logs.some(l => l.method);
    assert.ok(hasMethod, 'decision logs should include method field');
  });

  check('2.5 intent.detected事件被emit到EventEmitter', () => {
    assert.ok(emittedIntents.length >= 1, `expected >= 1 emitted intent, got ${emittedIntents.length}`);
    const intentIds = emittedIntents.map(i => i.intent_id);
    assert.ok(intentIds.includes('IC1') || intentIds.includes('IC2'),
      `emitted intents should contain IC1 or IC2, got: ${intentIds}`);
  });

  // 由于使用了无效key，LLM会失败，所以这也验证了降级路径
  check('2.6 降级事件被触发（LLM不可用时）', () => {
    // 因为我们用了invalid key + localhost URL，LLM必定失败
    assert.ok(degradedEvents.length >= 1, `expected degraded event, got ${degradedEvents.length}`);
    assert.strictEqual(degradedEvents[0].component, 'IntentScanner');
    assert.strictEqual(degradedEvents[0].fallback, 'regex');
  });

  check('2.7 method标记为regex_fallback', () => {
    assert.strictEqual(result.method, 'regex_fallback', `expected regex_fallback, got ${result.method}`);
  });
}

// ═══════════════════════════════════════════════════════════════════════
// 场景 3: 降级测试 - LLM不可用
// ═══════════════════════════════════════════════════════════════════════

async function test3_degradation_llmUnavailable() {
  console.log('\n🧪 场景3: 降级测试 - LLM不可用\n');

  const originalKey = process.env.ZHIPU_API_KEY;

  try {
    // 设置错误的API Key
    process.env.ZHIPU_API_KEY = 'INVALID_KEY_FOR_DEGRADATION_TEST';

    const scanner = new IntentScanner({
      zhipuKey: 'INVALID_KEY_FOR_DEGRADATION_TEST',
      zhipuUrl: 'https://localhost:1/nonexistent',
      timeout: 3000,
    });

    const degradedEvents = [];
    scanner.on('system.capability.degraded', (data) => {
      degradedEvents.push(data);
    });

    const emittedIntents = [];
    scanner.on('intent.detected', (data) => {
      emittedIntents.push(data);
    });

    const conversation = [
      { role: 'user', content: '我崩溃了，这个系统规则又违规了，需要紧急修改', timestamp: '2026-03-05T00:10:00Z' },
    ];

    const result = await scanner.scan(conversation);

    check('3.1 LLM不可用时scan仍返回结果（不抛异常）', () => {
      assert.ok(result, 'scan should return result even when LLM fails');
      assert.strictEqual(result.skipped, false, 'should not be skipped');
    });

    check('3.2 降级到正则路径', () => {
      assert.strictEqual(result.method, 'regex_fallback',
        `expected regex_fallback, got ${result.method}`);
    });

    check('3.3 正则路径仍能识别到IC1（崩溃=情绪关键词）', () => {
      const ic1 = result.intents.find(i => i.intent_id === 'IC1');
      assert.ok(ic1, 'IC1 should be detected via regex for "崩溃"');
    });

    check('3.4 正则路径仍能识别到IC2（规则、违规=规则关键词）', () => {
      const ic2 = result.intents.find(i => i.intent_id === 'IC2');
      assert.ok(ic2, 'IC2 should be detected via regex for "规则" and "违规"');
    });

    check('3.5 system.capability.degraded 事件被emit', () => {
      assert.ok(degradedEvents.length >= 1, `expected >= 1 degraded event, got ${degradedEvents.length}`);
      const evt = degradedEvents[0];
      assert.strictEqual(evt.component, 'IntentScanner');
      assert.ok(evt.error, 'degraded event should contain error message');
      assert.strictEqual(evt.fallback, 'regex');
    });

    check('3.6 降级后intent.detected事件仍然emit', () => {
      assert.ok(emittedIntents.length >= 1, 'intents should still be emitted in fallback mode');
    });

    check('3.7 decision_logs标记为regex_fallback方法', () => {
      const regexLogs = result.decision_logs.filter(l => l.method === 'regex_fallback');
      assert.ok(regexLogs.length >= 1, 'should have regex_fallback decision logs');
    });

  } finally {
    // 恢复环境变量
    if (originalKey !== undefined) {
      process.env.ZHIPU_API_KEY = originalKey;
    } else {
      delete process.env.ZHIPU_API_KEY;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 场景 4: 断路器测试 - 事件链深度保护
// ═══════════════════════════════════════════════════════════════════════

async function test4_circuitBreaker() {
  console.log('\n🧪 场景4: 断路器测试 - 事件链深度保护\n');

  const evBak = backupEventsFile();
  evBak.clear();
  EventBus._clearDedupeCache();

  try {
    const MAX_CHAIN_DEPTH = 5;

    // ── 模拟递归事件链 ──
    // 构造 chain_depth = 5 的事件
    const deepEvent = {
      type: 'isc.rule.created',
      payload: { rule_id: 'CHAIN-TEST' },
      source: 'circuit-breaker-test',
      metadata: { chain_depth: MAX_CHAIN_DEPTH, trace_id: 'cb-trace-001' }
    };

    // 手动实现断路器逻辑验证
    // EventBus本身不内置断路器，我们验证调用方可以检查chain_depth
    const emitResult = EventBus.emit(
      deepEvent.type,
      deepEvent.payload,
      deepEvent.source,
      deepEvent.metadata
    );

    check('4.1 深层事件仍可emit（EventBus层不拦截）', () => {
      assert.ok(emitResult, 'emit should return result');
      assert.ok(emitResult.id, 'should have event id');
    });

    // ── 验证断路器应在消费端生效 ──
    const events = EventBus.consume({ type_filter: 'isc.rule.created' });
    const deepEvt = events.find(e => e.metadata && e.metadata.chain_depth === MAX_CHAIN_DEPTH);

    check('4.2 能consume到深层事件（含chain_depth元数据）', () => {
      assert.ok(deepEvt, 'should find event with chain_depth=5');
      assert.strictEqual(deepEvt.metadata.chain_depth, MAX_CHAIN_DEPTH);
    });

    // ── 断路器逻辑：消费端应拒绝chain_depth >= 阈值的事件 ──
    const CIRCUIT_BREAKER_THRESHOLD = 5;

    function shouldProcess(event) {
      const depth = (event.metadata && event.metadata.chain_depth) || 0;
      return depth < CIRCUIT_BREAKER_THRESHOLD;
    }

    check('4.3 断路器拒绝chain_depth=5的事件', () => {
      assert.strictEqual(shouldProcess(deepEvt), false,
        'circuit breaker should reject depth=5 event');
    });

    check('4.4 断路器允许chain_depth=0的正常事件', () => {
      const normalEvt = { type: 'test', payload: {}, metadata: { chain_depth: 0 } };
      assert.strictEqual(shouldProcess(normalEvt), true);
    });

    check('4.5 断路器允许chain_depth=4的事件', () => {
      const borderEvt = { type: 'test', payload: {}, metadata: { chain_depth: 4 } };
      assert.strictEqual(shouldProcess(borderEvt), true);
    });

    check('4.6 断路器允许无metadata的事件（默认depth=0）', () => {
      const noMetaEvt = { type: 'test', payload: {} };
      assert.strictEqual(shouldProcess(noMetaEvt), true);
    });

    // ── 验证不会无限循环 ──
    // 模拟一个递归emit链，用计数器保护
    let chainCount = 0;
    const MAX_ALLOWED_CHAIN = 10;

    function simulateChainedEmit(depth) {
      chainCount++;
      if (chainCount > MAX_ALLOWED_CHAIN) {
        return { stopped: true, reason: 'max_chain_exceeded' };
      }
      if (depth >= CIRCUIT_BREAKER_THRESHOLD) {
        return { stopped: true, reason: 'circuit_breaker', depth };
      }
      // 递归：处理事件后emit新事件
      return simulateChainedEmit(depth + 1);
    }

    const chainResult = simulateChainedEmit(0);

    check('4.7 模拟递归链在断路器阈值处停止', () => {
      assert.strictEqual(chainResult.stopped, true);
      assert.strictEqual(chainResult.reason, 'circuit_breaker');
      assert.strictEqual(chainResult.depth, CIRCUIT_BREAKER_THRESHOLD);
      assert.ok(chainCount <= CIRCUIT_BREAKER_THRESHOLD + 1,
        `chain should stop at depth ${CIRCUIT_BREAKER_THRESHOLD}, actual iterations: ${chainCount}`);
    });

    // ── EventBus风暴抑制也是一层保护 ──
    EventBus._clearDedupeCache();
    const r1 = EventBus.emit('test.circuit', { loop: true }, 'test');
    const r2 = EventBus.emit('test.circuit', { loop: true }, 'test');

    check('4.8 EventBus风暴抑制作为第二层保护', () => {
      assert.strictEqual(r1.suppressed, false, 'first emit should go through');
      assert.strictEqual(r2.suppressed, true, 'duplicate emit should be suppressed');
    });

  } finally {
    evBak.restore();
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 场景 5: Feature Flag 测试
// ═══════════════════════════════════════════════════════════════════════

async function test5_featureFlags() {
  console.log('\n🧪 场景5: Feature Flag测试\n');

  // ── 5A: IntentScanner Feature Flag ──
  // IntentScanner读取模块加载时的INTENT_SCANNER_ENABLED
  // 由于模块已加载，需要创建新实例并直接测试scanner的行为

  // 方法：用一个新进程测试feature flag，或mock scan逻辑
  // 这里我们直接测试scanner的skip逻辑

  check('5.1 IntentScanner.scan 在INTENT_SCANNER_ENABLED=false时skip', () => {
    // IntentScanner在模块顶层读取 FEATURE_FLAG
    // 由于已经加载，我们通过spawn子进程来测试
    // 但为了测试独立性，这里直接验证scan返回的skip行为
    // 通过创建一个模拟的scanner并检查其行为

    // 用子进程验证feature flag
    const { execSync } = require('child_process');
    const testScript = `
      process.env.INTENT_SCANNER_ENABLED = 'false';
      // 清除模块缓存以重新加载
      delete require.cache[require.resolve('../intent-engine/intent-scanner.js')];
      const { IntentScanner } = require('../intent-engine/intent-scanner.js');
      const scanner = new IntentScanner();
      scanner.scan([{role:'user',content:'测试'}]).then(r => {
        process.stdout.write(JSON.stringify(r));
      });
    `;
    const tmpScript = path.join(__dirname, '_tmp_ff_test.js');
    fs.writeFileSync(tmpScript, testScript);
    try {
      const output = execSync(`node ${tmpScript}`, {
        cwd: __dirname,
        timeout: 10000,
        env: { ...process.env, INTENT_SCANNER_ENABLED: 'false' }
      }).toString();
      const result = JSON.parse(output);
      assert.strictEqual(result.skipped, true, `expected skipped=true, got ${result.skipped}`);
      assert.ok(result.reason && result.reason.includes('false'),
        `reason should mention INTENT_SCANNER_ENABLED=false`);
    } finally {
      try { fs.unlinkSync(tmpScript); } catch (_) {}
    }
  });

  // ── 5B: Dispatcher Feature Flag ──
  const originalDispatcherFlag = process.env.DISPATCHER_ENABLED;

  try {
    process.env.DISPATCHER_ENABLED = 'false';

    // dispatcher.isEnabled() 每次实时读取环境变量
    check('5.2 Dispatcher.isEnabled 返回false', () => {
      assert.strictEqual(dispatcher.isEnabled(), false);
    });

    const dispResult = await dispatcher.dispatch(
      { action: 'isc.rule.created' },
      { type: 'isc.rule.created', id: 'ff-test-001', payload: {} },
      { timeoutMs: 5000 }
    );

    check('5.3 Dispatcher.dispatch 在disabled时返回skipped', () => {
      assert.ok(dispResult, 'should return result');
      assert.strictEqual(dispResult.skipped, true, 'should be skipped');
      assert.ok(dispResult.result && dispResult.result.includes('disabled'),
        'result should indicate disabled');
    });

  } finally {
    if (originalDispatcherFlag !== undefined) {
      process.env.DISPATCHER_ENABLED = originalDispatcherFlag;
    } else {
      delete process.env.DISPATCHER_ENABLED;
    }
  }

  // ── 5C: 其他模块正常 ──
  check('5.4 EventBus在scanner/dispatcher禁用时仍正常工作', () => {
    EventBus._clearDedupeCache();
    const r = EventBus.emit('test.featureflag.check', { test: true }, 'ff-test');
    assert.ok(r, 'EventBus.emit should work');
    assert.ok(r.id, 'should have event id');
    assert.strictEqual(r.suppressed, false);
  });

  check('5.5 RuleMatcher在scanner/dispatcher禁用时仍正常工作', () => {
    const matcher = new ISCRuleMatcher({ hotReload: false });
    const loadResult = matcher.loadRules();
    assert.ok(loadResult.total >= 0, 'should load rules without error');
    // 匹配仍然可用
    const matches = matcher.match({ type: 'isc.rule.created', payload: {} });
    // 不强制要求有匹配，只要不报错
    assert.ok(Array.isArray(matches), 'match should return array');
    matcher.destroy();
  });

  check('5.6 DecisionLogger在其他模块禁用时仍正常工作', () => {
    const record = decisionLogger.log({
      phase: 'execution',
      component: 'feature-flag-test',
      what: 'testing independence',
      why: 'verify modules are decoupled',
      confidence: 1.0,
      decision_method: 'manual'
    });
    assert.ok(record, 'log should return record');
    assert.ok(record.id, 'record should have id');
    assert.strictEqual(record.component, 'feature-flag-test');
  });
}

// ═══════════════════════════════════════════════════════════════════════
// 主入口
// ═══════════════════════════════════════════════════════════════════════

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║           L3 闭环端到端集成测试 (E2E Integration)           ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`时间: ${new Date().toISOString()}`);
  console.log(`Node: ${process.version}`);

  // 解析命令行参数
  const args = process.argv.slice(2);
  let selectedTests = null;
  for (const arg of args) {
    const m = arg.match(/^--test=(.+)$/);
    if (m) {
      selectedTests = new Set(m[1].split(',').map(Number));
    }
  }

  const tests = [
    { id: 1, name: 'Happy Path - L1事件→规则匹配→执行', fn: test1_happyPath_eventToExecution },
    { id: 2, name: 'Happy Path - 意图识别→事件emit', fn: test2_happyPath_intentToEvent },
    { id: 3, name: '降级测试 - LLM不可用', fn: test3_degradation_llmUnavailable },
    { id: 4, name: '断路器测试', fn: test4_circuitBreaker },
    { id: 5, name: 'Feature Flag测试', fn: test5_featureFlags },
  ];

  for (const t of tests) {
    if (selectedTests && !selectedTests.has(t.id)) {
      console.log(`\n⏭️  场景${t.id}: ${t.name} (跳过)`);
      _skipped++;
      continue;
    }
    try {
      await t.fn();
    } catch (e) {
      _failed++;
      _results.push({ label: `场景${t.id}顶层异常`, status: 'FAIL', error: e.message });
      console.log(`\n    💥 场景${t.id}顶层异常: ${e.message}`);
      console.log(`       ${e.stack}`);
    }
  }

  // ─── 汇总报告 ───
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('                        测试报告');
  console.log('══════════════════════════════════════════════════════════════');
  console.log(`  ✅ PASSED:  ${_passed}`);
  console.log(`  ❌ FAILED:  ${_failed}`);
  console.log(`  ⏭️  SKIPPED: ${_skipped} scenarios`);
  console.log(`  📊 TOTAL:   ${_passed + _failed} checks`);
  console.log('──────────────────────────────────────────────────────────────');

  if (_failed > 0) {
    console.log('\n失败详情:');
    for (const r of _results.filter(r => r.status === 'FAIL')) {
      console.log(`  ❌ ${r.label}`);
      console.log(`     ${r.error}`);
    }
  }

  console.log(`\n${_failed === 0 ? '🎉 ALL PASSED!' : '⚠️  SOME TESTS FAILED'}\n`);

  process.exit(_failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(`\n💥 测试框架异常: ${err.message}`);
  console.error(err.stack);
  process.exit(2);
});
