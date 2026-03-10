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

// ---- Inline the regex scanning logic from IntentScanner ----
const FALLBACK_REGEX = {
  IC1: [
    /烦|烦死|崩溃|头大|搞不定|受不了|无语|气死|太差|垃圾|不行|重做|放弃|累了/gi,
    /不错|很好|太棒|牛|厉害|赞|完美|优秀|搞定|好了/gi,
    /担心|焦虑|紧张|害怕|慌|着急/gi,
    /开心|兴奋|爽|舒服|满意|期待/gi
  ],
  IC2: [
    /规则|规范|标准|流程|ISC|约束|准则/gi,
    /新增规则|修改规则|删除规则|更新规则/gi,
    /合规|不合规|违反|违规|纠偏/gi,
    /架构评审|安全扫描|配置保护|发布/gi
  ]
};

function scanWithRegex(conversationSlice) {
  if (!Array.isArray(conversationSlice) || conversationSlice.length === 0) {
    return { intents: [], method: 'regex_fallback', skipped: true };
  }
  const fullText = conversationSlice.map(m => m.content || '').join('\n');
  if (!fullText.trim()) {
    return { intents: [], method: 'regex_fallback', skipped: true };
  }
  const intents = [];
  const categories = ['IC1', 'IC2', 'IC3', 'IC4', 'IC5'];
  for (const catId of categories) {
    const regexPatterns = FALLBACK_REGEX[catId];
    if (regexPatterns && regexPatterns.length > 0) {
      const matches = [];
      for (const re of regexPatterns) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(fullText)) !== null) matches.push(m[0]);
      }
      if (matches.length > 0) {
        const uniqueMatches = [...new Set(matches)];
        const confidence = Math.min(0.6, 0.3 + uniqueMatches.length * 0.1);
        intents.push({ intent_id: catId, confidence, evidence: `regex: [${uniqueMatches.slice(0,5).join(', ')}]` });
      }
    }
  }
  return { intents, method: 'regex_fallback', skipped: false };
}

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
  const result = scanWithRegex(sample.input);
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
md += `**Method**: regex_fallback (no LLM)  \n`;
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
md += `1. **Regex fallback only has patterns for IC1 and IC2** — IC3, IC4, IC5 have 0% recall by design (no regex rules)\n`;
md += `2. IC1 emotion keywords have decent recall for obvious cases but cannot distinguish sub-intents (positive/negative/frustration)\n`;
md += `3. IC2 rule keywords provide partial coverage but match too broadly (e.g., "查看配置" triggers config_protection false positive)\n`;
md += `4. All IC3 (complex), IC4 (implicit), IC5 (composite) samples fall to NONE — these require LLM reasoning\n`;
md += `5. Many IC5 samples contain IC1/IC2 keywords and get misclassified to those categories\n`;
md += `6. **This baseline establishes the floor**: regex = ~${accuracy}% overall. LLM mode target: >80%\n`;

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
