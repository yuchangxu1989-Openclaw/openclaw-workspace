#!/usr/bin/env node
/**
 * AEO 端到端意图分类评测 Runner
 * 
 * 读取所有评测集 → 调用 LLM 意图分类 → 对比预期 → 输出准确率报告
 * 
 * Usage: node run-e2e-eval.js [--dataset all|benchmark|real|multi-turn] [--dry-run]
 */
'use strict';

const fs = require('fs');
const path = require('path');


// ── Config ──
const API_URL = process.env.EVAL_API_URL || 'https://api.penguinsaichat.dpdns.org/v1/messages';
const API_KEY = process.env.EVAL_API_KEY || process.env.CLAUDE_API_KEY_MAIN || '';
const MODEL = process.env.EVAL_MODEL || 'claude-sonnet-4-20250514';
const PROMPT_PATH = path.join(__dirname, 'intent-classification-prompt.txt');
const REPORT_DIR = path.join(__dirname, '../../../reports');

const DRY_RUN = process.argv.includes('--dry-run');
const DATASET_ARG = (() => {
  const idx = process.argv.indexOf('--dataset');
  return idx >= 0 ? process.argv[idx + 1] : 'all';
})();

// ── Load classification prompt ──
const CLASSIFICATION_PROMPT = fs.readFileSync(PROMPT_PATH, 'utf8');

// ── Dataset loaders ──
function loadBenchmarkDataset() {
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'intent-benchmark-dataset.json'), 'utf8'));
  return raw.samples.map(s => ({
    id: s.id,
    source: 'benchmark',
    input: Array.isArray(s.input) ? s.input.map(m => m.content).join('\n') : s.input,
    context: s.description || '',
    expected_ic: s.expected_ic,
    difficulty: s.difficulty || 'unknown',
  }));
}

function loadRealConversationDataset() {
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'real-conversation-samples.json'), 'utf8'));
  return raw.samples.map(s => ({
    id: s.id,
    source: 'real-conversation',
    input: s.input,
    context: s.context || '',
    expected_ic: s.expected_intent_class,
    difficulty: 'real',
  }));
}

function loadMultiTurnDataset() {
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'multi-turn-eval-dataset.json'), 'utf8'));
  return raw.conversations.map(c => {
    // Use last user message as input, prior as context
    const msgs = c.messages || c.turns || [];
    const userMsgs = msgs.filter(m => m.role === 'user');
    const lastMsg = userMsgs[userMsgs.length - 1];
    const priorMsgs = msgs.slice(0, -1);
    return {
      id: c.id || c.conversation_id,
      source: 'multi-turn',
      input: lastMsg ? lastMsg.content : '',
      context: priorMsgs.map(m => `${m.role}: ${m.content}`).join('\n'),
      expected_ic: c.expected_ic || c.expected_intent_class || c.classification?.expected_ic,
      difficulty: c.difficulty || 'multi-turn',
    };
  }).filter(s => s.expected_ic); // only keep samples with expected labels
}


function loadC2GoldenDataset() {
  const goldenDir = path.join(__dirname, 'c2-golden');
  if (!fs.existsSync(goldenDir)) {
    console.warn('c2-golden 目录不存在，跳过');
    return [];
  }
  const files = fs.readdirSync(goldenDir).filter(f => f.startsWith('mined-') && f.endsWith('.json'));
  const all = [];
  for (const f of files) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(goldenDir, f), 'utf8'));
      const items = Array.isArray(raw) ? raw : [raw];
      for (const item of items) {
        all.push({
          id: item.id || `c2-golden-${all.length}`,
          source: 'c2-golden',
          input: item.input || '',
          context: item.context || '',
          expected_ic: item.expected_ic || item.category || 'C2',
          difficulty: item.difficulty || item.complexity || 'C2',
          expected_output: item.expected_output || '',
          category: item.category || '',
          root_cause: item.root_cause || '',
        });
      }
    } catch (e) {
      console.warn(`跳过 c2-golden/${f}: ${e.message}`);
    }
  }
  return all;
}

function loadAllDatasets() {
  const map = {
    benchmark: loadBenchmarkDataset,
    real: loadRealConversationDataset,
    'multi-turn': loadMultiTurnDataset,
    'c2-golden': loadC2GoldenDataset,
  };
  if (DATASET_ARG === 'all') {
    const allCases = [].concat(...Object.values(map).map(fn => { try { return fn(); } catch(e) { console.warn(`跳过: ${e.message}`); return []; } }));
    // ID去重
    const seen = new Set();
    return allCases.filter(s => {
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    });
  }
  return map[DATASET_ARG]();
}

// ── LLM Call (Anthropic Messages API) ──
async function callLLM(systemPrompt, userPrompt) {
  const body = JSON.stringify({
    model: MODEL,
    max_tokens: 512,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
    temperature: 0.0,
  });

  const resp = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body,
    signal: AbortSignal.timeout(60000),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`API ${resp.status}: ${text.slice(0, 200)}`);
  }

  const json = await resp.json();
  // Handle thinking models: find text content block
  const textBlock = json.content?.find(b => b.type === 'text');
  const content = textBlock?.text || json.content?.[0]?.text || '';
  return content;
}

function buildUserPrompt(sample) {
  let prompt = `## 待分类文本\n\n**Input**: ${sample.input}\n`;
  if (sample.context) prompt += `\n**Context**: ${sample.context}\n`;
  prompt += `\n请分类为IC1-IC5，严格输出JSON：{"predicted_class": "ICx", "confidence": 0.0-1.0, "reasoning": "..."}`;
  return prompt;
}

function parseResponse(text) {
  // Strip markdown code fences
  text = text.replace(/```json\s*/g, '').replace(/```\s*/g, '');
  // Extract JSON from response
  const jsonMatch = text.match(/\{[\s\S]*?"predicted_class"\s*:\s*"IC\d"[\s\S]*?\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch(e) {}
  }
  // Fallback: look for ICx pattern
  const icMatch = text.match(/IC[1-5]/);
  return { predicted_class: icMatch ? icMatch[0] : 'UNKNOWN', confidence: 0, reasoning: text.slice(0, 100) };
}

// ── Main ──
async function main() {
  console.log('=== AEO 端到端意图分类评测 ===');
  console.log(`模型: ${MODEL} | 数据集: ${DATASET_ARG} | DryRun: ${DRY_RUN}`);
  
  const samples = loadAllDatasets();
  console.log(`评测样本总数: ${samples.length}`);
  
  if (samples.length === 0) {
    console.error('无可用评测样本');
    process.exit(1);
  }

  const results = [];
  const startTime = Date.now();

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    process.stdout.write(`\r评测进度: ${i + 1}/${samples.length} (${s.id})`);
    
    let predicted;
    if (DRY_RUN) {
      predicted = { predicted_class: s.expected_ic, confidence: 1.0, reasoning: 'dry-run' };
    } else {
      try {
        const raw = await callLLM(CLASSIFICATION_PROMPT, buildUserPrompt(s));
        predicted = parseResponse(raw);
      } catch (e) {
        predicted = { predicted_class: 'ERROR', confidence: 0, reasoning: e.message };
      }
    }

    const correct = predicted.predicted_class === s.expected_ic;
    results.push({
      id: s.id,
      source: s.source,
      expected: s.expected_ic,
      predicted: predicted.predicted_class,
      correct,
      confidence: predicted.confidence,
      reasoning: predicted.reasoning,
      difficulty: s.difficulty,
      input_preview: s.input.slice(0, 60),
    });

    // Rate limit
    if (!DRY_RUN && i < samples.length - 1) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n评测完成，耗时 ${elapsed}s\n`);

  // ── 统计 ──
  const total = results.length;
  const correctCount = results.filter(r => r.correct).length;
  const errorCount = results.filter(r => r.predicted === 'ERROR').length;
  const accuracy = (correctCount / total * 100).toFixed(1);
  const badcases = results.filter(r => !r.correct && r.predicted !== 'ERROR');

  // Per-IC stats
  const icStats = {};
  for (const ic of ['IC1', 'IC2', 'IC3', 'IC4', 'IC5']) {
    const icSamples = results.filter(r => r.expected === ic);
    const icCorrect = icSamples.filter(r => r.correct).length;
    icStats[ic] = { total: icSamples.length, correct: icCorrect, accuracy: icSamples.length ? (icCorrect / icSamples.length * 100).toFixed(1) : 'N/A' };
  }

  // Per-source stats
  const sourceStats = {};
  for (const src of ['benchmark', 'real-conversation', 'multi-turn', 'c2-golden']) {
    const srcSamples = results.filter(r => r.source === src);
    const srcCorrect = srcSamples.filter(r => r.correct).length;
    sourceStats[src] = { total: srcSamples.length, correct: srcCorrect, accuracy: srcSamples.length ? (srcCorrect / srcSamples.length * 100).toFixed(1) : 'N/A' };
  }

  // ── 报告生成 ──
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const reportContent = `# AEO 意图分类评测基线报告

> 生成时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}
> 模型: ${MODEL}
> 数据集: ${DATASET_ARG}
> 耗时: ${elapsed}s

## 总体指标

| 指标 | 数值 |
|------|------|
| 总样本数 | ${total} |
| 正确数 | ${correctCount} |
| 错误数 | ${badcases.length} |
| 调用失败 | ${errorCount} |
| **准确率** | **${accuracy}%** |
| 覆盖率 | ${((total - errorCount) / total * 100).toFixed(1)}% |

## 按意图分类 (IC) 准确率

| IC类别 | 样本数 | 正确数 | 准确率 |
|--------|--------|--------|--------|
${Object.entries(icStats).map(([ic, s]) => `| ${ic} | ${s.total} | ${s.correct} | ${s.accuracy}% |`).join('\n')}

## 按数据来源准确率

| 来源 | 样本数 | 正确数 | 准确率 |
|------|--------|--------|--------|
${Object.entries(sourceStats).map(([src, s]) => `| ${src} | ${s.total} | ${s.correct} | ${s.accuracy}% |`).join('\n')}

## Badcase 详情 (${badcases.length} 例)

| ID | 来源 | 期望 | 预测 | 输入摘要 |
|----|------|------|------|----------|
${badcases.map(r => `| ${r.id} | ${r.source} | ${r.expected} | ${r.predicted} | ${r.input_preview} |`).join('\n')}

## 混淆矩阵

${(() => {
  const ics = ['IC1', 'IC2', 'IC3', 'IC4', 'IC5'];
  let m = '| 期望\\预测 | ' + ics.join(' | ') + ' | ERROR |\n';
  m += '|' + '------|'.repeat(ics.length + 2) + '\n';
  for (const exp of ics) {
    const row = [exp];
    for (const pred of ics) {
      row.push(String(results.filter(r => r.expected === exp && r.predicted === pred).length));
    }
    row.push(String(results.filter(r => r.expected === exp && r.predicted === 'ERROR').length));
    m += '| ' + row.join(' | ') + ' |\n';
  }
  return m;
})()}

## 评测方法说明

- **评测方式**: LLM-as-judge，使用 ${MODEL} 作为意图分类主基座
- **Prompt**: 使用 \`intent-classification-prompt.txt\` 中定义的分类体系
- **数据集**: 合并 benchmark(${sourceStats.benchmark?.total || 0}) + real-conversation(${sourceStats['real-conversation']?.total || 0}) + multi-turn(${sourceStats['multi-turn']?.total || 0}) + c2-golden(${sourceStats['c2-golden']?.total || 0})
- **评测脚本**: \`tests/benchmarks/intent/run-e2e-eval.js\`
`;

  // Write report
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const reportPath = path.join(REPORT_DIR, 'aeo-day2-eval-baseline.md');
  fs.writeFileSync(reportPath, reportContent);
  console.log(`报告已写入: ${reportPath}`);

  // Write raw results JSON
  const rawPath = path.join(REPORT_DIR, `aeo-eval-raw-${timestamp}.json`);
  fs.writeFileSync(rawPath, JSON.stringify({ meta: { model: MODEL, dataset: DATASET_ARG, timestamp, elapsed, total, correctCount, accuracy }, results }, null, 2));
  console.log(`原始数据: ${rawPath}`);

  // Console summary
  console.log(`\n=== 评测摘要 ===`);
  console.log(`准确率: ${accuracy}% (${correctCount}/${total})`);
  console.log(`Badcase: ${badcases.length} | Error: ${errorCount}`);
  for (const [ic, s] of Object.entries(icStats)) {
    console.log(`  ${ic}: ${s.accuracy}% (${s.correct}/${s.total})`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
