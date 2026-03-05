#!/usr/bin/env node
'use strict';

/**
 * E2E Event Dispatch Suite Runner
 * 
 * Runs each test case through the full dispatch pipeline:
 * 1. Emit event to bus
 * 2. Run dispatcher matching
 * 3. Verify handler execution and results
 */

const fs = require('fs');
const path = require('path');

const SUITE_FILE = path.resolve(__dirname, 'event-dispatch-e2e-suite.json');
const REPORT_FILE = path.resolve(__dirname, '../../reports/e2e-dispatch-suite-result.md');
const BUS_DIR = path.resolve(__dirname, '../../infrastructure/event-bus');
const HANDLERS_DIR = path.join(BUS_DIR, 'handlers');

// Import dispatcher
const { Dispatcher } = require(path.join(BUS_DIR, 'dispatcher'));

// Intercept handler calls
class InstrumentedDispatcher extends Dispatcher {
  constructor(options) {
    super(options);
    this.handlerCalls = [];
    this.handlerResults = {};
  }

  async _executeHandler(action, rule, event) {
    const handlerName = action.handler || action.type;
    if (!handlerName) return;
    
    // Normalize handler name (strip paths like "handlers/xxx.js")
    const normalizedName = path.basename(handlerName, '.js');
    const handlerPath = path.join(HANDLERS_DIR, `${normalizedName}.js`);

    this.handlerCalls.push({
      handler: normalizedName,
      ruleId: rule.id,
      eventType: event.type
    });

    try {
      if (!fs.existsSync(handlerPath)) {
        this.handlerResults[normalizedName] = { success: false, error: `Handler file not found: ${handlerPath}` };
        return;
      }
      // Clear require cache to get fresh handler
      delete require.cache[require.resolve(handlerPath)];
      const handler = require(handlerPath);
      const result = await handler(event, rule, {});
      this.handlerResults[normalizedName] = result || { success: true };
    } catch (e) {
      this.handlerResults[normalizedName] = { success: false, error: e.message };
    }
  }

  reset() {
    this.handlerCalls = [];
    this.handlerResults = {};
  }
}

async function runSuite() {
  const suite = JSON.parse(fs.readFileSync(SUITE_FILE, 'utf8'));
  const startTime = Date.now();

  console.log(`\n🔬 E2E Event Dispatch Suite`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Cases: ${suite.length}\n`);

  const results = [];

  for (const testCase of suite) {
    const dispatcher = new InstrumentedDispatcher();
    await dispatcher.init();

    const caseStart = Date.now();
    const event = {
      id: `evt_test_${testCase.id}`,
      type: testCase.event.type,
      payload: testCase.event.payload,
      source: 'e2e-test',
      timestamp: Date.now()
    };

    // Run dispatch
    await dispatcher.dispatch(event.type, event.payload);

    // Check: rules matched
    const matchedRules = dispatcher._matchRules(event.type);
    const matchedRuleIds = matchedRules.map(r => r.id);
    const expectedRuleMatched = testCase.expected_matched_rules.some(
      expected => matchedRuleIds.includes(expected)
    );

    // Check: handler called
    const expectedHandler = testCase.expected_handler;
    const handlerWasCalled = dispatcher.handlerCalls.some(
      c => c.handler === expectedHandler
    );

    // Check: result matches expected
    const handlerResult = dispatcher.handlerResults[expectedHandler];
    let resultMatches = false;
    let actualResult = 'no_result';

    if (handlerResult) {
      actualResult = handlerResult.result || (handlerResult.success ? 'handler_called' : 'handler_failed');
      if (testCase.expected_result === 'handler_called') {
        resultMatches = handlerResult.success !== false;
      } else {
        resultMatches = actualResult === testCase.expected_result;
      }
    }

    const passed = expectedRuleMatched && handlerWasCalled && resultMatches;
    const caseTime = Date.now() - caseStart;

    const failReasons = [];
    if (!expectedRuleMatched) failReasons.push(`规则未匹配: 期望${testCase.expected_matched_rules.join(',')}, 实际[${matchedRuleIds.join(',')}]`);
    if (!handlerWasCalled) failReasons.push(`Handler未调用: 期望${expectedHandler}, 实际调用[${dispatcher.handlerCalls.map(c=>c.handler).join(',')}]`);
    if (!resultMatches) failReasons.push(`结果不匹配: 期望${testCase.expected_result}, 实际${actualResult}`);

    const status = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} | ${testCase.id} | ${testCase.name} (${caseTime}ms)`);
    if (!passed) {
      failReasons.forEach(r => console.log(`         └─ ${r}`));
    }

    results.push({
      id: testCase.id,
      name: testCase.name,
      passed,
      timeMs: caseTime,
      ruleMatched: expectedRuleMatched,
      handlerCalled: handlerWasCalled,
      resultMatches,
      actualResult,
      matchedRuleIds,
      handlerCalls: dispatcher.handlerCalls.map(c => c.handler),
      failReasons
    });
  }

  const totalTime = Date.now() - startTime;
  const passCount = results.filter(r => r.passed).length;
  const failCount = results.length - passCount;
  const passRate = ((passCount / results.length) * 100).toFixed(1);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 结果: ${passCount}/${results.length} 通过 (${passRate}%) | 耗时 ${totalTime}ms`);
  console.log(`${'='.repeat(60)}\n`);

  // Generate report
  const report = generateReport(results, totalTime, passCount, failCount, passRate);
  const reportDir = path.dirname(REPORT_FILE);
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(REPORT_FILE, report);
  console.log(`📄 报告已写入: ${REPORT_FILE}`);

  return { passCount, failCount, passRate, totalTime };
}

function generateReport(results, totalTime, passCount, failCount, passRate) {
  const now = new Date().toISOString();
  let md = `# E2E Event Dispatch Suite Report\n\n`;
  md += `**生成时间**: ${now}\n`;
  md += `**总耗时**: ${totalTime}ms\n`;
  md += `**通过率**: ${passRate}% (${passCount}/${results.length})\n\n`;
  md += `## 概览\n\n`;
  md += `| 指标 | 值 |\n|------|----|\n`;
  md += `| 总Case数 | ${results.length} |\n`;
  md += `| 通过 | ${passCount} |\n`;
  md += `| 失败 | ${failCount} |\n`;
  md += `| 通过率 | ${passRate}% |\n\n`;

  md += `## 详细结果\n\n`;
  for (const r of results) {
    const icon = r.passed ? '✅' : '❌';
    md += `### ${icon} ${r.id}: ${r.name}\n\n`;
    md += `- **状态**: ${r.passed ? 'PASS' : 'FAIL'}\n`;
    md += `- **耗时**: ${r.timeMs}ms\n`;
    md += `- **规则匹配**: ${r.ruleMatched ? '✓' : '✗'} (${r.matchedRuleIds.join(', ')})\n`;
    md += `- **Handler调用**: ${r.handlerCalled ? '✓' : '✗'} (${r.handlerCalls.join(', ')})\n`;
    md += `- **结果匹配**: ${r.resultMatches ? '✓' : '✗'} (实际: ${r.actualResult})\n`;
    if (r.failReasons.length > 0) {
      md += `- **失败原因**:\n`;
      r.failReasons.forEach(reason => { md += `  - ${reason}\n`; });
    }
    md += `\n`;
  }

  if (failCount > 0) {
    md += `## 失败Case根因分析\n\n`;
    for (const r of results.filter(r => !r.passed)) {
      md += `### ${r.id}: ${r.name}\n\n`;
      r.failReasons.forEach(reason => { md += `- ${reason}\n`; });
      md += `\n`;
    }
  }

  return md;
}

runSuite().then(({ passRate }) => {
  process.exit(parseFloat(passRate) >= 80 ? 0 : 1);
}).catch(e => {
  console.error(`Fatal: ${e.message}`);
  process.exit(1);
});
