/**
 * IntentScanner Benchmark Runner
 * Loads dataset, runs IntentScanner.scan() on each sample, computes metrics.
 * Uses direct regex scanning to avoid dependency issues with EventBus.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const DATASET_PATH = path.join(__dirname, 'intent-benchmark-dataset.json');
const REPORT_PATH = path.join(__dirname, '../../../reports/day1-intent-benchmark.md');
const REGISTRY_PATH = path.join(__dirname, '../../intent-engine/intent-registry.json');

// ---- Benchmark logic ----

const dataset = JSON.parse(fs.readFileSync(DATASET_PATH, 'utf8'));
const samples = dataset.samples;
const categories = ['IC1', 'IC2', 'IC3', 'IC4', 'IC5'];
const labels = [...categories, 'NONE'];

const confusion = {};
for (const a of labels) { confusion[a] = {}; for (const p of labels) confusion[a][p] = 0; }
const stats = {};
for (const c of categories) stats[c] = { tp: 0, fp: 0, fn: 0, total: 0 };
const diffStats = { easy: { correct: 0, total: 0 }, medium: { correct: 0, total: 0 }, hard: { correct: 0, total: 0 } };

let totalCorrect = 0, totalSamples = 0, totalTimeMs = 0;
const details = [];

for (const sample of samples) {
  const start = Date.now();
  const result = { intents: [], method: "disabled_regex_removed", skipped: true };
  const elapsed = Date.now() - start;
  totalTimeMs += elapsed;
  totalSamples++;

  // Determine predicted IC: highest confidence intent, or NONE
  let predictedIC = 'NONE';
  if (result.intents && result.intents.length > 0) {
    // If multiple ICs matched, pick highest confidence
    result.intents.sort((a, b) => b.confidence - a.confidence);
    predictedIC = result.intents[0].intent_id;
  }

  const actualIC = sample.expected_ic;
  const isCorrect = predictedIC === actualIC;
  if (isCorrect) totalCorrect++;

  confusion[actualIC][predictedIC] = (confusion[actualIC][predictedIC] || 0) + 1;

  if (stats[actualIC]) stats[actualIC].total++;
  if (isCorrect && stats[actualIC]) stats[actualIC].tp++;
  if (!isCorrect) {
    if (stats[actualIC]) stats[actualIC].fn++;
    if (predictedIC !== 'NONE' && stats[predictedIC]) stats[predictedIC].fp++;
  }

  const d = sample.difficulty;
  if (diffStats[d]) { diffStats[d].total++; if (isCorrect) diffStats[d].correct++; }

  details.push({
    id: sample.id, expected: actualIC, predicted: predictedIC,
    correct: isCorrect, difficulty: d,
    intents: result.intents?.map(i => i.intent_id) || [],
    method: result.method, elapsed
  });
}

// ---- Generate Report ----
const accuracy = (totalCorrect / totalSamples * 100).toFixed(1);
const avgTime = (totalTimeMs / totalSamples).toFixed(2);

let md = `# IntentScanner Benchmark Report (Day 1 Baseline)\n\n`;
md += `**Date**: 2026-03-05  \n`;
md += `**Method**: regex baseline removed (no classifier)  \n`;
md += `**Samples**: ${totalSamples}  \n\n`;

md += `## Summary\n\n`;
md += `| Metric | Value |\n|--------|-------|\n`;
md += `| Overall Accuracy | **${accuracy}%** (${totalCorrect}/${totalSamples}) |\n`;
md += `| Avg Latency | ${avgTime}ms |\n`;
md += `| Total Time | ${totalTimeMs}ms |\n\n`;

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

md += `\n## Accuracy by Difficulty\n\n`;
md += `| Difficulty | Accuracy | Correct/Total |\n|------------|----------|---------------|\n`;
for (const [d, s] of Object.entries(diffStats)) {
  const acc = s.total > 0 ? (s.correct / s.total * 100).toFixed(1) : 'N/A';
  md += `| ${d} | ${acc}% | ${s.correct}/${s.total} |\n`;
}

md += `\n## Confusion Matrix\n\n`;
md += `| Actual \\ Pred | ${labels.join(' | ')} |\n`;
md += `|---${labels.map(() => '|---').join('')}|\n`;
for (const a of labels) {
  const row = labels.map(p => (confusion[a] && confusion[a][p]) || 0);
  md += `| **${a}** | ${row.join(' | ')} |\n`;
}

md += `\n## Key Observations\n\n`;
md += `1. Regex baseline code has been removed from benchmark runner\n`;
md += `2. Keep this runner as framework placeholder for future classifier integration\n`;
md += `3. Current output reflects disabled classification path\n`;
md += `4. Use run-intent-benchmark-llm.js for active model benchmark\n`;
md += `5. Dataset and report generation remain intact\n`;
md += `6. This file intentionally contains no regex intent logic\n`;

md += `\n## Detailed Results\n\n`;
md += `<details><summary>All ${totalSamples} results</summary>\n\n`;
md += `| ID | Expected | Predicted | ✓ | Diff | Intents |\n`;
md += `|----|----------|-----------|---|------|---------|\n`;
for (const d of details) {
  const check = d.correct ? '✅' : '❌';
  md += `| ${d.id} | ${d.expected} | ${d.predicted} | ${check} | ${d.difficulty} | ${d.intents.join(', ') || '-'} |\n`;
}
md += `\n</details>\n`;

fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, md, 'utf8');
console.log(`Benchmark complete: ${totalCorrect}/${totalSamples} correct (${accuracy}%)`);
console.log(`Report written to: ${REPORT_PATH}`);
