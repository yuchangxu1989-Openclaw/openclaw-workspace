#!/usr/bin/env node
'use strict';

/**
 * L3 Pipeline End-to-End Benchmark Runner
 * 
 * Runs each benchmark case independently with clean state,
 * validates rule matching, circuit breaking, dispatching, and feature flags.
 */

const fs = require('fs');
const path = require('path');

const DATASET_FILE = path.join(__dirname, 'pipeline-benchmark-dataset.json');
const WORKSPACE = path.resolve(__dirname, '../../..');
const REPORT_DIR = path.join(WORKSPACE, 'reports');

const EventBus = require('../../event-bus/bus-adapter');
const bus = require('../../event-bus/bus');
const Dispatcher = require('../../dispatcher/dispatcher');
const { L3Pipeline } = require('../../pipeline/l3-pipeline');

function clearState() {
  try { bus.purge(); } catch (_) {}
  try { EventBus._clearDedupeCache(); } catch (_) {}
  try { Dispatcher.clearRouteCache(); } catch (_) {}
}

const ALL_FLAGS = [
  'L3_PIPELINE_ENABLED', 'L3_EVENTBUS_ENABLED', 'L3_RULEMATCHER_ENABLED',
  'L3_INTENTSCANNER_ENABLED', 'L3_DISPATCHER_ENABLED', 'L3_DECISIONLOG_ENABLED',
  'DISPATCHER_ENABLED'
];

function setFlags(flags) {
  for (const f of ALL_FLAGS) delete process.env[f];
  process.env.L3_DECISIONLOG_ENABLED = 'false';
  if (flags) for (const [k, v] of Object.entries(flags)) process.env[k] = v;
}

function restoreFlags() {
  for (const f of ALL_FLAGS) delete process.env[f];
}

async function runCase(tc) {
  const r = {
    id: tc.id, scenario: tc.scenario, difficulty: tc.difficulty,
    passed: true, failures: [], duration_ms: 0,
    circuit_break_ok: true, dispatch_ok: true, rules_ok: true,
  };

  clearState();
  setFlags(tc.feature_flags || null);
  const t0 = Date.now();

  try {
    for (let i = 0; i < tc.input_events.length; i++) {
      const evt = tc.input_events[i];
      const data = Object.assign({}, evt.data || {}, { _bench: `${tc.id}_${i}_${Date.now()}` });
      try { EventBus.emit(evt.type, data, evt.source || 'bench', evt.metadata || {}); } catch (_) {}
    }

    const pipeline = new L3Pipeline({ windowMs: 60000, maxChainDepth: 5 });
    const s = await pipeline.run();
    r.duration_ms = Date.now() - t0;
    r.actual = {
      consumed: s.consumed_events, rules: s.matched_rules,
      intents: s.intents_detected, dispatches: s.dispatched_actions,
      breaks: s.circuit_breaks, skipped: !!s.skipped, errors: s.errors.length,
    };

    // Validate skipped
    if (tc.expect_skipped && !s.skipped) {
      r.passed = false; r.failures.push('Expected pipeline skip');
    }

    // Validate circuit break
    if (tc.expected_circuit_break && s.circuit_breaks === 0 && !s.skipped) {
      r.circuit_break_ok = false; r.passed = false;
      r.failures.push(`Expected circuit break, got 0`);
    }

    // Validate rules matched
    if (tc.expected_rules_matched_min !== undefined && !s.skipped) {
      if (s.matched_rules < tc.expected_rules_matched_min) {
        r.rules_ok = false; r.passed = false;
        r.failures.push(`Rules: expected >=${tc.expected_rules_matched_min}, got ${s.matched_rules}`);
      }
    }
    if (tc.expected_rules_matched_max !== undefined && !s.skipped) {
      if (s.matched_rules > tc.expected_rules_matched_max) {
        r.rules_ok = false; r.passed = false;
        r.failures.push(`Rules: expected <=${tc.expected_rules_matched_max}, got ${s.matched_rules}`);
      }
    }

    // Validate dispatches
    if (tc.expected_dispatches_max !== undefined && !s.skipped) {
      if (s.dispatched_actions > tc.expected_dispatches_max) {
        r.dispatch_ok = false; r.passed = false;
        r.failures.push(`Dispatches: expected <=${tc.expected_dispatches_max}, got ${s.dispatched_actions}`);
      }
    }

  } catch (err) {
    r.duration_ms = Date.now() - t0;
    r.passed = false;
    r.failures.push(`Runtime error: ${err.message}`);
  }

  restoreFlags();
  return r;
}

async function main() {
  console.log('═══ L3 Pipeline E2E Benchmark ═══\n');
  const dataset = JSON.parse(fs.readFileSync(DATASET_FILE, 'utf8'));
  console.log(`${dataset.length} cases loaded\n`);

  const results = [];
  let passed = 0, failed = 0, totalDur = 0;
  let cbOk = 0, cbTotal = 0, dispOk = 0, dispTotal = 0, rulesOk = 0, rulesTotal = 0;
  let degradeOk = 0, degradeTotal = 0;

  for (const tc of dataset) {
    const r = await runCase(tc);
    results.push(r);
    totalDur += r.duration_ms;
    if (r.passed) { passed++; console.log(`  ✅ ${r.id}`); }
    else { failed++; console.log(`  ❌ ${r.id}: ${r.failures.join('; ')}`); }

    if (tc.expected_circuit_break || (tc.input_events || []).some(e => e.metadata && e.metadata.chain_depth > 5)) {
      cbTotal++; if (r.circuit_break_ok) cbOk++;
    }
    if (tc.expected_rules_matched_min !== undefined) {
      rulesTotal++; if (r.rules_ok) rulesOk++;
    }
    if (tc.expected_dispatches_max !== undefined) {
      dispTotal++; if (r.dispatch_ok) dispOk++;
    }
    if (tc.feature_flags) {
      degradeTotal++; if (r.passed) degradeOk++;
    }
  }

  const avg = results.length ? (totalDur / results.length).toFixed(1) : 0;
  const pct = (a, b) => b ? (a / b * 100).toFixed(1) + '%' : 'N/A';

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  端到端正确率:       ${passed}/${results.length} (${pct(passed, results.length)})`);
  console.log(`  规则匹配准确率:     ${rulesOk}/${rulesTotal} (${pct(rulesOk, rulesTotal)})`);
  console.log(`  熔断有效率:         ${cbOk}/${cbTotal} (${pct(cbOk, cbTotal)})`);
  console.log(`  降级正确率:         ${degradeOk}/${degradeTotal} (${pct(degradeOk, degradeTotal)})`);
  console.log(`  平均延迟:           ${avg}ms`);
  console.log(`${'═'.repeat(60)}\n`);

  // Write report
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const reportPath = path.join(REPORT_DIR, 'day1-pipeline-benchmark.md');

  const byD = { easy: [0, 0], medium: [0, 0], hard: [0, 0] };
  for (const r of results) { const d = r.difficulty || 'easy'; r.passed ? byD[d][0]++ : byD[d][1]++; }

  let md = `# L3 Pipeline E2E Benchmark Report

**Date:** ${new Date().toISOString().split('T')[0]}  
**Cases:** ${results.length} | **Passed:** ${passed} | **Failed:** ${failed}

## Summary Metrics

| Metric | Result |
|--------|--------|
| 端到端正确率 | ${passed}/${results.length} (${pct(passed, results.length)}) |
| 规则匹配准确率 | ${rulesOk}/${rulesTotal} (${pct(rulesOk, rulesTotal)}) |
| 熔断有效率 | ${cbOk}/${cbTotal} (${pct(cbOk, cbTotal)}) |
| 降级正确率 | ${degradeOk}/${degradeTotal} (${pct(degradeOk, degradeTotal)}) |
| 平均延迟 | ${avg}ms |

## By Difficulty

| Difficulty | Passed | Failed | Rate |
|------------|--------|--------|------|
${Object.entries(byD).map(([d, [p, f]]) => `| ${d} | ${p} | ${f} | ${pct(p, p + f)} |`).join('\n')}

## Failed Cases

`;
  const failedCases = results.filter(r => !r.passed);
  if (!failedCases.length) md += '_All cases passed!_ 🎉\n';
  else for (const r of failedCases) {
    md += `- **${r.id}**: ${r.failures.join('; ')}`;
    if (r.actual) md += ` (actual: rules=${r.actual.rules}, breaks=${r.actual.breaks}, dispatches=${r.actual.dispatches})`;
    md += '\n';
  }

  md += `\n## All Cases\n\n| ID | Diff | Result | Duration | Scenario |\n|----|------|--------|----------|----------|\n`;
  for (const r of results) {
    md += `| ${r.id} | ${r.difficulty} | ${r.passed ? '✅' : '❌'} | ${r.duration_ms}ms | ${r.scenario.slice(0, 60)} |\n`;
  }

  fs.writeFileSync(reportPath, md);
  console.log(`Report → ${reportPath}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => { console.error(`Fatal: ${err.message}`); process.exit(1); });
