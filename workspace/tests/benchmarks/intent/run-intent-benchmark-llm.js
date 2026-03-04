/**
 * IntentScanner LLM Benchmark Runner (Day 2)
 * 
 * Runs the same 80-sample dataset through IntentScanner with LLM (GLM-5) mode enabled.
 * Compares results against the Day 1 regex baseline (23.8%).
 * 
 * Usage: node run-intent-benchmark-llm.js [--model glm-5|glm-4-flash-250414] [--delay 200]
 */
'use strict';

const fs = require('fs');
const path = require('path');

// ---- Config ----
const args = process.argv.slice(2);
const MODEL = args.includes('--model') ? args[args.indexOf('--model') + 1] : 'glm-5';
const DELAY_MS = args.includes('--delay') ? parseInt(args[args.indexOf('--delay') + 1]) : 200;

const DATASET_PATH = path.join(__dirname, 'intent-benchmark-dataset.json');
const REPORT_PATH = path.join(__dirname, '../../../reports/day2-intent-llm-benchmark.md');
const INTENT_ENGINE_PATH = path.join(__dirname, '../../intent-engine/intent-scanner.js');

// ---- Load IntentScanner ----
let IntentScanner;
try {
  IntentScanner = require(INTENT_ENGINE_PATH).IntentScanner;
} catch (e) {
  console.error(`Failed to load IntentScanner: ${e.message}`);
  process.exit(1);
}

// ---- Load secrets ----
function loadZhipuKey() {
  const secretsFile = '/root/.openclaw/.secrets/zhipu-keys.env';
  try {
    const content = fs.readFileSync(secretsFile, 'utf8');
    const match = content.match(/^ZHIPU_API_KEY=(.+)$/m);
    return match ? match[1].trim() : null;
  } catch (e) {
    return process.env.ZHIPU_API_KEY || null;
  }
}

// ---- Helpers ----
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Extract the top category (IC1-IC5) from LLM intent results.
 * Handles both specific intent IDs (user.emotion.positive → IC1) and direct category IDs.
 */
function extractCategory(intents, registry) {
  if (!intents || intents.length === 0) return 'NONE';

  // Build intent_id → category lookup from registry
  const intentToCategory = {};
  if (registry && registry.intents) {
    for (const intent of registry.intents) {
      intentToCategory[intent.id] = intent.category;
    }
  }

  // Sort by confidence descending
  const sorted = [...intents].sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
  const top = sorted[0];
  const intentId = top.intent_id || '';

  // Check direct category match (IC1, IC2, etc.)
  if (/^IC[1-5]$/.test(intentId)) return intentId;

  // Check if the LLM included a category field
  if (top.category && /^IC[1-5]$/.test(top.category)) return top.category;

  // Look up in registry
  if (intentToCategory[intentId]) return intentToCategory[intentId];

  // Fallback: try to infer from intent_id prefix
  if (intentId.startsWith('user.emotion.')) return 'IC1';
  if (intentId.startsWith('rule.trigger.')) return 'IC2';
  if (intentId.startsWith('user.intent.strategic_') || intentId.startsWith('user.intent.architecture_') || intentId.startsWith('user.intent.resource_')) return 'IC3';
  if (intentId.startsWith('user.intent.implicit_')) return 'IC4';
  if (intentId.startsWith('user.intent.composite.')) return 'IC5';

  return 'NONE';
}

// ---- Main ----
async function main() {
  const apiKey = loadZhipuKey();
  if (!apiKey) {
    console.error('No ZHIPU_API_KEY found. Cannot run LLM benchmark.');
    process.exit(1);
  }

  console.log(`🚀 Intent LLM Benchmark starting...`);
  console.log(`   Model: ${MODEL}`);
  console.log(`   Delay: ${DELAY_MS}ms between calls`);
  console.log(`   API Key: ${apiKey.slice(0, 8)}...${apiKey.slice(-4)}`);

  const dataset = JSON.parse(fs.readFileSync(DATASET_PATH, 'utf8'));
  const samples = dataset.samples;
  const registry = JSON.parse(fs.readFileSync(path.join(__dirname, '../../intent-engine/intent-registry.json'), 'utf8'));

  console.log(`   Samples: ${samples.length}\n`);

  const scanner = new IntentScanner({
    zhipuKey: apiKey,
    zhipuUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    zhipuModel: MODEL,
    timeout: 60000,
    logDir: path.join(__dirname, 'logs-benchmark')
  });

  // ---- Run benchmark ----
  const categories = ['IC1', 'IC2', 'IC3', 'IC4', 'IC5'];
  const labels = [...categories, 'NONE'];

  const confusion = {};
  for (const a of labels) { confusion[a] = {}; for (const p of labels) confusion[a][p] = 0; }
  const stats = {};
  for (const c of categories) stats[c] = { tp: 0, fp: 0, fn: 0, total: 0 };
  const diffStats = { easy: { correct: 0, total: 0 }, medium: { correct: 0, total: 0 }, hard: { correct: 0, total: 0 } };

  // Intent-level tracking
  const intentStats = { exact_match: 0, partial_match: 0, no_match: 0, total: 0 };

  let totalCorrect = 0, totalSamples = 0, totalTimeMs = 0;
  let apiErrors = 0;
  const details = [];

  for (let idx = 0; idx < samples.length; idx++) {
    const sample = samples[idx];
    const text = sample.input[0]?.content || '';
    const tag = `[${idx + 1}/${samples.length}] ${sample.id}`;

    const start = Date.now();
    let result;
    let error = null;

    try {
      result = await scanner.scan(sample.input.map(m => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp ? new Date(m.timestamp * 1000).toISOString() : undefined
      })));
    } catch (e) {
      error = e.message;
      apiErrors++;
      result = { intents: [], method: 'error', skipped: false };
    }

    const elapsed = Date.now() - start;
    totalTimeMs += elapsed;
    totalSamples++;

    // Extract predicted category
    const predictedIC = extractCategory(result.intents, registry);
    const actualIC = sample.expected_ic;
    const isCorrect = predictedIC === actualIC;
    if (isCorrect) totalCorrect++;

    // Confusion matrix
    confusion[actualIC] = confusion[actualIC] || {};
    confusion[actualIC][predictedIC] = (confusion[actualIC][predictedIC] || 0) + 1;

    // Per-category stats
    if (stats[actualIC]) stats[actualIC].total++;
    if (isCorrect && stats[actualIC]) stats[actualIC].tp++;
    if (!isCorrect) {
      if (stats[actualIC]) stats[actualIC].fn++;
      if (predictedIC !== 'NONE' && stats[predictedIC]) stats[predictedIC].fp++;
    }

    // Difficulty stats
    const d = sample.difficulty;
    if (diffStats[d]) { diffStats[d].total++; if (isCorrect) diffStats[d].correct++; }

    // Intent-level accuracy
    if (sample.expected_intents && sample.expected_intents.length > 0) {
      intentStats.total++;
      const predictedIntentIds = (result.intents || []).map(i => i.intent_id);
      const expectedIntentIds = sample.expected_intents;
      const exactMatch = expectedIntentIds.every(e => predictedIntentIds.includes(e)) &&
                         predictedIntentIds.every(p => expectedIntentIds.includes(p));
      const partialMatch = expectedIntentIds.some(e => predictedIntentIds.includes(e));
      if (exactMatch) intentStats.exact_match++;
      else if (partialMatch) intentStats.partial_match++;
      else intentStats.no_match++;
    }

    const predictedIntents = (result.intents || []).map(i => i.intent_id).join(', ') || '-';
    const icon = isCorrect ? '✅' : '❌';
    process.stdout.write(`${tag}: ${icon} expected=${actualIC} predicted=${predictedIC} (${elapsed}ms) [${predictedIntents}]\n`);

    details.push({
      id: sample.id, expected_ic: actualIC, predicted_ic: predictedIC,
      expected_intents: sample.expected_intents || [],
      predicted_intents: (result.intents || []).map(i => ({ id: i.intent_id, confidence: i.confidence })),
      correct: isCorrect, difficulty: d,
      method: result.method || 'unknown',
      elapsed, error,
      description: sample.description
    });

    // Rate limit delay
    if (idx < samples.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  // ---- Generate Report ----
  const accuracy = (totalCorrect / totalSamples * 100).toFixed(1);
  const avgTime = (totalTimeMs / totalSamples).toFixed(0);
  const intentExact = intentStats.total > 0 ? (intentStats.exact_match / intentStats.total * 100).toFixed(1) : 'N/A';

  // Load Day 1 baseline for comparison
  let day1Accuracy = '23.8';
  try {
    const day1 = fs.readFileSync(path.join(__dirname, '../../../reports/day1-intent-benchmark.md'), 'utf8');
    const m = day1.match(/Overall Accuracy \| \*\*(\d+\.\d+)%\*\*/);
    if (m) day1Accuracy = m[1];
  } catch (e) {}

  let md = `# Day 2: Intent LLM Benchmark Report\n\n`;
  md += `**Date**: ${new Date().toISOString().slice(0, 10)}  \n`;
  md += `**Model**: ${MODEL}  \n`;
  md += `**Method**: LLM (GLM-5 via Zhipu API)  \n`;
  md += `**Samples**: ${totalSamples}  \n`;
  md += `**API Errors**: ${apiErrors}  \n\n`;

  md += `## 🎯 Summary: Regex → LLM 对比\n\n`;
  md += `| Metric | Day 1 (Regex) | Day 2 (LLM) | Δ |\n`;
  md += `|--------|--------------|-------------|---|\n`;
  md += `| **Overall Accuracy** | ${day1Accuracy}% | **${accuracy}%** | +${(parseFloat(accuracy) - parseFloat(day1Accuracy)).toFixed(1)}pp |\n`;
  md += `| Avg Latency | <1ms | ${avgTime}ms | - |\n`;
  md += `| API Errors | 0 | ${apiErrors} | - |\n`;
  const target = parseFloat(accuracy) >= 80 ? '✅ 达标' : '❌ 未达标';
  md += `| Target (>80%) | ❌ | ${target} | - |\n\n`;

  md += `## Per-Category Precision / Recall / F1\n\n`;
  md += `| Category | Precision | Recall | F1 | Support |\n|----------|-----------|--------|----|---------|\n`;
  for (const c of categories) {
    const s = stats[c];
    const precision = (s.tp + s.fp) > 0 ? (s.tp / (s.tp + s.fp) * 100).toFixed(1) : 'N/A';
    const recall = s.total > 0 ? (s.tp / s.total * 100).toFixed(1) : 'N/A';
    const p = parseFloat(precision) || 0;
    const r = parseFloat(recall) || 0;
    const f1 = (p + r) > 0 ? (2 * p * r / (p + r)).toFixed(1) : 'N/A';
    md += `| ${c} | ${precision}% | ${recall}% | ${f1}% | ${s.total} |\n`;
  }

  md += `\n## Intent-Level Accuracy (for samples with expected_intents)\n\n`;
  md += `| Metric | Count | Rate |\n|--------|-------|------|\n`;
  md += `| Exact Match | ${intentStats.exact_match} | ${intentExact}% |\n`;
  md += `| Partial Match | ${intentStats.partial_match} | ${intentStats.total > 0 ? (intentStats.partial_match / intentStats.total * 100).toFixed(1) : 'N/A'}% |\n`;
  md += `| No Match | ${intentStats.no_match} | ${intentStats.total > 0 ? (intentStats.no_match / intentStats.total * 100).toFixed(1) : 'N/A'}% |\n`;
  md += `| Total (with expected intents) | ${intentStats.total} | - |\n`;

  md += `\n## Accuracy by Difficulty\n\n`;
  md += `| Difficulty | Accuracy | Correct/Total |\n|------------|----------|---------------|\n`;
  for (const [dif, s] of Object.entries(diffStats)) {
    const acc = s.total > 0 ? (s.correct / s.total * 100).toFixed(1) : 'N/A';
    md += `| ${dif} | ${acc}% | ${s.correct}/${s.total} |\n`;
  }

  md += `\n## Confusion Matrix\n\n`;
  md += `| Actual \\ Pred | ${labels.join(' | ')} |\n`;
  md += `|---${labels.map(() => '|---').join('')}|\n`;
  for (const a of labels) {
    const row = labels.map(p => (confusion[a] && confusion[a][p]) || 0);
    md += `| **${a}** | ${row.join(' | ')} |\n`;
  }

  // ---- Error Analysis ----
  const incorrectByCategory = {};
  for (const detail of details) {
    if (!detail.correct) {
      const key = `${detail.expected_ic}→${detail.predicted_ic}`;
      if (!incorrectByCategory[key]) incorrectByCategory[key] = [];
      incorrectByCategory[key].push(detail);
    }
  }

  md += `\n## Error Analysis\n\n`;
  if (Object.keys(incorrectByCategory).length === 0) {
    md += `No errors! Perfect classification.\n`;
  } else {
    for (const [key, items] of Object.entries(incorrectByCategory).sort((a, b) => b[1].length - a[1].length)) {
      md += `### ${key} (${items.length} errors)\n\n`;
      for (const item of items.slice(0, 5)) {
        const input = samples.find(s => s.id === item.id)?.input[0]?.content || '';
        md += `- **${item.id}** [${item.difficulty}]: "${input.slice(0, 80)}"\n`;
        md += `  → predicted: ${item.predicted_intents.map(i => `${i.id}(${i.confidence})`).join(', ') || 'none'}\n`;
        md += `  → description: ${item.description}\n`;
      }
      md += `\n`;
    }
  }

  md += `## Detailed Results\n\n`;
  md += `<details><summary>All ${totalSamples} results</summary>\n\n`;
  md += `| ID | Expected IC | Predicted IC | ✓ | Diff | Predicted Intents | Latency |\n`;
  md += `|----|------------|-------------|---|------|-------------------|---------|\n`;
  for (const det of details) {
    const check = det.correct ? '✅' : '❌';
    const intents = det.predicted_intents.map(i => `${i.id}(${i.confidence})`).join(', ') || '-';
    md += `| ${det.id} | ${det.expected_ic} | ${det.predicted_ic} | ${check} | ${det.difficulty} | ${intents} | ${det.elapsed}ms |\n`;
  }
  md += `\n</details>\n`;

  // Write report
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, md, 'utf8');

  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 LLM Benchmark Complete`);
  console.log(`   Overall: ${totalCorrect}/${totalSamples} (${accuracy}%)`);
  console.log(`   Regex baseline: ${day1Accuracy}%`);
  console.log(`   Improvement: +${(parseFloat(accuracy) - parseFloat(day1Accuracy)).toFixed(1)}pp`);
  console.log(`   Target (>80%): ${parseFloat(accuracy) >= 80 ? '✅ ACHIEVED' : '❌ NOT YET'}`);
  console.log(`   API Errors: ${apiErrors}`);
  console.log(`   Report: ${REPORT_PATH}`);
  console.log(`${'='.repeat(60)}`);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
