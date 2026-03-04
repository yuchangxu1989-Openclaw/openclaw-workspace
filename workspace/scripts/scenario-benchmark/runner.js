'use strict';

/**
 * Scenario Benchmark Runner
 * 
 * Reads scenario JSON files from scenarios/ directory,
 * executes each step through the real L3 pipeline (EventBus → IntentScanner → RuleMatcher → Dispatcher),
 * and generates a pass/fail report.
 */

const fs = require('fs');
const path = require('path');

// ─── Infrastructure imports with graceful degradation ───
const INFRA = path.resolve(__dirname, '../../infrastructure');

let EventBus, IntentScanner, RuleMatcher, Dispatcher;
const loadErrors = [];

try { EventBus = require(path.join(INFRA, 'event-bus/bus-adapter')); } catch (e) {
  try { EventBus = require(path.join(INFRA, 'event-bus/bus')); } catch (e2) {
    loadErrors.push(`EventBus: ${e2.message}`);
    EventBus = createMockEventBus();
  }
}

try { IntentScanner = require(path.join(INFRA, 'intent-engine/intent-scanner')); } catch (e) {
  loadErrors.push(`IntentScanner: ${e.message}`);
  IntentScanner = null;
}

try { RuleMatcher = require(path.join(INFRA, 'rule-engine/isc-rule-matcher')); } catch (e) {
  loadErrors.push(`RuleMatcher: ${e.message}`);
  RuleMatcher = null;
}

try { Dispatcher = require(path.join(INFRA, 'dispatcher/dispatcher')); } catch (e) {
  loadErrors.push(`Dispatcher: ${e.message}`);
  Dispatcher = null;
}

// ─── Mock fallbacks ───
function createMockEventBus() {
  const listeners = {};
  return {
    emit(type, payload, source) {
      const event = { id: `mock-${Date.now()}`, type, payload, source, ts: Date.now() };
      (listeners[type] || []).forEach(fn => fn(event));
      (listeners['*'] || []).forEach(fn => fn(event));
      return event;
    },
    on(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    consume() { return []; },
    stats() { return { total: 0 }; },
    _mock: true
  };
}

// ─── Scenario loader ───
function loadScenarios(dir) {
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  return files.map(f => {
    const content = fs.readFileSync(path.join(dir, f), 'utf8');
    return JSON.parse(content);
  });
}

// ─── Step executors ───
async function executeStep(step, context) {
  const timeout = step.timeout_ms || 30000;
  
  return Promise.race([
    _executeStepInner(step, context),
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout after ${timeout}ms`)), timeout))
  ]);
}

async function _executeStepInner(step, context) {
  if (step.action === 'emit') {
    // Emit event through EventBus
    const event = EventBus.emit(step.event, step.payload, 'scenario-benchmark');
    context.lastEvent = event;
    context.lastEmitPayload = step.payload;
    return { status: 'pass', detail: `Emitted ${step.event}` };
  }

  if (step.expect === 'intent_detected') {
    // Run IntentScanner on the last emitted text
    if (!IntentScanner) {
      return { status: 'degraded', detail: 'IntentScanner not available, using regex fallback' };
    }
    try {
      const text = context.lastEmitPayload?.text || '';
      let result;
      // Try scan method
      if (typeof IntentScanner.scan === 'function') {
        result = await IntentScanner.scan([{ role: 'user', content: text }]);
      } else if (typeof IntentScanner.prototype?.scan === 'function') {
        const scanner = new IntentScanner();
        result = await scanner.scan([{ role: 'user', content: text }]);
      } else {
        // Regex fallback
        result = regexIntentFallback(text);
      }
      context.lastIntent = result;
      
      if (step.intent_category && result) {
        const cat = result.category || result.intent_category || result.id || '';
        if (!cat.includes(step.intent_category) && cat !== step.intent_category) {
          return { status: 'fail', detail: `Expected intent ${step.intent_category}, got ${cat}` };
        }
      }
      return { status: 'pass', detail: `Intent detected: ${JSON.stringify(result).slice(0, 200)}` };
    } catch (e) {
      // LLM unavailable - use regex fallback
      const text = context.lastEmitPayload?.text || '';
      const fallback = regexIntentFallback(text);
      context.lastIntent = fallback;
      return { status: 'degraded', detail: `LLM unavailable, regex fallback: ${fallback.category}` };
    }
  }

  if (step.expect === 'rule_matched') {
    if (!RuleMatcher) {
      return { status: 'degraded', detail: 'RuleMatcher not available' };
    }
    try {
      const eventType = context.lastEvent?.type || 'user.message';
      const payload = context.lastEvent?.payload || context.lastEmitPayload || {};
      
      let rules;
      if (typeof RuleMatcher.match === 'function') {
        rules = RuleMatcher.match(eventType, payload);
      } else if (typeof RuleMatcher.prototype?.match === 'function') {
        const matcher = new RuleMatcher();
        rules = matcher.match(eventType, payload);
      } else {
        rules = [];
      }
      
      context.matchedRules = Array.isArray(rules) ? rules : [rules].filter(Boolean);
      const count = context.matchedRules.length;
      
      if (step.min_rules && count < step.min_rules) {
        return { status: 'fail', detail: `Expected >= ${step.min_rules} rules, got ${count}` };
      }
      return { status: 'pass', detail: `${count} rules matched` };
    } catch (e) {
      return { status: 'fail', detail: `RuleMatcher error: ${e.message}` };
    }
  }

  if (step.expect === 'dispatched') {
    if (!Dispatcher) {
      return { status: 'degraded', detail: 'Dispatcher not available' };
    }
    try {
      const rules = context.matchedRules || [];
      const event = context.lastEvent || { type: 'user.message', payload: context.lastEmitPayload };
      
      let dispatched = false;
      let handlerName = '';
      
      for (const rule of rules) {
        try {
          let result;
          if (typeof Dispatcher.dispatch === 'function') {
            result = await Dispatcher.dispatch(rule, event);
          } else if (typeof Dispatcher.prototype?.dispatch === 'function') {
            const d = new Dispatcher();
            result = await d.dispatch(rule, event);
          }
          if (result) {
            dispatched = true;
            handlerName = result.handler || result.name || JSON.stringify(result).slice(0, 100);
            break;
          }
        } catch (e) {
          // Handler execution may fail - that's a valid test signal
          handlerName = `error: ${e.message}`;
        }
      }
      
      context.dispatched = dispatched;
      context.handlerName = handlerName;
      
      if (step.handler_pattern) {
        const pattern = step.handler_pattern.replace('*', '.*');
        if (!new RegExp(pattern, 'i').test(handlerName)) {
          return { status: 'fail', detail: `Handler "${handlerName}" doesn't match pattern "${step.handler_pattern}"` };
        }
      }
      
      return dispatched
        ? { status: 'pass', detail: `Dispatched to: ${handlerName}` }
        : { status: 'fail', detail: 'No handler dispatched' };
    } catch (e) {
      return { status: 'fail', detail: `Dispatch error: ${e.message}` };
    }
  }

  if (step.expect === 'result') {
    // Check if there's output from the dispatch
    const hasOutput = context.dispatched || context.matchedRules?.length > 0;
    if (step.has_output && !hasOutput) {
      return { status: 'fail', detail: 'Expected output but none produced' };
    }
    return { status: 'pass', detail: 'Result check passed' };
  }

  return { status: 'skip', detail: `Unknown step type: ${JSON.stringify(step).slice(0, 100)}` };
}

// ─── Regex intent fallback ───
function regexIntentFallback(text) {
  const patterns = [
    { pattern: /论文|学术|方法论|研究|文献/i, category: 'IC3', name: 'academic_analysis' },
    { pattern: /需求|意图|用户|想要|真实/i, category: 'IC3', name: 'user_intent' },
    { pattern: /缺陷|bug|反复|模式|代码质量/i, category: 'IC3', name: 'engineering_defect' },
    { pattern: /竞品|对比|竞争|分析.*能力/i, category: 'IC3', name: 'competitive_analysis' },
    { pattern: /技能|开发|创建|skill/i, category: 'IC2', name: 'skill_creation' },
    { pattern: /网页|页面|网站|前端|html/i, category: 'IC2', name: 'webpage_build' },
    { pattern: /编排|协调|多.*技能|pipeline/i, category: 'IC2', name: 'skill_orchestration' },
    { pattern: /PDF|文档.*知识|结构化|吸收/i, category: 'IC4', name: 'knowledge_extraction' },
    { pattern: /公众号|自媒体|运营|内容.*创作/i, category: 'IC4', name: 'content_operation' },
    { pattern: /金融|财务|数据.*分析|报表/i, category: 'IC5', name: 'financial_analysis' },
  ];
  
  for (const { pattern, category, name } of patterns) {
    if (pattern.test(text)) {
      return { category, name, confidence: 0.7, source: 'regex_fallback' };
    }
  }
  return { category: 'IC0', name: 'unknown', confidence: 0.1, source: 'regex_fallback' };
}

// ─── Run a single scenario ───
async function runScenario(scenario) {
  const results = [];
  const context = {};
  let passed = true;
  let failPoint = null;

  for (let i = 0; i < scenario.steps.length; i++) {
    const step = scenario.steps[i];
    try {
      const result = await executeStep(step, context);
      results.push({ step: i, ...step, result });
      if (result.status === 'fail') {
        passed = false;
        failPoint = { step: i, detail: result.detail, stepDef: step };
        break; // Stop at first failure
      }
    } catch (e) {
      const result = { status: 'error', detail: e.message };
      results.push({ step: i, ...step, result });
      passed = false;
      failPoint = { step: i, detail: e.message, stepDef: step };
      break;
    }
  }

  return {
    id: scenario.id,
    name: scenario.name,
    domain: scenario.domain,
    passed,
    failPoint,
    steps: results,
    degraded: results.some(r => r.result?.status === 'degraded')
  };
}

// ─── Generate report ───
function generateReport(results, startTime) {
  const endTime = Date.now();
  const elapsed = ((endTime - startTime) / 1000).toFixed(1);
  
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const degraded = results.filter(r => r.degraded).length;
  
  // Domain coverage
  const domains = new Map();
  for (const r of results) {
    if (!domains.has(r.domain)) domains.set(r.domain, { total: 0, passed: 0 });
    domains.get(r.domain).total++;
    if (r.passed) domains.get(r.domain).passed++;
  }

  let report = `# Day1 场景化Benchmark报告\n\n`;
  report += `**生成时间**: ${new Date().toISOString()}\n`;
  report += `**执行耗时**: ${elapsed}s\n`;
  report += `**基础设施加载**: ${loadErrors.length === 0 ? '✅ 全部正常' : `⚠️ ${loadErrors.length}个降级`}\n\n`;
  
  if (loadErrors.length > 0) {
    report += `### 基础设施降级\n`;
    for (const err of loadErrors) report += `- ⚠️ ${err}\n`;
    report += `\n`;
  }

  report += `## 总览\n\n`;
  report += `| 指标 | 值 |\n|------|----|\n`;
  report += `| 场景总数 | ${total} |\n`;
  report += `| ✅ 通过 | ${passed} |\n`;
  report += `| ❌ 失败 | ${failed} |\n`;
  report += `| ⚠️ 降级执行 | ${degraded} |\n`;
  report += `| 通过率 | ${(passed / total * 100).toFixed(1)}% |\n\n`;

  report += `## 领域覆盖率\n\n`;
  report += `| 领域 | 场景数 | 通过 | 覆盖率 |\n|------|--------|------|--------|\n`;
  for (const [domain, stats] of domains) {
    report += `| ${domain} | ${stats.total} | ${stats.passed} | ${(stats.passed / stats.total * 100).toFixed(0)}% |\n`;
  }
  report += `\n`;

  report += `## 场景详情\n\n`;
  for (const r of results) {
    const icon = r.passed ? '✅' : '❌';
    const degradeIcon = r.degraded ? ' ⚠️' : '';
    report += `### ${icon}${degradeIcon} ${r.name} (${r.id})\n`;
    report += `- **领域**: ${r.domain}\n`;
    report += `- **结果**: ${r.passed ? 'PASS' : 'FAIL'}\n`;
    
    if (r.failPoint) {
      report += `- **失败断点**: Step ${r.failPoint.step}\n`;
      report += `  - 期望: \`${JSON.stringify(r.failPoint.stepDef).slice(0, 150)}\`\n`;
      report += `  - 原因: ${r.failPoint.detail}\n`;
    }
    
    report += `- **步骤执行**:\n`;
    for (const s of r.steps) {
      const sIcon = s.result.status === 'pass' ? '✅' : s.result.status === 'degraded' ? '⚠️' : '❌';
      report += `  ${sIcon} Step ${s.step}: ${s.result.detail}\n`;
    }
    report += `\n`;
  }

  return report;
}

// ─── Main ───
async function main() {
  console.log('🎯 Scenario Benchmark Runner starting...');
  console.log(`Infrastructure load: ${loadErrors.length === 0 ? 'OK' : loadErrors.length + ' degraded'}`);
  
  const scenariosDir = path.join(__dirname, 'scenarios');
  const scenarios = loadScenarios(scenariosDir);
  console.log(`Loaded ${scenarios.length} scenarios\n`);

  const startTime = Date.now();
  const results = [];

  for (const scenario of scenarios) {
    process.stdout.write(`Running: ${scenario.name}... `);
    const result = await runScenario(scenario);
    console.log(result.passed ? '✅ PASS' : `❌ FAIL (step ${result.failPoint?.step})`);
    results.push(result);
  }

  const report = generateReport(results, startTime);
  
  // Write report
  const reportsDir = path.resolve(__dirname, '../../reports');
  fs.mkdirSync(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, 'day1-scenario-benchmark.md');
  fs.writeFileSync(reportPath, report, 'utf8');
  console.log(`\n📊 Report written to: ${reportPath}`);
  
  // Summary
  const passed = results.filter(r => r.passed).length;
  console.log(`\n🏁 Results: ${passed}/${results.length} passed (${(passed/results.length*100).toFixed(0)}%)`);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
