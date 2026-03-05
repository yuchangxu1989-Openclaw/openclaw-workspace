#!/usr/bin/env node
'use strict';

/**
 * run-benchmark.js — Day2 Benchmark Runner
 *
 * 用法:
 *   node scripts/run-benchmark.js [--json] [--no-llm] [--threshold=70]
 *
 * 选项:
 *   --json         以JSON格式输出结果（CI友好）
 *   --no-llm       禁用LLM fallback，只用regex（快速模式）
 *   --threshold=N  准确率阈值，低于此值exit 1（默认70）
 *
 * 退出码:
 *   0 = 准确率 >= threshold
 *   1 = 准确率 < threshold 或运行出错
 */

const fs = require('fs');
const path = require('path');

// --- Config ---
const BENCHMARK_PATH = path.resolve(__dirname, '../infrastructure/aeo/benchmark/day2-benchmark.json');
const ROUTER_PATH = path.resolve(__dirname, '../infrastructure/dispatcher/handlers/user-message-router.js');

const args = process.argv.slice(2);
const JSON_OUTPUT = args.includes('--json');
const NO_LLM = args.includes('--no-llm');
const thresholdArg = args.find(a => a.startsWith('--threshold='));
const THRESHOLD = thresholdArg ? parseInt(thresholdArg.split('=')[1]) : 70;

// --- Suppress router console noise in CI ---
if (JSON_OUTPUT) {
  const origLog = console.log;
  console.log = (...a) => {
    if (typeof a[0] === 'string' && a[0].startsWith('[UserMessageRouter]')) return;
    origLog(...a);
  };
}

// --- Load benchmark ---
function loadBenchmark() {
  if (!fs.existsSync(BENCHMARK_PATH)) {
    console.error('❌ Benchmark file not found:', BENCHMARK_PATH);
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(BENCHMARK_PATH, 'utf8'));
  return raw.cases;
}

// --- Load router ---
function loadRouter() {
  if (!fs.existsSync(ROUTER_PATH)) {
    console.error('❌ Router not found:', ROUTER_PATH);
    process.exit(1);
  }
  return require(ROUTER_PATH);
}

// --- Run single case ---
async function runCase(router, c) {
  const start = Date.now();
  let result;
  try {
    if (NO_LLM) {
      result = router.classifyIntentByRegex(c.input);
      result.source = 'regex_only';
    } else {
      result = await router.classifyIntent(c.input);
    }
  } catch (err) {
    result = { category: 'ERROR', name: 'error', confidence: 0, error: err.message };
  }
  const latencyMs = Date.now() - start;

  const actualIntent = result.category || 'IC0';
  const actualHandler = resolveHandler(actualIntent);

  const intentMatch = actualIntent === c.expected_intent;
  const handlerMatch = actualHandler === c.expected_action;

  return {
    id: c.id,
    input: c.input,
    expected_intent: c.expected_intent,
    actual_intent: actualIntent,
    expected_action: c.expected_action,
    actual_action: actualHandler,
    intent_match: intentMatch,
    handler_match: handlerMatch,
    pass: intentMatch && handlerMatch,
    difficulty: c.difficulty,
    tags: c.tags,
    latency_ms: latencyMs,
    confidence: result.confidence,
    source: result.source || 'unknown',
    known_confusion: c.known_confusion || null,
    error: result.error || null,
  };
}

const HANDLER_MAP = {
  IC0: 'cras-knowledge-handler',
  IC1: 'cras-feedback-handler',
  IC2: 'dev-task-handler',
  IC3: 'cras-knowledge-handler',
  IC4: 'dev-task-handler',
  IC5: 'analysis-handler',
};

function resolveHandler(category) {
  return HANDLER_MAP[category] || 'cras-knowledge-handler';
}

// --- Confusion matrix ---
function buildConfusionMatrix(results) {
  const categories = ['IC0', 'IC1', 'IC2', 'IC3', 'IC4', 'IC5'];
  const matrix = {};
  for (const exp of categories) {
    matrix[exp] = {};
    for (const act of categories) matrix[exp][act] = 0;
    matrix[exp]['OTHER'] = 0;
  }
  for (const r of results) {
    const exp = r.expected_intent;
    const act = categories.includes(r.actual_intent) ? r.actual_intent : 'OTHER';
    if (!matrix[exp]) matrix[exp] = {};
    matrix[exp][act] = (matrix[exp][act] || 0) + 1;
  }
  return matrix;
}

// --- Per-category stats ---
function buildCategoryStats(results) {
  const stats = {};
  for (const r of results) {
    if (!stats[r.expected_intent]) stats[r.expected_intent] = { total: 0, correct: 0, cases: [] };
    stats[r.expected_intent].total++;
    if (r.intent_match) stats[r.expected_intent].correct++;
    stats[r.expected_intent].cases.push(r.id);
  }
  for (const [cat, s] of Object.entries(stats)) {
    s.accuracy = s.total > 0 ? ((s.correct / s.total) * 100).toFixed(1) + '%' : 'N/A';
  }
  return stats;
}

// --- Print helpers ---
function printSeparator(char = '─', width = 80) {
  console.log(char.repeat(width));
}

function printTable(headers, rows) {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map(r => String(r[i] || '').length)));
  const line = headers.map((h, i) => h.padEnd(widths[i])).join('  ');
  console.log(line);
  console.log(widths.map(w => '─'.repeat(w)).join('  '));
  for (const row of rows) {
    console.log(row.map((c, i) => String(c || '').padEnd(widths[i])).join('  '));
  }
}

// --- Main ---
async function main() {
  const cases = loadBenchmark();
  const router = loadRouter();

  if (!JSON_OUTPUT) {
    console.log('\n🏃 Day2 Benchmark Runner v1.0');
    console.log(`📋 ${cases.length} cases | threshold: ${THRESHOLD}% | mode: ${NO_LLM ? 'regex-only' : 'regex+LLM'}`);
    printSeparator();
  }

  // Run all cases
  const results = [];
  for (const c of cases) {
    if (!JSON_OUTPUT) process.stdout.write(`  ${c.id} (${c.difficulty}) ...`);
    const r = await runCase(router, c);
    results.push(r);
    if (!JSON_OUTPUT) {
      const icon = r.pass ? '✅' : (r.intent_match ? '⚠️' : '❌');
      console.log(` ${icon} intent:${r.actual_intent}(exp:${r.expected_intent}) handler:${r.handler_match ? 'OK' : 'FAIL'} ${r.latency_ms}ms`);
    }
  }

  // Compute metrics
  const total = results.length;
  const intentPass = results.filter(r => r.intent_match).length;
  const handlerPass = results.filter(r => r.handler_match).length;
  const fullPass = results.filter(r => r.pass).length;
  const intentAccuracy = (intentPass / total * 100).toFixed(1);
  const handlerAccuracy = (handlerPass / total * 100).toFixed(1);
  const fullAccuracy = (fullPass / total * 100).toFixed(1);

  const byDifficulty = {};
  for (const r of results) {
    if (!byDifficulty[r.difficulty]) byDifficulty[r.difficulty] = { total: 0, pass: 0 };
    byDifficulty[r.difficulty].total++;
    if (r.pass) byDifficulty[r.difficulty].pass++;
  }

  const confusionMatrix = buildConfusionMatrix(results);
  const categoryStats = buildCategoryStats(results);
  const failures = results.filter(r => !r.pass);
  const avgLatency = (results.reduce((s, r) => s + r.latency_ms, 0) / total).toFixed(0);

  const passed = parseFloat(fullAccuracy) >= THRESHOLD;

  if (JSON_OUTPUT) {
    console.log(JSON.stringify({
      summary: {
        total, intent_accuracy: parseFloat(intentAccuracy), handler_accuracy: parseFloat(handlerAccuracy),
        full_accuracy: parseFloat(fullAccuracy), threshold: THRESHOLD, passed, avg_latency_ms: parseInt(avgLatency),
      },
      by_difficulty: byDifficulty,
      category_stats: categoryStats,
      confusion_matrix: confusionMatrix,
      failures: failures.map(r => ({ id: r.id, input: r.input.slice(0, 60), expected_intent: r.expected_intent, actual_intent: r.actual_intent, expected_action: r.expected_action, actual_action: r.actual_action, tags: r.tags, known_confusion: r.known_confusion })),
      all_results: results,
    }, null, 2));
  } else {
    // Human-readable output
    printSeparator('═');
    console.log('📊 BENCHMARK RESULTS');
    printSeparator('═');

    console.log('\n🎯 Overall Accuracy');
    printTable(
      ['Metric', 'Correct', 'Total', 'Accuracy', 'Threshold', 'Status'],
      [
        ['Intent Classification', intentPass, total, intentAccuracy + '%', THRESHOLD + '%', intentPass / total * 100 >= THRESHOLD ? '✅' : '❌'],
        ['Handler Routing', handlerPass, total, handlerAccuracy + '%', THRESHOLD + '%', handlerPass / total * 100 >= THRESHOLD ? '✅' : '❌'],
        ['Full Match (Intent+Handler)', fullPass, total, fullAccuracy + '%', THRESHOLD + '%', passed ? '✅ PASS' : '❌ FAIL'],
      ]
    );

    console.log('\n📈 Accuracy by Difficulty');
    printTable(
      ['Difficulty', 'Correct', 'Total', 'Accuracy'],
      Object.entries(byDifficulty).map(([d, s]) => [d, s.pass, s.total, (s.pass / s.total * 100).toFixed(1) + '%'])
    );

    console.log('\n📦 Accuracy by Intent Category');
    printTable(
      ['Category', 'Correct', 'Total', 'Accuracy'],
      Object.entries(categoryStats).map(([c, s]) => [c, s.correct, s.total, s.accuracy])
    );

    console.log('\n🔢 Confusion Matrix (Expected → Actual)');
    const cats = ['IC0', 'IC1', 'IC2', 'IC3', 'IC4', 'IC5'];
    const presentCats = cats.filter(c => Object.values(confusionMatrix).some(row => row[c] > 0) || confusionMatrix[c]);
    const header = ['Exp \\ Act', ...presentCats];
    const rows = presentCats.filter(c => confusionMatrix[c]).map(exp => [
      exp,
      ...presentCats.map(act => confusionMatrix[exp]?.[act] || 0)
    ]);
    printTable(header, rows);

    console.log('\n⏱️  Performance');
    console.log(`   Avg latency: ${avgLatency}ms | Mode: ${NO_LLM ? 'regex-only' : 'regex+LLM-fallback'}`);

    if (failures.length > 0) {
      console.log(`\n❌ Failures (${failures.length} cases)`);
      printSeparator();
      for (const r of failures) {
        console.log(`\n  ${r.id} [${r.difficulty}]`);
        console.log(`  Input:    "${r.input.slice(0, 70)}"`);
        console.log(`  Expected: intent=${r.expected_intent} → handler=${r.expected_action}`);
        console.log(`  Actual:   intent=${r.actual_intent} → handler=${r.actual_action}`);
        if (r.known_confusion) console.log(`  Note:     ${r.known_confusion}`);
        if (r.error) console.log(`  Error:    ${r.error}`);
      }
    } else {
      console.log('\n🎉 All cases passed!');
    }

    printSeparator('═');
    if (passed) {
      console.log(`✅ BENCHMARK PASSED — accuracy ${fullAccuracy}% >= threshold ${THRESHOLD}%`);
    } else {
      console.log(`❌ BENCHMARK FAILED — accuracy ${fullAccuracy}% < threshold ${THRESHOLD}%`);
      console.log(`   ${failures.length} case(s) failed. Fix intent router or update benchmark groundtruth.`);
    }
    printSeparator('═');
    console.log('');
  }

  process.exit(passed ? 0 : 1);
}

main().catch(err => {
  console.error('💥 Benchmark runner crashed:', err);
  process.exit(1);
});
