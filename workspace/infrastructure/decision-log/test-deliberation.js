'use strict';

/**
 * Day 2 Deliberation Tests
 * 
 * Validates that every L3 decision point records:
 * - decision: what was chosen
 * - why: reasoning
 * - alternatives_considered: what was rejected and why
 * - proper phase/component
 * 
 * Run: node test-deliberation.js
 */

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
const errors = [];

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log(`  ✅ ${msg}`);
  } else {
    failed++;
    console.error(`  ❌ ${msg}`);
    errors.push(msg);
  }
}

function cleanup() {
  const logFile = require('./decision-logger').LOG_FILE;
  const dir = path.dirname(logFile);
  try {
    for (const f of fs.readdirSync(dir)) {
      if (f.startsWith('decisions.') && f.endsWith('.jsonl')) {
        fs.unlinkSync(path.join(dir, f));
      }
    }
  } catch (_) {}
}

// ═══════════════════════════════════════════════════════════
// Test 1: DecisionLogger core — new fields
// ═══════════════════════════════════════════════════════════
console.log('\n═══ Test 1: DecisionLogger core — new fields ═══');
{
  cleanup();
  const { log, query, queryChain, LOG_FILE } = require('./decision-logger');

  // 1.1: event_id field
  const r1 = log({
    phase: 'sensing',
    component: 'TestModule',
    event_id: 'evt_001',
    decision: '选择IC3意图',
    what: 'IC3',
    why: 'confidence 0.87 > threshold 0.6',
    confidence: 0.87,
    alternatives_considered: [
      { id: 'IC1', score: 0.12, reason: 'confidence太低' },
      { id: 'IC2', score: 0.05, reason: 'confidence太低' },
    ],
    decision_method: 'llm',
  });
  assert(r1.event_id === 'evt_001', '1.1: event_id field preserved');
  assert(r1.decision === '选择IC3意图', '1.2: decision field preserved');
  assert(Array.isArray(r1.alternatives_considered) && r1.alternatives_considered.length === 2,
    '1.3: alternatives_considered array preserved');

  // 1.4: query by event_id
  const r2 = log({
    phase: 'cognition',
    component: 'TestModule2',
    event_id: 'evt_001',
    decision: '匹配规则R005',
    what: 'R005',
    why: '精确匹配event_type',
  });
  const chain = query({ event_id: 'evt_001' });
  assert(chain.length === 2, '1.4: query by event_id returns 2 records');

  // 1.5: queryChain
  const chainResult = queryChain('evt_001');
  assert(chainResult.event_id === 'evt_001', '1.5a: queryChain returns correct event_id');
  assert(chainResult.chain.length === 2, '1.5b: queryChain returns 2 entries');
  assert(typeof chainResult.summary === 'string' && chainResult.summary.length > 0,
    '1.5c: queryChain summary is non-empty');
  assert(chainResult.summary.includes('sensing'), '1.5d: summary includes phase info');

  // 1.6: query by time range (until)
  const now = new Date().toISOString();
  log({
    phase: 'execution',
    component: 'FutureModule',
    event_id: 'evt_future',
    what: 'future',
    timestamp: new Date(Date.now() + 86400000).toISOString(), // tomorrow
  });
  const rangeResults = query({ until: now });
  const hasFuture = rangeResults.some(r => r.event_id === 'evt_future');
  assert(!hasFuture, '1.6: query with until excludes future entries');

  // 1.7: alternatives_considered validation
  let validationError = false;
  try {
    log({ phase: 'sensing', alternatives_considered: 'not-an-array' });
  } catch (e) {
    validationError = true;
  }
  assert(validationError, '1.7: alternatives_considered must be array');
}

// ═══════════════════════════════════════════════════════════
// Test 2: IntentScanner — decision log content
// ═══════════════════════════════════════════════════════════
console.log('\n═══ Test 2: IntentScanner — decision log enrichment ═══');
{
  cleanup();
  const { log: decisionLog, query } = require('./decision-logger');
  
  // Clear cache to reload module
  delete require.cache[require.resolve('../intent-engine/intent-scanner')];
  const { IntentScanner } = require('../intent-engine/intent-scanner');

  // Test regex fallback path (no API key)
  const scanner = new IntentScanner({ zhipuKey: null });
  
  // Scan with keywords that trigger IC1
  const result = scanner._scanWithRegex(
    [{ role: 'user', content: '太差了，重做吧' }],
    {
      categories: { IC1: { name: '情绪', description: '情绪表达' }, IC2: { name: '规则', description: '规则' } },
      intents: [],
    }
  );

  // Check decision_logs have the new fields
  assert(result.decision_logs.length > 0, '2.1: regex scan produces decision logs');
  
  const ic1Log = result.decision_logs.find(l => l.what === 'IC1');
  if (ic1Log) {
    assert(ic1Log.decision && ic1Log.decision.includes('IC1'), '2.2: decision field present with intent ID');
    assert(ic1Log.why && ic1Log.why.includes('regex'), '2.3: why explains regex fallback');
    assert(ic1Log.why && ic1Log.why.includes('关键词'), '2.4: why mentions matched keywords');
    assert(Array.isArray(ic1Log.alternatives_considered), '2.5: alternatives_considered is array');
  } else {
    assert(false, '2.2-2.5: IC1 log not found (regex should match "太差了,重做")');
  }
  
  // Check unresolved categories have proper why
  const unresolvedLogs = result.decision_logs.filter(l => l.status === 'unresolved');
  if (unresolvedLogs.length > 0) {
    const ul = unresolvedLogs[0];
    assert(ul.decision && ul.decision.includes('跳过'), '2.6: unresolved has decision=跳过');
    assert(ul.why && ul.why.includes('LLM不可用'), '2.7: unresolved explains LLM unavailability');
  }
}

// ═══════════════════════════════════════════════════════════
// Test 3: IntentScanner — degradation decision log
// ═══════════════════════════════════════════════════════════
console.log('\n═══ Test 3: IntentScanner — degradation logging ═══');
{
  cleanup();
  const { query } = require('./decision-logger');
  
  delete require.cache[require.resolve('../intent-engine/intent-scanner')];
  const { IntentScanner } = require('../intent-engine/intent-scanner');

  const scanner = new IntentScanner({ zhipuKey: null });
  
  // This should trigger degradation log
  scanner.scan([{ role: 'user', content: '测试' }]).then(() => {
    const degradLogs = query({ component: 'IntentScanner' });
    const degradation = degradLogs.find(l => l.what && l.what.includes('降级'));
    assert(degradation !== undefined, '3.1: degradation decision is logged');
    if (degradation) {
      assert(degradation.why && degradation.why.includes('ZHIPU_API_KEY'), '3.2: degradation why explains missing key');
      assert(Array.isArray(degradation.alternatives_considered), '3.3: degradation has alternatives');
    }
  }).catch(() => {
    // Expected in test env without API key
  });
}

// ═══════════════════════════════════════════════════════════
// Test 4: ISCRuleMatcher — decision log with alternatives
// ═══════════════════════════════════════════════════════════
console.log('\n═══ Test 4: ISCRuleMatcher — alternatives tracking ═══');
{
  cleanup();
  const { query } = require('./decision-logger');
  
  delete require.cache[require.resolve('../rule-engine/isc-rule-matcher')];
  const { ISCRuleMatcher } = require('../rule-engine/isc-rule-matcher');

  // Create matcher with test rules directory
  const testRulesDir = path.join(__dirname, '_test_rules_deliberation');
  fs.mkdirSync(testRulesDir, { recursive: true });

  // Write two rules that both match skill.* events
  fs.writeFileSync(path.join(testRulesDir, 'rule1.json'), JSON.stringify({
    id: 'R001-test',
    name: 'Rule Alpha',
    priority: 80,
    trigger: { events: ['skill.created'] },
  }));
  fs.writeFileSync(path.join(testRulesDir, 'rule2.json'), JSON.stringify({
    id: 'R002-test',
    name: 'Rule Beta',
    priority: 40,
    trigger: { events: ['skill.*'] },
  }));
  fs.writeFileSync(path.join(testRulesDir, 'rule3.json'), JSON.stringify({
    id: 'R003-test',
    name: 'Rule Gamma',
    priority: 20,
    trigger: { events: ['*'] },
  }));

  const matcher = new ISCRuleMatcher({ rulesDir: testRulesDir, hotReload: false });
  matcher.loadRules();

  const matches = matcher.match({ type: 'skill.created', payload: {} });
  assert(matches.length >= 2, '4.1: multiple rules match skill.created');

  // Check decision logs
  const matchLogs = query({ component: 'ISCRuleMatcher' });
  const matchLog = matchLogs.find(l => l.what && l.what.includes('Matched'));
  if (matchLog) {
    assert(matchLog.decision && matchLog.decision.length > 0, '4.2: match decision field present');
    assert(matchLog.why && (matchLog.why.includes('首选规则') || matchLog.why.includes('Event')),
      '4.3: match why explains top rule selection');
    assert(Array.isArray(matchLog.alternatives_considered), '4.4: alternatives_considered is array');
    // If we have 3 matches, the top rule has 2 alternatives
    if (matches.length === 3) {
      assert(matchLog.alternatives_considered.length === 2,
        '4.5: alternatives_considered has correct count (2 alternatives to top rule)');
    }
  } else {
    assert(false, '4.2-4.5: No match decision log found');
  }

  // Cleanup test rules
  try {
    fs.rmSync(testRulesDir, { recursive: true });
  } catch (_) {
    try { fs.rmdirSync(testRulesDir, { recursive: true }); } catch (_) {}
  }
  
  matcher.destroy();
}

// ═══════════════════════════════════════════════════════════
// Test 5: Dispatcher — routing reasoning
// ═══════════════════════════════════════════════════════════
console.log('\n═══ Test 5: Dispatcher — routing reasoning ═══');
{
  cleanup();
  const { query } = require('./decision-logger');
  
  delete require.cache[require.resolve('../dispatcher/dispatcher')];
  const Dispatcher = require('../dispatcher/dispatcher');

  // Dispatch with no routes → should log "no_route" with reasoning
  const rule = { action: 'test.nonexistent.event' };
  const event = { type: 'test.nonexistent.event', id: 'test_evt_001' };

  Dispatcher.dispatch(rule, event, { routes: {} }).then(result => {
    assert(result.success === false, '5.1: dispatch fails with no route');

    const dispatchLogs = query({ component: 'Dispatcher' });
    const noRouteLog = dispatchLogs.find(l => l.what && l.what.includes('no_route'));
    if (noRouteLog) {
      assert(noRouteLog.decision && noRouteLog.decision.includes('none'), '5.2: no_route decision present');
      assert(noRouteLog.why && noRouteLog.why.length > 10, '5.3: no_route why has substance');
    }
  });

  // Dispatch with multiple matching routes
  const routes = {
    'test.routed.event': { handler: 'echo' },
    'test.*': { handler: 'analysis-handler' },
    '*': { handler: 'echo' },
  };

  const rule2 = { action: 'test.routed.event' };
  const event2 = { type: 'test.routed.event', id: 'test_evt_002' };

  Dispatcher.dispatch(rule2, event2, { routes }).then(result => {
    const dispatchLogs = query({ component: 'Dispatcher' });
    const routedLog = dispatchLogs.find(l => 
      l.what && l.what.includes('test.routed.event') && !l.what.includes('no_route'));
    if (routedLog) {
      assert(routedLog.decision && routedLog.decision.includes('echo'),
        '5.4: routed decision mentions handler');
      assert(routedLog.why && routedLog.why.includes('路由模式'),
        '5.5: routed why mentions routing pattern');
    }
  });
}

// ═══════════════════════════════════════════════════════════
// Test 6: FeatureFlags — getWithSource decision logging
// ═══════════════════════════════════════════════════════════
console.log('\n═══ Test 6: FeatureFlags — source tracking ═══');
{
  cleanup();
  const { query } = require('./decision-logger');
  
  delete require.cache[require.resolve('../config/feature-flags')];
  const flags = require('../config/feature-flags');

  // 6.1: getWithSource for default value
  const result1 = flags.getWithSource('L3_EVENTBUS_ENABLED');
  assert(result1.source === 'env' || result1.source === 'file' || result1.source === 'default',
    '6.1: getWithSource returns valid source');
  assert(result1.value !== undefined, '6.2: getWithSource returns value');

  // 6.3: Check decision log was written
  const flagLogs = query({ component: 'FeatureFlags' });
  assert(flagLogs.length > 0, '6.3: FeatureFlags decision is logged');
  
  if (flagLogs.length > 0) {
    const fl = flagLogs[0];
    assert(fl.decision && fl.decision.includes('='), '6.4: flag decision shows key=value');
    assert(fl.why && fl.why.includes('来源'), '6.5: flag why shows source info');
    assert(fl.why && fl.why.includes('优先级链'), '6.6: flag why explains priority chain');
    assert(Array.isArray(fl.alternatives_considered), '6.7: flag has alternatives_considered');
  }

  // 6.8: getWithSource with env override
  const origVal = process.env.L3_EVENTBUS_ENABLED;
  process.env.L3_EVENTBUS_ENABLED = 'false';
  cleanup();
  
  const result2 = flags.getWithSource('L3_EVENTBUS_ENABLED');
  assert(result2.source === 'env', '6.8: env override detected as source=env');
  assert(result2.value === false, '6.9: env override value is false');

  const envLogs = query({ component: 'FeatureFlags' });
  if (envLogs.length > 0) {
    const hasFileAlt = envLogs[0].alternatives_considered.some(a => 
      a.id === 'default' && a.reason && a.reason.includes('覆盖'));
    assert(hasFileAlt, '6.10: alternatives show default was overridden by env');
  }

  // Restore
  if (origVal !== undefined) process.env.L3_EVENTBUS_ENABLED = origVal;
  else delete process.env.L3_EVENTBUS_ENABLED;
}

// ═══════════════════════════════════════════════════════════
// Test 7: L3Pipeline — circuit breaker decision
// ═══════════════════════════════════════════════════════════
console.log('\n═══ Test 7: L3Pipeline — circuit breaker reasoning ═══');
{
  cleanup();
  const { query } = require('./decision-logger');

  // Just verify the decision-logger entries from circuit breaker have the right shape
  // (Full pipeline test requires EventBus integration; we test the log format)
  const { log: decisionLog } = require('./decision-logger');
  
  // Simulate what the enhanced pipeline would log
  decisionLog({
    phase: 'execution',
    component: 'l3-pipeline.circuit-breaker',
    event_id: 'evt_deep_001',
    decision: '熔断: 事件 evt_deep_001 深度7超限',
    what: 'Circuit break: event evt_deep_001 depth=7 exceeds max=5',
    why: '防止无限循环(cras→isc→dto→cras): chain_depth=7 > max_allowed=5',
    confidence: 1.0,
    alternatives_considered: [{ id: '继续处理', reason: '深度7超过阈值5,有循环风险' }],
  });

  const breakerLogs = query({ component: 'l3-pipeline.circuit-breaker' });
  assert(breakerLogs.length > 0, '7.1: circuit breaker logs exist');
  if (breakerLogs.length > 0) {
    const bl = breakerLogs[0];
    assert(bl.event_id === 'evt_deep_001', '7.2: event_id linkage present');
    assert(bl.decision && bl.decision.includes('熔断'), '7.3: decision describes circuit break');
    assert(bl.why && bl.why.includes('chain_depth'), '7.4: why explains chain depth');
    assert(bl.alternatives_considered.length > 0, '7.5: alternatives show what was rejected');
  }
}

// ═══════════════════════════════════════════════════════════
// Test 8: Decision chain reconstruction
// ═══════════════════════════════════════════════════════════
console.log('\n═══ Test 8: Full decision chain reconstruction ═══');
{
  cleanup();
  const { log: decisionLog, queryChain } = require('./decision-logger');

  // Simulate a complete event processing chain
  const eventId = 'evt_full_chain_001';

  decisionLog({
    phase: 'sensing',
    component: 'IntentScanner',
    event_id: eventId,
    decision: '选择意图 IC3-知识分析',
    what: 'IC3',
    why: 'LLM confidence 0.87 > threshold 0.6, 排除IC1(score 0.12), IC2(score 0.05)',
    confidence: 0.87,
    alternatives_considered: [
      { id: 'IC1', score: 0.12, reason: 'confidence太低' },
      { id: 'IC2', score: 0.05, reason: 'confidence太低' },
    ],
    decision_method: 'llm',
  });

  decisionLog({
    phase: 'cognition',
    component: 'ISCRuleMatcher',
    event_id: eventId,
    decision: '匹配规则 N005-知识管理',
    what: 'N005',
    why: '精确匹配event_type=knowledge.analysis.requested, 优先级80',
    confidence: 1.0,
    alternatives_considered: [
      { id: 'N010-通用处理', priority: 20, reason: '通配规则优先级低于精确匹配' },
    ],
    decision_method: 'rule_match',
  });

  decisionLog({
    phase: 'execution',
    component: 'Dispatcher',
    event_id: eventId,
    decision: '路由到 cras-knowledge-handler',
    what: 'dispatch to cras-knowledge-handler',
    why: '路由模式: knowledge.analysis.*, handler: cras-knowledge-handler',
    confidence: 1.0,
    alternatives_considered: [
      { id: '*→echo', reason: '通配路由优先级低于前缀匹配' },
    ],
    decision_method: 'rule_match',
  });

  const chain = queryChain(eventId);
  assert(chain.chain.length === 3, '8.1: full chain has 3 entries');
  assert(chain.chain[0].phase === 'sensing', '8.2: chain starts with sensing');
  assert(chain.chain[1].phase === 'cognition', '8.3: chain continues to cognition');
  assert(chain.chain[2].phase === 'execution', '8.4: chain ends with execution');
  assert(chain.summary.includes('IntentScanner'), '8.5: summary mentions IntentScanner');
  assert(chain.summary.includes('ISCRuleMatcher'), '8.6: summary mentions ISCRuleMatcher');
  assert(chain.summary.includes('Dispatcher'), '8.7: summary mentions Dispatcher');
  assert(chain.summary.includes('排除'), '8.8: summary shows excluded alternatives');

  console.log('\n  📋 Decision chain summary:');
  chain.summary.split('\n').forEach(l => console.log(`    ${l}`));
}

// ═══════════════════════════════════════════════════════════
// Test 9: Format consistency
// ═══════════════════════════════════════════════════════════
console.log('\n═══ Test 9: Format consistency across modules ═══');
{
  cleanup();
  const { log: decisionLog, query } = require('./decision-logger');

  // Log entries from each module type
  const modules = [
    { phase: 'sensing', component: 'IntentScanner', decision: 'test', why: 'test', decision_method: 'llm' },
    { phase: 'cognition', component: 'ISCRuleMatcher', decision: 'test', why: 'test', decision_method: 'rule_match' },
    { phase: 'cognition', component: 'FeatureFlags', decision: 'test', why: 'test', decision_method: 'rule_match' },
    { phase: 'execution', component: 'Dispatcher', decision: 'test', why: 'test', decision_method: 'rule_match' },
    { phase: 'execution', component: 'l3-pipeline', decision: 'test', why: 'test', decision_method: 'manual' },
  ];

  for (const m of modules) {
    decisionLog(m);
  }

  const all = query({});
  assert(all.length === modules.length, '9.1: all module entries logged');

  for (const record of all) {
    // Every record must have these deliberation fields
    assert(typeof record.decision === 'string', `9.2: ${record.component} has decision field`);
    assert(typeof record.why === 'string', `9.3: ${record.component} has why field`);
    assert(Array.isArray(record.alternatives_considered), `9.4: ${record.component} has alternatives_considered array`);
    assert(['sensing', 'cognition', 'execution'].includes(record.phase),
      `9.5: ${record.component} has valid phase`);
  }
}

// ═══════════════════════════════════════════════════════════
// Results
// ═══════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(50)}`);
console.log(`  Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log(`\n  Failed tests:`);
  errors.forEach(e => console.log(`    ❌ ${e}`));
}
console.log(`${'═'.repeat(50)}\n`);

cleanup();
process.exit(failed > 0 ? 1 : 0);
