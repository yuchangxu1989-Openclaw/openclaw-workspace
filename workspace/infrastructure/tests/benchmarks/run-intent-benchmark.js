/**
 * IntentScanner Benchmark Runner
 * Loads dataset, runs IntentScanner.scan() on each sample, computes metrics.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { IntentScanner } = require('../../intent-engine/intent-scanner');

const DATASET_PATH = path.join(__dirname, 'intent-benchmark-dataset.json');
const REPORT_PATH = path.join(__dirname, '../../../reports/day1-intent-benchmark.md');

// Force regex fallback by not providing API key
const scanner = new IntentScanner({ zhipuKey: null });

async function run() {
  const dataset = JSON.parse(fs.readFileSync(DATASET_PATH, 'utf8'));
  const samples = dataset.samples;
  
  const categories = ['IC1', 'IC2', 'IC3', 'IC4', 'IC5'];
  
  // Confusion matrix: actual (row) x predicted (col)
  // Extra col/row for "NONE" (no intent detected)
  const labels = [...categories, 'NONE'];
  const confusion = {};
  for (const a of labels) {
    confusion[a] = {};
    for (const p of labels) confusion[a][p] = 0;
  }

  // Per-category stats
  const stats = {};
  for (const c of categories) {
    stats[c] = { tp: 0, fp: 0, fn: 0, total: 0 };
  }

  // Per-difficulty
  const diffStats = { easy: { correct: 0, total: 0 }, medium: { correct: 0, total: 0 }, hard: { correct: 0, total: 0 } };

  let totalCorrect = 0;
  let totalSamples = 0;
  let totalTimeMs = 0;
  const details = [];

  for (const sample of samples) {
    const start = Date.now();
    const result = await scanner.scan(sample.input);
    const elapsed = Date.now() - start;
    totalTimeMs += elapsed;
    totalSamples++;

    // Determine predicted IC
    let predictedIC = 'NONE';
    if (result.intents && result.intents.length > 0) {
      // Map intent_id back to IC category
      const firstIntent = result.intents[0].intent_id;
      // Check if intent_id is directly an IC label (regex fallback returns IC1/IC2)
      if (categories.includes(firstIntent)) {
        predictedIC = firstIntent;
      } else {
        // Try to infer from intent_id pattern
        predictedIC = inferIC(firstIntent);
      }
    }

    const actualIC = sample.expected_ic;
    const isCorrect = predictedIC === actualIC;
    
    if (isCorrect) totalCorrect++;
    
    // Confusion matrix
    confusion[actualIC] = confusion[actualIC] || {};
    confusion[actualIC][predictedIC] = (confusion[actualIC][predictedIC] || 0) + 1;

    // Per-category
    if (stats[actualIC]) stats[actualIC].total++;
    if (isCorrect && stats[actualIC]) stats[actualIC].tp++;
    if (!isCorrect) {
      if (stats[actualIC]) stats[actualIC].fn++;
      if (predictedIC !== 'NONE' && stats[predictedIC]) stats[predictedIC].fp++;
    }

    // Per-difficulty
    const d = sample.difficulty;
    if (diffStats[d]) {
      diffStats[d].total++;
      if (isCorrect) diffStats[d].correct++;
    }

    details.push({
      id: sample.id,
      expected: actualIC,
      predicted: predictedIC,
      correct: isCorrect,
      difficulty: d,
      intents: result.intents?.map(i => i.intent_id) || [],
      method: result.method,
      elapsed
    });
  }

  // Generate report
  const report = generateReport({
    totalSamples, totalCorrect, totalTimeMs,
    categories, labels, confusion, stats, diffStats, details
  });

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, report, 'utf8');
  console.log(`Benchmark complete. ${totalCorrect}/${totalSamples} correct (${(totalCorrect/totalSamples*100).toFixed(1)}%)`);
  console.log(`Report: ${REPORT_PATH}`);
}

function inferIC(intentId) {
  if (intentId.startsWith('user.emotion')) return 'IC1';
  if (intentId.startsWith('rule.trigger')) return 'IC2';
  if (intentId.includes('strategic') || intentId.includes('architecture_decision') || intentId.includes('resource_allocation')) return 'IC3';
  if (intentId.includes('implicit')) return 'IC4';
  if (intentId.includes('composite')) return 'IC5';
  return 'NONE';
}

function generateReport({ totalSamples, totalCorrect, totalTimeMs, categories, labels, confusion, stats, diffStats, details }) {
  const accuracy = (totalCorrect / totalSamples * 100).toFixed(1);
  const avgTime = (totalTimeMs / totalSamples).toFixed(1);
  
  let md = `# IntentScanner Benchmark Report (Day 1 Baseline)\n\n`;
  md += `**Date**: 2026-03-05\n`;
  md += `**Method**: regex_fallback (no LLM key)\n`;
  md += `**Samples**: ${totalSamples}\n\n`;

  md += `## Summary\n\n`;
  md += `| Metric | Value |\n|--------|-------|\n`;
  md += `| Overall Accuracy | **${accuracy}%** (${totalCorrect}/${totalSamples}) |\n`;
  md += `| Avg Latency | ${avgTime}ms |\n`;
  md += `| Total Time | ${totalTimeMs}ms |\n\n`;

  md += `## Per-Category Precision / Recall\n\n`;
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
  md += `| Actual \\ Predicted | ${labels.join(' | ')} |\n`;
  md += `|${labels.map(() => '---').join('|')}|---|\n`;
  for (const a of labels) {
    const row = labels.map(p => (confusion[a] && confusion[a][p]) || 0);
    md += `| **${a}** | ${row.join(' | ')} |\n`;
  }

  md += `\n## Key Observations\n\n`;
  md += `1. **Regex fallback only covers IC1 and IC2** — IC3/IC4/IC5 have 0% recall by design\n`;
  md += `2. IC1 keywords (情绪词) have decent recall for obvious cases\n`;
  md += `3. IC2 keywords (规则/规范/ISC等) provide partial coverage\n`;
  md += `4. All hard/adversarial samples involving IC3-IC5 will fail in regex mode\n`;
  md += `5. This baseline establishes the floor; LLM mode should dramatically improve IC3-IC5\n`;

  md += `\n## Detailed Results\n\n`;
  md += `<details><summary>Click to expand all ${totalSamples} results</summary>\n\n`;
  md += `| ID | Expected | Predicted | ✓ | Difficulty | Detected Intents |\n`;
  md += `|----|----------|-----------|---|------------|------------------|\n`;
  for (const d of details) {
    const check = d.correct ? '✅' : '❌';
    md += `| ${d.id} | ${d.expected} | ${d.predicted} | ${check} | ${d.difficulty} | ${d.intents.join(', ') || '-'} |\n`;
  }
  md += `\n</details>\n`;

  return md;
}

run().catch(err => { console.error(err); process.exit(1); });
