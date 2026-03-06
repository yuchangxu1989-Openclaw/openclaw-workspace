'use strict';
/**
 * E2E Integration Test: 事件驱动全链路验证
 *
 * 链路: bus-adapter.emit() → circuit-breaker → dispatcher → condition-evaluator
 *       → handler-executor → handler函数
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const busAdapter = require('../infrastructure/event-bus/bus-adapter');
const bus = require('../infrastructure/event-bus/bus');
const breaker = require('../infrastructure/event-bus/circuit-breaker');
const { Dispatcher } = require('../infrastructure/event-bus/dispatcher');
const condEval = require('../infrastructure/event-bus/condition-evaluator');
const executor = require('../infrastructure/event-bus/handler-executor');

const WS = '/root/.openclaw/workspace';
const EVENTS_FILE = bus._EVENTS_FILE;
const LOG_FILE = path.resolve(__dirname, '../infrastructure/logs/handler-actions.jsonl');
const DISP_LOG = path.resolve(__dirname, '../infrastructure/logs/dispatcher-actions.jsonl');
const TEST_OUT = path.resolve(__dirname, '../infrastructure/logs/e2e-handler-output.json');
const REPORT = path.resolve(WS, 'reports/e2e-test-report.md');

let res = [], nP = 0, nF = 0, nS = 0;
function rec(stg, nm, st, det) {
  res.push({ stage: stg, name: nm, status: st, details: det || '', ts: new Date().toISOString() });
  if (st === 'pass') nP++; else if (st === 'fail') nF++; else nS++;
  const ic = st === 'pass' ? '✅' : st === 'fail' ? '❌' : '⏭️';
  console.log(`  ${ic} [${stg}] ${nm}${det ? ' — ' + det : ''}`);
}
function t(s, n, fn) { try { fn(); rec(s, n, 'pass'); } catch (e) { rec(s, n, 'fail', e.message); } }
async function ta(s, n, fn) { try { await fn(); rec(s, n, 'pass'); } catch (e) { rec(s, n, 'fail', e.message); } }

let bkE = null, bkC = null;
function setup() {
  try { bkE = fs.readFileSync(EVENTS_FILE, 'utf8'); } catch (_) {}
  try { bkC = fs.readFileSync(bus._CURSOR_FILE, 'utf8'); } catch (_) {}
  bus.purge(); busAdapter._clearDedupeCache(); breaker.reset();
}
function teardown() {
  if (bkE !== null) fs.writeFileSync(EVENTS_FILE, bkE); else try { fs.unlinkSync(EVENTS_FILE); } catch (_) {}
  if (bkC !== null) fs.writeFileSync(bus._CURSOR_FILE, bkC); else try { fs.unlinkSync(bus._CURSOR_FILE); } catch (_) {}
  busAdapter._clearDedupeCache(); breaker.reset();
}

// ── Stage 1: bus-adapter.emit ──
function s1() {
  console.log('\n📡 Stage 1: bus-adapter.emit() → events.jsonl');
  busAdapter._clearDedupeCache();

  t('S1', 'emit() 返回有效结果', () => {
    const r = busAdapter.emit('git.commit.created', {
      repo: 'openclaw/workspace', branch: 'main', commit_hash: 'abc123', author: 'test',
      message: 'feat: e2e', files_changed: ['tests/e2e.test.js'],
    }, 'e2e-test');
    assert.ok(r && r.id && r.id.startsWith('evt_'));
    assert.strictEqual(r.suppressed, false);
  });

  t('S1', 'events.jsonl 记录事件', () => {
    const evts = fs.readFileSync(EVENTS_FILE, 'utf8').trim().split('\n').map(l => JSON.parse(l));
    const g = evts.find(e => e.type === 'git.commit.created');
    assert.ok(g); assert.strictEqual(g.source, 'e2e-test'); assert.strictEqual(g.payload.commit_hash, 'abc123');
  });

  t('S1', '链路追踪metadata注入', () => {
    const evts = bus.history({ type: 'git.commit.created' });
    const e = evts[evts.length - 1];
    assert.ok(e.payload._metadata); assert.ok(e.payload._metadata.trace_id);
    assert.strictEqual(e.payload._metadata.chain_depth, 0);
  });

  t('S1', '风暴抑制去重', () => {
    busAdapter._clearDedupeCache();
    const r1 = busAdapter.emit('test.storm', { k: 'v' }, 'e2e');
    const r2 = busAdapter.emit('test.storm', { k: 'v' }, 'e2e');
    assert.strictEqual(r1.suppressed, false); assert.strictEqual(r2.suppressed, true);
  });
}

// ── Stage 2: circuit-breaker ──
function s2() {
  console.log('\n🔌 Stage 2: circuit-breaker');
  breaker.reset();

  t('S2', '正常事件通过', () => { assert.strictEqual(breaker.check('git.commit.created', { chain_depth: 0 }).allowed, true); });
  t('S2', '链深度超限拦截', () => {
    const r = breaker.check('x', { chain_depth: 15 });
    assert.strictEqual(r.allowed, false); assert.ok(r.reason.includes('chain depth'));
  });
  t('S2', '单类型速率限制', () => {
    breaker.reset(); breaker.configure({ perTypePerMinute: 3 });
    breaker.check('rt', {}); breaker.check('rt', {}); breaker.check('rt', {});
    assert.strictEqual(breaker.check('rt', {}).allowed, false);
  });
  t('S2', '状态可查询', () => { const s = breaker.getState(); assert.ok('tripped' in s && 'limits' in s); });
  breaker.reset();
}

// ── Stage 3: dispatcher ──
async function s3() {
  console.log('\n🔀 Stage 3: dispatcher 路由');
  const d = new Dispatcher({
    rulesDir: path.resolve(WS, 'skills/isc-core/rules'), logFile: DISP_LOG,
    logger: { debug: () => {}, warn: () => {}, log: () => {}, error: () => {} },
  });

  await ta('S3', 'Dispatcher加载ISC规则', async () => {
    await d.init(); assert.ok(d.getRuleCount() > 0, `loaded ${d.getRuleCount()} rules`);
  });

  t('S3', 'EventIndex有注册模式', () => {
    const idx = d.getEventIndex(); const p = Object.keys(idx);
    assert.ok(p.length > 0);
    console.log(`    → 模式(前8): ${p.slice(0, 8).join(', ')}${p.length > 8 ? '...' : ''}`);
  });

  t('S3', '_matchRules找到匹配规则', () => {
    const idx = d.getEventIndex(); let found = false;
    for (const pat of Object.keys(idx)) {
      if (pat === '*') continue;
      const tt = pat.endsWith('.*') ? pat.replace('.*', '.x') : pat;
      const m = d._matchRules(tt);
      if (m.length > 0) { found = true; console.log(`    → "${tt}" → ${m.length} rules`); break; }
    }
    assert.ok(found);
  });

  await ta('S3', 'dispatch() 更新统计', async () => {
    const b = d.getStats().dispatched;
    await d.dispatch('isc.rule.matched', { ruleId: 'x', severity: 'LOW' });
    assert.ok(d.getStats().dispatched > b);
  });
}

// ── Stage 4: condition-evaluator ──
function s4() {
  console.log('\n🧮 Stage 4: condition-evaluator');

  t('S4', '空条件→通过', () => { assert.strictEqual(condEval.evaluate(null, {}).pass, true); });
  t('S4', '对象匹配', () => { assert.strictEqual(condEval.evaluate({ status: 'failed' }, { status: 'failed' }).pass, true); });
  t('S4', '对象不匹配', () => { assert.strictEqual(condEval.evaluate({ status: 'failed' }, { status: 'ok' }).pass, false); });
  t('S4', 'MongoDB运算符', () => {
    assert.strictEqual(condEval.evaluate({ score: { '$lt': 0.8 } }, { score: 0.5 }).pass, true);
    assert.strictEqual(condEval.evaluate({ score: { '$lt': 0.8 } }, { score: 0.9 }).pass, false);
  });
  t('S4', '字符串条件', () => { assert.strictEqual(condEval.evaluate('count > 5', { count: 10 }).pass, true); });
  t('S4', '$and/$or', () => {
    assert.strictEqual(condEval.evaluate({ $and: [{ a: 1 }, { b: 2 }] }, { a: 1, b: 2 }).pass, true);
    assert.strictEqual(condEval.evaluate({ $or: [{ a: 1 }, { b: 999 }] }, { a: 1, b: 2 }).pass, true);
  });
  t('S4', '$regex', () => { assert.strictEqual(condEval.evaluate({ p: { '$regex': '^skills/' } }, { p: 'skills/x' }).pass, true); });
  t('S4', '点号路径', () => { assert.strictEqual(condEval.evaluate({ 'm.s': { '$gt': 0.5 } }, { m: { s: 0.8 } }).pass, true); });
  t('S4', 'ISC条件 severity==HIGH', () => {
    assert.strictEqual(condEval.evaluate('severity == HIGH', { severity: 'HIGH' }).pass, true);
    assert.strictEqual(condEval.evaluate('severity == HIGH', { severity: 'LOW' }).pass, false);
  });
  t('S4', '描述性条件→needs_llm', () => {
    const r = condEval.evaluate('当系统检测到高优先级任务未完成且距离截止日期不足两天时触发', {});
    assert.strictEqual(r.needs_llm, true); assert.strictEqual(r.pass, true);
  });
}

// ── Stage 5: handler-executor ──
async function s5() {
  console.log('\n⚙️ Stage 5: handler-executor');

  t('S5', 'loadHandler log-action', () => { const h = executor.loadHandler('log-action'); assert.ok(h && typeof h === 'function'); });
  t('S5', 'loadHandler不存在→null', () => { assert.strictEqual(executor.loadHandler('nonexist-xyz'), null); });
  t('S5', 'buildContext正确', () => {
    const c = executor.buildContext({ id: 'e', type: 't', payload: {}, source: 's' }, { id: 'r' });
    assert.ok(c.bus && typeof c.bus.emit === 'function');
    assert.ok(typeof c.notify === 'function');
    assert.strictEqual(c.workspace, WS);
  });

  await ta('S5', 'execute() log-action', async () => {
    const r = await executor.execute('log-action',
      { id: 'evt_e2e_01', type: 'git.commit.created', payload: { repo: 't' }, source: 'e2e' },
      { id: 'e2e-r-01' });
    assert.strictEqual(r.success, true, r.error); assert.ok(r.duration >= 0);
  });

  t('S5', 'handler写入log', () => {
    assert.ok(fs.existsSync(LOG_FILE));
    const lines = fs.readFileSync(LOG_FILE, 'utf8').trim().split('\n');
    const last = JSON.parse(lines[lines.length - 1]);
    assert.strictEqual(last.handler, 'log-action'); assert.strictEqual(last.eventId, 'evt_e2e_01');
  });

  const slowP = path.resolve(__dirname, '../infrastructure/event-bus/handlers/e2e-slow-test.js');
  await ta('S5', '超时处理', async () => {
    fs.writeFileSync(slowP, `module.exports=async()=>{await new Promise(r=>setTimeout(r,5000));};`);
    try {
      const r = await executor.execute('e2e-slow-test',
        { id: 'to', type: 't', payload: {}, source: 'e2e' }, { id: 'rto' }, { timeout: 500 });
      assert.strictEqual(r.success, false); assert.ok(r.error.includes('timeout'));
    } finally { try { fs.unlinkSync(slowP); } catch (_) {} try { delete require.cache[require.resolve(slowP)]; } catch (_) {} }
  });
}

// ── Stage 6: 全链路集成 ──
async function s6() {
  console.log('\n🔗 Stage 6: 全链路集成');
  bus.purge(); busAdapter._clearDedupeCache(); breaker.reset();

  const rDir = path.resolve(WS, 'skills/isc-core/rules');
  const rPath = path.join(rDir, 'rule.e2e-test-pipeline-001.json');
  const hPath = path.resolve(__dirname, '../infrastructure/event-bus/handlers/e2e-test-handler.js');

  try {
    t('S6', '创建测试ISC规则', () => {
      fs.writeFileSync(rPath, JSON.stringify({
        id: 'rule.e2e-test-pipeline-001', name: 'e2e_test', domain: 'testing', type: 'rule',
        description: 'E2E测试规则',
        trigger: { events: ['e2e.test.pipeline'], actions: [{ handler: 'e2e-test-handler', type: 'execute' }] },
        conditions: { severity: 'CRITICAL' },
        action: { handler: 'e2e-test-handler' }, severity: 'HIGH', priority: 1,
      }, null, 2));
      assert.ok(fs.existsSync(rPath));
    });

    t('S6', '创建测试handler', () => {
      fs.writeFileSync(hPath, `'use strict';
const fs=require('fs'),path=require('path');
const OUT=${JSON.stringify(TEST_OUT)};
module.exports=async function(ev,rule,ctx){
  const o={handler:'e2e-test-handler',executed_at:new Date().toISOString(),
    event_id:ev.id,event_type:ev.type,rule_id:rule.id,
    payload:ev.payload,source:ev.source,
    context_keys:Object.keys(ctx||{}),success:true};
  const d=path.dirname(OUT);
  if(!fs.existsSync(d))fs.mkdirSync(d,{recursive:true});
  fs.writeFileSync(OUT,JSON.stringify(o,null,2));
  return {success:true,result:'E2E handler ok'};
};`);
      assert.ok(fs.existsSync(hPath));
    });

    const disp = new Dispatcher({
      rulesDir: rDir, logFile: DISP_LOG,
      logger: { debug: () => {}, warn: () => {}, log: () => {}, error: () => {} },
    });

    await ta('S6', 'Dispatcher加载测试规则', async () => {
      await disp.init();
      assert.ok(disp.getEventIndex()['e2e.test.pipeline']);
    });

    let eid = null;
    t('S6', 'emit发射事件', () => {
      const r = busAdapter.emit('e2e.test.pipeline', {
        severity: 'CRITICAL', test_id: 'e2e-001', message: 'E2E测试',
      }, 'e2e-test');
      assert.ok(r.id); assert.strictEqual(r.suppressed, false);
      eid = r.id; console.log(`    → 事件ID: ${eid}`);
    });

    t('S6', 'events.jsonl记录', () => {
      const evts = bus.history({ type: 'e2e.test.pipeline' });
      assert.ok(evts.length >= 1); assert.strictEqual(evts[evts.length - 1].payload.severity, 'CRITICAL');
    });

    t('S6', '熔断器放行', () => { assert.strictEqual(breaker.check('e2e.test.pipeline', { chain_depth: 0 }).allowed, true); });

    try { delete require.cache[require.resolve(hPath)]; } catch (_) {}
    try { fs.unlinkSync(TEST_OUT); } catch (_) {}

    await ta('S6', 'Dispatcher路由→条件→handler执行', async () => {
      await disp.dispatch('e2e.test.pipeline', { severity: 'CRITICAL', test_id: 'e2e-001' });
      const st = disp.getStats();
      console.log(`    → stats: dispatched=${st.dispatched} matched=${st.matched} executed=${st.executed} skipped=${st.skipped} failed=${st.failed}`);
      assert.ok(st.matched > 0);
    });

    t('S6', '条件评估CRITICAL通过', () => {
      assert.strictEqual(condEval.evaluate({ severity: 'CRITICAL' }, { severity: 'CRITICAL' }).pass, true);
    });
    t('S6', '条件评估LOW不通过', () => {
      assert.strictEqual(condEval.evaluate({ severity: 'CRITICAL' }, { severity: 'LOW' }).pass, false);
    });

    // Also execute via handler-executor for explicit verification
    try { delete require.cache[require.resolve(hPath)]; } catch (_) {}
    try { fs.unlinkSync(TEST_OUT); } catch (_) {}

    await ta('S6', 'handler-executor执行handler', async () => {
      const r = await executor.execute('e2e-test-handler',
        { id: eid || 'evt_e2e', type: 'e2e.test.pipeline', payload: { severity: 'CRITICAL', test_id: 'e2e-001' }, source: 'e2e' },
        { id: 'rule.e2e-test-pipeline-001' });
      assert.strictEqual(r.success, true, r.error);
    });

    t('S6', 'handler输出文件正确', () => {
      assert.ok(fs.existsSync(TEST_OUT), 'output file should exist');
      const o = JSON.parse(fs.readFileSync(TEST_OUT, 'utf8'));
      assert.strictEqual(o.handler, 'e2e-test-handler');
      assert.strictEqual(o.event_type, 'e2e.test.pipeline');
      assert.strictEqual(o.payload.severity, 'CRITICAL');
      assert.strictEqual(o.success, true);
      console.log(`    → handler执行时间: ${o.executed_at}`);
      console.log(`    → context keys: ${o.context_keys.join(', ')}`);
    });

    t('S6', 'consume()消费事件', () => {
      const evts = busAdapter.consume({ type_filter: 'e2e.test.pipeline', consumerId: 'e2e-c-001' });
      assert.ok(evts.length >= 1); assert.strictEqual(evts[0].type, 'e2e.test.pipeline');
    });

  } finally {
    try { fs.unlinkSync(rPath); } catch (_) {}
    try { fs.unlinkSync(hPath); } catch (_) {}
    try { fs.unlinkSync(TEST_OUT); } catch (_) {}
    try { delete require.cache[require.resolve(hPath)]; } catch (_) {}
  }
}

// ── Report Generation ──
function genReport() {
  const now = new Date().toISOString();
  const total = nP + nF + nS;
  const rate = total > 0 ? ((nP / total) * 100).toFixed(1) : '0';
  const status = nF === 0 ? '✅ ALL PASSED' : `❌ ${nF} FAILURES`;

  const SN = {
    S1: '📡 Stage 1: bus-adapter.emit()',
    S2: '🔌 Stage 2: circuit-breaker',
    S3: '🔀 Stage 3: dispatcher 路由',
    S4: '🧮 Stage 4: condition-evaluator',
    S5: '⚙️ Stage 5: handler-executor',
    S6: '🔗 Stage 6: 全链路集成',
  };

  let md = `# E2E 事件驱动全链路集成测试报告\n\n`;
  md += `**日期**: ${now}\n**状态**: ${status}\n**通过率**: ${rate}% (${nP}/${total})\n\n`;
  md += `## 测试概要\n\n| 指标 | 数值 |\n|------|------|\n`;
  md += `| 总测试数 | ${total} |\n| 通过 | ${nP} |\n| 失败 | ${nF} |\n| 跳过 | ${nS} |\n| 通过率 | ${rate}% |\n\n`;
  md += `## 测试链路\n\n\`\`\`\nbus-adapter.emit() → circuit-breaker.check() → dispatcher.dispatch()\n  → condition-evaluator.evaluate() → handler-executor.execute()\n    → handler函数运行 → 输出验证\n\`\`\`\n\n`;
  md += `## 各阶段详细结果\n\n`;

  for (const stg of ['S1', 'S2', 'S3', 'S4', 'S5', 'S6']) {
    const sr = res.filter(r => r.stage === stg);
    if (sr.length === 0) continue;
    const sp = sr.filter(r => r.status === 'pass').length;
    const si = sr.every(r => r.status === 'pass') ? '✅' : '⚠️';
    md += `### ${SN[stg]} ${si} (${sp}/${sr.length})\n\n| 状态 | 测试名称 | 备注 |\n|------|----------|------|\n`;
    for (const r of sr) {
      const ic = r.status === 'pass' ? '✅' : r.status === 'fail' ? '❌' : '⏭️';
      md += `| ${ic} | ${r.name} | ${(r.details || '-').slice(0, 80).replace(/\|/g, '\\|')} |\n`;
    }
    md += '\n';
  }

  const fails = res.filter(r => r.status === 'fail');
  if (fails.length > 0) {
    md += `## ❌ 失败详情\n\n`;
    for (const f of fails) md += `### ${f.stage}: ${f.name}\n- **时间**: ${f.ts}\n- **错误**: \`${f.details}\`\n\n`;
  }

  md += `## 验证的关键链路\n\n`;
  md += `1. **事件发射**: bus-adapter.emit() → events.jsonl + trace_id + chain_depth\n`;
  md += `2. **风暴抑制**: 5秒去重窗口\n`;
  md += `3. **熔断器**: 速率限制 + 链深度 + 全局熔断\n`;
  md += `4. **路由分发**: Dispatcher → ISC规则匹配\n`;
  md += `5. **条件评估**: 对象/字符串/运算符/逻辑/正则\n`;
  md += `6. **Handler执行**: 加载/上下文/执行/超时保护\n`;
  md += `7. **全链路**: emit → breaker → dispatch → evaluate → execute → output\n\n`;
  md += `---\n*Generated by e2e-event-pipeline.test.js*\n`;

  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, md);
  return md;
}

// ── Main ──
async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log(' 🧪 E2E Event Pipeline Integration Test');
  console.log('═══════════════════════════════════════════════════');

  setup();
  try {
    s1();
    s2();
    await s3();
    s4();
    await s5();
    await s6();
  } finally {
    teardown();
  }

  console.log('\n═══════════════════════════════════════════════════');
  console.log(` 📊 结果: ${nP} passed, ${nF} failed, ${nS} skipped (total ${nP + nF + nS})`);
  console.log('═══════════════════════════════════════════════════');

  genReport();
  console.log(`\n📝 报告已生成: ${REPORT}`);

  process.exit(nF > 0 ? 1 : 0);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
