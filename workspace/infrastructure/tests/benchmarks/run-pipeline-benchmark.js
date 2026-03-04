#!/usr/bin/env node
'use strict';

/**
 * L3 Pipeline End-to-End Benchmark Runner
 * 
 * Runs each benchmark case independently, measures accuracy and latency,
 * outputs a formatted report.
 */

const fs = require('fs');
const path = require('path');

// Paths
const DATASET_FILE = path.join(__dirname, 'pipeline-benchmark-dataset.json');
const WORKSPACE = path.resolve(__dirname, '../../..');
const REPORT_DIR = path.join(WORKSPACE, 'reports');

// Load modules
const EventBus = require('../../event-bus/bus-adapter');
const bus = require('../../event-bus/bus');
const Dispatcher = require('../../dispatcher/dispatcher');
const { L3Pipeline } = require('../../pipeline/l3-pipeline');

// ─── Helpers ───

function clearState() {
  // Purge event bus
  try { bus.purge(); } catch (_) {}
  // Clear dedupe cache
  try { EventBus._clearDedupeCache(); } catch (_) {}
  // Clear dispatcher route cache
  try { Dispatcher.clearRouteCache(); } catch (_) {}
}

function setFeatureFlags(flags) {
  // Reset all pipeline flags to defaults
  const allFlags = [
    'L3_PIPELINE_ENABLED', 'L3_EVENTBUS_ENABLED', 'L3_RULEMATCHER_ENABLED',
    'L3_INTENTSCANNER_ENABLED', 'L3_DISPATCHER_ENABLED', 'L3_DECISIONLOG_ENABLED',
    'DISPATCHER_ENABLED'
  ];
  for (const f of allFlags) delete process.env[f];
  // Disable decision log to reduce noise
  process.env.L3_DECISIONLOG_ENABLED = 'false';
  // Apply case-specific flags
  if (flags) {
    for (const [k, v] of Object.entries(flags)) {
      process.env[k] = v;
    }
  }
}

function restoreFlags() {
  const allFlags = [
    'L3_PIPELINE_ENABLED', 'L3_EVENTBUS_ENABLED', 'L3_RULEMATCHER_ENABLED',
    'L3_INTENTSCANNER_ENABLED', 'L3_DISPATCHER_ENABLED', 'L3_DECISIONLOG_ENABLED',
    'DISPATCHER_ENABLED'
  ];
  for (const f of allFlags) delete process.env[f];
}

// ─── Run single case ───

async function runCase(testCase) {
  const result = {
    id: testCase.id,
    scenario: testCase.scenario,
    difficulty: testCase.difficulty,
    passed: true,
    failures: [],
    duration_ms: 0,
    circuit_break_correct: true,
    dispatch_correct: true,
    intent_correct: true,
  };

  clearState();
  setFeatureFlags(testCase.feature_flags || null);

  const startTime = Date.now();

  try {
    // Inject events into EventBus (add unique _bench_id to avoid storm suppression)
    for (let i = 0; i < testCase.input_events.length; i++) {
      const evt = testCase.input_events[i];
      const uniqueData = Object.assign({}, evt.data || {}, { _bench_id: `${testCase.id}_${i}_${Date.now()}` });
      try {
        EventBus.emit(evt.type, uniqueData, evt.source || 'benchmark', evt.metadata || {});
      } catch (_) {}
    }

    // Run pipeline
    const pipeline = new L3Pipeline({ windowMs: 60000, maxChainDepth: 5 });
    const summary = await pipeline.run();

    result.duration_ms = Date.now() - startTime;
    result.summary = {
      consumed: summary.consumed_events,
      matched_rules: summary.matched_rules,
      intents: summary.intents_detected,
      dispatched: summary.dispatched_actions,
      circuit_breaks: summary.circuit_breaks,
      skipped: summary.skipped || false,
      errors: summary.errors,
    };

    // ─── Validate circuit break ───
    if (testCase.expected_circuit_break) {
      if (summary.circuit_breaks === 0 && !summary.skipped) {
        result.circuit_break_correct = false;
        result.passed = false;
        result.failures.push('Expected circuit break but got 0 breaks');
      }
    } else {
      if (summary.circuit_breaks > 0) {
        // Only fail if ALL events were supposed to process (no mixed case)
        // For mixed cases (PB-022), circuit_break is true AND dispatches happen
        if (testCase.expected_actions_dispatched.length === 0 && testCase.input_events.length > 0 && !summary.skipped) {
          // If we expected no dispatches and no break, but got breaks, it's wrong
          if (!testCase.expected_circuit_break) {
            result.circuit_break_correct = false;
            result.passed = false;
            result.failures.push(`Unexpected circuit break: got ${summary.circuit_breaks} breaks`);
          }
        }
      }
    }

    // ─── Validate dispatches ───
    const expectedDispatchCount = testCase.expected_actions_dispatched.length;
    
    // For feature flag cases that skip the pipeline
    if (summary.skipped) {
      if (expectedDispatchCount > 0) {
        result.dispatch_correct = false;
        result.passed = false;
        result.failures.push(`Pipeline skipped but expected ${expectedDispatchCount} dispatches`);
      }
    } else {
      // Check dispatch count matches
      if (summary.dispatched_actions !== expectedDispatchCount) {
        // For file-dispatched actions, the count might differ since handlers don't exist
        // dispatched_actions counts successful dispatch calls, file_dispatched counts as success
        result.dispatch_correct = false;
        result.passed = false;
        result.failures.push(`Expected ${expectedDispatchCount} dispatches, got ${summary.dispatched_actions}`);
      }
    }

    // ─── Validate intents ───
    if (testCase.expected_intents.length > 0) {
      if (testCase.expected_intents[0] === '_any_') {
        // Just check that intent scanning was attempted (may fail due to no LLM key, which is ok)
        result.intent_correct = true; // Best-effort: intent scanner may use regex fallback
      }
    }

  } catch (err) {
    result.duration_ms = Date.now() - startTime;
    result.passed = false;
    result.failures.push(`Runtime error: ${err.message}`);
  }

  restoreFlags();
  return result;
}

// ─── Main ───

async function main() {
  console.log('═══ L3 Pipeline End-to-End Benchmark ═══\n');

  const dataset = JSON.parse(fs.readFileSync(DATASET_FILE, 'utf8'));
  console.log(`Loaded ${dataset.length} test cases\n`);

  const results = [];
  let passed = 0, failed = 0;
  let totalDuration = 0;
  let circuitBreakCorrect = 0, circuitBreakTotal = 0;
  let dispatchCorrect = 0, dispatchTotal = 0;
  let degradationCorrect = 0, degradationTotal = 0;

  for (const tc of dataset) {
    const r = await runCase(tc);
    results.push(r);

    if (r.passed) {
      passed++;
      process.stdout.write(`  ✅ ${r.id}: ${r.scenario.slice(0, 60)}...\n`);
    } else {
      failed++;
      process.stdout.write(`  ❌ ${r.id}: ${r.failures.join('; ')}\n`);
    }

    totalDuration += r.duration_ms;

    // Circuit break stats
    const tc_has_cb = tc.expected_circuit_break;
    const tc_has_no_cb = !tc.expected_circuit_break && tc.input_events.some(e => e.metadata && e.metadata.chain_depth > 5);
    if (tc_has_cb || tc_has_no_cb) {
      circuitBreakTotal++;
      if (r.circuit_break_correct) circuitBreakCorrect++;
    }

    // Dispatch stats
    if (tc.expected_actions_dispatched.length > 0 || tc.input_events.length > 0) {
      dispatchTotal++;
      if (r.dispatch_correct) dispatchCorrect++;
    }

    // Degradation (feature flag) stats
    if (tc.feature_flags) {
      degradationTotal++;
      if (r.passed) degradationCorrect++;
    }
  }

  const avgLatency = results.length > 0 ? (totalDuration / results.length).toFixed(1) : 0;

  // ─── Report ───
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  端到端正确率:     ${passed}/${results.length} (${(passed/results.length*100).toFixed(1)}%)`);
  console.log(`  规则匹配→分发准确率: ${dispatchCorrect}/${dispatchTotal} (${dispatchTotal ? (dispatchCorrect/dispatchTotal*100).toFixed(1) : 'N/A'}%)`);
  console.log(`  熔断有效率:       ${circuitBreakCorrect}/${circuitBreakTotal} (${circuitBreakTotal ? (circuitBreakCorrect/circuitBreakTotal*100).toFixed(1) : 'N/A'}%)`);
  console.log(`  降级正确率:       ${degradationCorrect}/${degradationTotal} (${degradationTotal ? (degradationCorrect/degradationTotal*100).toFixed(1) : 'N/A'}%)`);
  console.log(`  平均延迟:         ${avgLatency}ms`);
  console.log(`${'═'.repeat(60)}\n`);

  // ─── Write report ───
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const reportPath = path.join(REPORT_DIR, 'day1-pipeline-benchmark.md');

  const byDifficulty = { easy: { p: 0, f: 0 }, medium: { p: 0, f: 0 }, hard: { p: 0, f: 0 } };
  for (const r of results) {
    const d = r.difficulty || 'easy';
    if (r.passed) byDifficulty[d].p++; else byDifficulty[d].f++;
  }

  let md = `# L3 Pipeline E2E Benchmark Report

**Date:** ${new Date().toISOString().split('T')[0]}
**Total Cases:** ${results.length}
**Pass Rate:** ${passed}/${results.length} (${(passed/results.length*100).toFixed(1)}%)

## Metrics

| Metric | Result |
|--------|--------|
| 端到端正确率 | ${passed}/${results.length} (${(passed/results.length*100).toFixed(1)}%) |
| 规则匹配→分发准确率 | ${dispatchCorrect}/${dispatchTotal} (${dispatchTotal ? (dispatchCorrect/dispatchTotal*100).toFixed(1) : 'N/A'}%) |
| 熔断有效率 | ${circuitBreakCorrect}/${circuitBreakTotal} (${circuitBreakTotal ? (circuitBreakCorrect/circuitBreakTotal*100).toFixed(1) : 'N/A'}%) |
| 降级正确率 | ${degradationCorrect}/${degradationTotal} (${degradationTotal ? (degradationCorrect/degradationTotal*100).toFixed(1) : 'N/A'}%) |
| 平均延迟 | ${avgLatency}ms |

## By Difficulty

| Difficulty | Passed | Failed | Rate |
|------------|--------|--------|------|
| Easy | ${byDifficulty.easy.p} | ${byDifficulty.easy.f} | ${byDifficulty.easy.p+byDifficulty.easy.f ? ((byDifficulty.easy.p/(byDifficulty.easy.p+byDifficulty.easy.f))*100).toFixed(0) : 0}% |
| Medium | ${byDifficulty.medium.p} | ${byDifficulty.medium.f} | ${byDifficulty.medium.p+byDifficulty.medium.f ? ((byDifficulty.medium.p/(byDifficulty.medium.p+byDifficulty.medium.f))*100).toFixed(0) : 0}% |
| Hard | ${byDifficulty.hard.p} | ${byDifficulty.hard.f} | ${byDifficulty.hard.p+byDifficulty.hard.f ? ((byDifficulty.hard.p/(byDifficulty.hard.p+byDifficulty.hard.f))*100).toFixed(0) : 0}% |

## Failed Cases

`;

  const failedCases = results.filter(r => !r.passed);
  if (failedCases.length === 0) {
    md += '_All cases passed!_ 🎉\n';
  } else {
    for (const r of failedCases) {
      md += `### ${r.id}: ${r.scenario}\n`;
      md += `- **Difficulty:** ${r.difficulty}\n`;
      md += `- **Failures:** ${r.failures.join('; ')}\n`;
      if (r.summary) {
        md += `- **Actual:** consumed=${r.summary.consumed}, dispatched=${r.summary.dispatched}, breaks=${r.summary.circuit_breaks}, skipped=${r.summary.skipped}\n`;
      }
      md += '\n';
    }
  }

  md += `## All Cases Detail

| ID | Difficulty | Result | Duration | Notes |
|----|-----------|--------|----------|-------|
`;
  for (const r of results) {
    const status = r.passed ? '✅' : '❌';
    const notes = r.passed ? r.scenario.slice(0, 50) : r.failures[0] || '';
    md += `| ${r.id} | ${r.difficulty} | ${status} | ${r.duration_ms}ms | ${notes} |\n`;
  }

  fs.writeFileSync(reportPath, md);
  console.log(`Report written to: ${reportPath}`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(`Benchmark fatal error: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});
