#!/usr/bin/env node
/**
 * Claude API 多轮意图分类 Benchmark
 * 调用 claude-opus-4-6-thinking 对34条多轮对话做意图分类
 */

const fs = require('fs');
const path = require('path');

const API_URL = 'https://api.penguinsaichat.dpdns.org/v1/messages';
const API_KEY = 'sk-zGcFUDNZXL13QC69oJDup9qYK2Bf4lKbfW5RTXaP3tRuhy3A';
const MODEL = 'claude-opus-4-6-thinking';

const DATASET_PATH = path.join(__dirname, 'multi-turn-eval-dataset.json');
const REPORT_DIR = path.join(__dirname, '..', '..', '..', 'reports');

const SYSTEM_PROMPT = `你是意图分类专家。给你一段多轮对话，请判断最后一条用户消息的意图类别：
- IC1: 简单指令（直接明确的请求）
- IC2: 情绪态度（表达情绪、不满、认可等）
- IC3: 多轮上下文依赖（需要结合前几轮才能理解的意图）
- IC4: 隐含意图（表面说A实际要B，需要推理）
- IC5: 多意图复合（一句话包含多个意图）

只输出JSON，格式：{"class":"IC?","confidence":0.x,"reason":"简短理由"}
不要输出其他任何内容。`;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function classifyWithClaude(turns, targetIndex) {
  const conversationText = turns.map((t, i) => {
    const marker = i === targetIndex ? ' [TARGET - 请分类这条]' : '';
    return `${t.role === 'user' ? '用户' : '助手'}: ${t.content}${marker}`;
  }).join('\n\n');

  const body = {
    model: MODEL,
    max_tokens: 300,
    messages: [{ role: 'user', content: `以下是一段多轮对话，请分类标记为[TARGET]的用户消息的意图：\n\n${conversationText}` }],
    system: SYSTEM_PROMPT
  };

  const resp = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`API ${resp.status}: ${text.slice(0, 200)}`);
  }

  const data = await resp.json();
  let content = '';
  for (const block of data.content) {
    if (block.type === 'text') content += block.text;
  }

  // Parse JSON from response
  const jsonMatch = content.match(/\{[^}]+\}/);
  if (!jsonMatch) throw new Error(`No JSON in response: ${content.slice(0, 100)}`);
  
  const parsed = JSON.parse(jsonMatch[0]);
  return {
    intent_class: parsed.class,
    confidence: parsed.confidence,
    reason: parsed.reason
  };
}

async function main() {
  const dataset = JSON.parse(fs.readFileSync(DATASET_PATH, 'utf-8'));
  const conversations = dataset.conversations;
  console.log(`📊 加载 ${conversations.length} 条多轮对话样本\n`);

  const results = [];
  let correct = 0;
  const byClass = {};      // expected class -> { tp, fp, fn }
  const predByClass = {};   // predicted class -> count
  const errors = [];

  // Init all classes
  for (const cls of ['IC1','IC2','IC3','IC4','IC5']) {
    byClass[cls] = { tp: 0, fp: 0, fn: 0, total: 0 };
  }

  for (let i = 0; i < conversations.length; i++) {
    const conv = conversations[i];
    const { id, turns, target_turn_index, expected_intent_class, complexity_tags } = conv;
    const targetText = turns[target_turn_index].content.slice(0, 50);
    process.stdout.write(`  [${i+1}/${conversations.length}] ${id}: ${targetText}... `);

    let prediction;
    try {
      prediction = await classifyWithClaude(turns, target_turn_index);
    } catch (e) {
      console.log(`❌ ERROR: ${e.message}`);
      prediction = { intent_class: 'ERROR', confidence: 0, reason: e.message };
    }

    const predicted = prediction.intent_class;
    const expected = expected_intent_class;
    const isCorrect = predicted === expected;
    if (isCorrect) correct++;

    // Confusion matrix tracking
    if (byClass[expected]) byClass[expected].total++;
    if (isCorrect) {
      if (byClass[expected]) byClass[expected].tp++;
    } else {
      if (byClass[expected]) byClass[expected].fn++;
      if (byClass[predicted]) byClass[predicted].fp++;
      errors.push({
        id, expected, predicted,
        confidence: prediction.confidence,
        reason: prediction.reason,
        target_text: turns[target_turn_index].content,
        turn_count: turns.length,
        tags: complexity_tags
      });
    }

    results.push({ id, expected, predicted, correct: isCorrect, confidence: prediction.confidence, reason: prediction.reason, tags: complexity_tags, turn_count: turns.length });
    console.log(isCorrect ? '✅' : `❌ (expected ${expected}, got ${predicted})`);

    if (i < conversations.length - 1) await sleep(500);
  }

  // Compute metrics
  const total = conversations.length;
  const accuracy = (correct / total * 100).toFixed(1);

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`总体准确率: ${correct}/${total} = ${accuracy}%`);
  console.log(`${'═'.repeat(60)}\n`);

  // Per-class P/R/F1
  const classMetrics = {};
  for (const cls of ['IC1','IC2','IC3','IC4','IC5']) {
    const { tp, fp, fn, total: clsTotal } = byClass[cls];
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;
    classMetrics[cls] = { total: clsTotal, tp, fp, fn, precision: +precision.toFixed(3), recall: +recall.toFixed(3), f1: +f1.toFixed(3) };
    console.log(`  ${cls}: P=${precision.toFixed(3)} R=${recall.toFixed(3)} F1=${f1.toFixed(3)} (${clsTotal} samples, TP=${tp} FP=${fp} FN=${fn})`);
  }

  // Generate markdown report
  if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });
  
  let md = `# 多轮对话意图分类 Benchmark 报告\n\n`;
  md += `**日期**: 2026-03-06\n`;
  md += `**模型**: ${MODEL}\n`;
  md += `**数据集**: ${conversations.length} 条多轮对话（全部来自真实用户对话）\n\n`;
  
  md += `## 总体结果\n\n`;
  md += `| 指标 | 值 |\n|------|----|\n`;
  md += `| 总样本数 | ${total} |\n`;
  md += `| 正确数 | ${correct} |\n`;
  md += `| **准确率** | **${accuracy}%** |\n`;
  md += `| 错误数 | ${errors.length} |\n\n`;

  md += `## 分类别 Precision / Recall / F1\n\n`;
  md += `| 类别 | 样本数 | TP | FP | FN | Precision | Recall | F1 |\n`;
  md += `|------|--------|----|----|----|-----------|---------|---------|\n`;
  for (const cls of ['IC1','IC2','IC3','IC4','IC5']) {
    const m = classMetrics[cls];
    md += `| ${cls} | ${m.total} | ${m.tp} | ${m.fp} | ${m.fn} | ${m.precision} | ${m.recall} | ${m.f1} |\n`;
  }
  md += `\n`;

  // Error analysis
  if (errors.length > 0) {
    md += `## 错误样本分析（${errors.length} 条）\n\n`;
    for (const err of errors) {
      md += `### ${err.id}\n\n`;
      md += `- **期望**: ${err.expected} → **预测**: ${err.predicted}\n`;
      md += `- **置信度**: ${err.confidence}\n`;
      md += `- **模型理由**: ${err.reason}\n`;
      md += `- **轮数**: ${err.turn_count}\n`;
      md += `- **复杂度标签**: ${(err.tags||[]).join(', ')}\n`;
      md += `- **目标文本**: ${err.target_text}\n\n`;
      
      // Root cause analysis
      md += `**根因分析**: `;
      if (err.expected === 'IC5' && err.predicted === 'IC4') {
        md += `模型识别到了隐含意图但未捕捉到多意图复合特征，倾向于归类为单一隐含意图。`;
      } else if (err.expected === 'IC4' && err.predicted === 'IC5') {
        md += `模型过度拆分，将隐含意图的多个表达误判为独立意图。`;
      } else if (err.expected === 'IC4' && err.predicted === 'IC3') {
        md += `模型关注了上下文依赖性但忽略了隐含的深层意图。`;
      } else if (err.expected === 'IC5' && err.predicted === 'IC3') {
        md += `模型仅识别到上下文依赖，未能分解出复合意图结构。`;
      } else {
        md += `预测偏差 ${err.expected}→${err.predicted}，需进一步分析意图边界定义。`;
      }
      md += `\n\n`;
    }
  } else {
    md += `## 错误样本分析\n\n无错误样本，全部分类正确。\n\n`;
  }

  md += `## 数据集特征\n\n`;
  const avgTurns = (results.reduce((s,r) => s + r.turn_count, 0) / results.length).toFixed(1);
  md += `- 平均轮数: ${avgTurns}\n`;
  md += `- 3轮以上样本: ${results.filter(r => r.turn_count > 2).length}/${total}\n`;
  md += `- IC分布: ${['IC1','IC2','IC3','IC4','IC5'].map(c => `${c}=${byClass[c].total}`).join(', ')}\n\n`;

  md += `## 结论与改进方向\n\n`;
  md += `> 基于 ${MODEL} 的多轮意图分类评测，准确率 ${accuracy}%。\n\n`;
  if (errors.length > 0) {
    md += `主要错误模式：\n`;
    const errorPatterns = {};
    for (const e of errors) {
      const key = `${e.expected}→${e.predicted}`;
      errorPatterns[key] = (errorPatterns[key] || 0) + 1;
    }
    for (const [pattern, count] of Object.entries(errorPatterns).sort((a,b) => b[1]-a[1])) {
      md += `- ${pattern}: ${count} 次\n`;
    }
  }

  const reportPath = path.join(REPORT_DIR, 'multi-turn-benchmark-2026-03-06.md');
  fs.writeFileSync(reportPath, md);
  console.log(`\n📄 报告已保存: ${reportPath}`);

  // Also save raw JSON
  const jsonPath = path.join(REPORT_DIR, 'multi-turn-benchmark-2026-03-06.json');
  fs.writeFileSync(jsonPath, JSON.stringify({ timestamp: new Date().toISOString(), model: MODEL, accuracy: +accuracy, total, correct, classMetrics, errors, results }, null, 2));
  console.log(`📄 JSON数据: ${jsonPath}`);
}

main().catch(e => { console.error('❌', e); process.exit(1); });
