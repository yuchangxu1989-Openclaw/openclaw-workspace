#!/usr/bin/env node
/**
 * Claude API 多轮意图分类 Benchmark v2
 * 优化版：aligned IC definitions with production registry, IC4/IC5 boundary examples
 */

const fs = require('fs');
const path = require('path');

const API_URL = 'https://api.penguinsaichat.dpdns.org/v1/messages';
const API_KEY = 'sk-zGcFUDNZXL13QC69oJDup9qYK2Bf4lKbfW5RTXaP3tRuhy3A';
const MODEL = 'claude-opus-4-6-thinking';

const DATASET_PATH = path.join(__dirname, 'multi-turn-eval-dataset.json');
const PROMPT_PATH = path.join(__dirname, 'intent-classification-prompt.txt');
const REPORT_DIR = path.join(__dirname, '..', '..', '..', 'reports');

function loadSystemPrompt() {
  return fs.readFileSync(PROMPT_PATH, 'utf-8').trim();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function classifyWithClaude(systemPrompt, turns, targetIndex, retries = 2) {
  const conversationText = turns.map((t, i) => {
    const marker = i === targetIndex ? ' [TARGET - 请分类这条]' : '';
    return `${t.role === 'user' ? '用户' : '助手'}: ${t.content}${marker}`;
  }).join('\n\n');

  const body = {
    model: MODEL,
    max_tokens: 400,
    messages: [{ role: 'user', content: `以下是一段多轮对话，请分类标记为[TARGET]的用户消息的意图：\n\n${conversationText}` }],
    system: systemPrompt
  };

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
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
        if (attempt < retries && (resp.status >= 500 || resp.status === 429)) {
          console.log(`  ⏳ Retry ${attempt + 1} (HTTP ${resp.status})`);
          await sleep(2000 * (attempt + 1));
          continue;
        }
        throw new Error(`API ${resp.status}: ${text.slice(0, 200)}`);
      }

      const data = await resp.json();
      let content = '';
      for (const block of data.content) {
        if (block.type === 'text') content += block.text;
      }

      // Parse JSON from response
      const jsonMatch = content.match(/\{[^}]+\}/);
      if (!jsonMatch) throw new Error(`No JSON in response: ${content.slice(0, 200)}`);
      
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        intent_class: parsed.class,
        confidence: parsed.confidence,
        reason: parsed.reason
      };
    } catch (e) {
      if (attempt < retries) {
        console.log(`  ⏳ Retry ${attempt + 1}: ${e.message.slice(0, 80)}`);
        await sleep(2000 * (attempt + 1));
        continue;
      }
      throw e;
    }
  }
}

async function main() {
  const systemPrompt = loadSystemPrompt();
  console.log(`📋 System prompt loaded (${systemPrompt.length} chars)`);

  const dataset = JSON.parse(fs.readFileSync(DATASET_PATH, 'utf-8'));
  const conversations = dataset.conversations;
  console.log(`📊 加载 ${conversations.length} 条多轮对话样本\n`);

  const results = [];
  let correct = 0;
  const byClass = {};
  const errors = [];

  // Init all classes
  for (const cls of ['IC1','IC2','IC3','IC4','IC5']) {
    byClass[cls] = { tp: 0, fp: 0, fn: 0, total: 0 };
  }

  for (let i = 0; i < conversations.length; i++) {
    const conv = conversations[i];
    const { id, turns, target_turn_index, expected_ic, complexity_tags } = conv;
    const targetText = turns[target_turn_index].content.slice(0, 50);
    process.stdout.write(`  [${i+1}/${conversations.length}] ${id}: ${targetText}... `);

    let prediction;
    try {
      prediction = await classifyWithClaude(systemPrompt, turns, target_turn_index);
    } catch (e) {
      console.log(`❌ ERROR: ${e.message}`);
      prediction = { intent_class: 'ERROR', confidence: 0, reason: e.message };
    }

    const predicted = prediction.intent_class;
    const expected = expected_ic;
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

    results.push({
      id, expected, predicted,
      correct: isCorrect,
      confidence: prediction.confidence,
      reason: prediction.reason,
      tags: complexity_tags,
      turn_count: turns.length
    });
    console.log(isCorrect ? '✅' : `❌ (expected ${expected}, got ${predicted})`);

    if (i < conversations.length - 1) await sleep(600);
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
    if (clsTotal > 0 || fp > 0) {
      console.log(`  ${cls}: P=${precision.toFixed(3)} R=${recall.toFixed(3)} F1=${f1.toFixed(3)} (${clsTotal} samples, TP=${tp} FP=${fp} FN=${fn})`);
    }
  }

  // Generate markdown report
  if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });
  
  const now = new Date().toISOString().slice(0, 10);
  let md = `# 意图分类 Benchmark v2 报告\n\n`;
  md += `**日期**: ${now}\n`;
  md += `**模型**: ${MODEL}\n`;
  md += `**数据集**: ${conversations.length} 条多轮对话（全部来自真实用户对话）\n`;
  md += `**Prompt版本**: v2 (aligned with production registry, IC4/IC5 boundary examples)\n\n`;
  
  md += `## 总体结果\n\n`;
  md += `| 指标 | 值 |\n|------|----|\n`;
  md += `| 总样本数 | ${total} |\n`;
  md += `| 正确数 | ${correct} |\n`;
  md += `| **准确率** | **${accuracy}%** |\n`;
  md += `| 错误数 | ${errors.length} |\n`;
  md += `| 目标 | ≥90% |\n`;
  md += `| ${+accuracy >= 90 ? '✅ 达标' : '❌ 未达标'} | |\n\n`;

  md += `## 分类别 Precision / Recall / F1\n\n`;
  md += `| 类别 | 样本数 | TP | FP | FN | Precision | Recall | F1 |\n`;
  md += `|------|--------|----|----|----|-----------|---------|---------|\n`;
  for (const cls of ['IC1','IC2','IC3','IC4','IC5']) {
    const m = classMetrics[cls];
    if (m.total > 0 || m.fp > 0) {
      md += `| ${cls} | ${m.total} | ${m.tp} | ${m.fp} | ${m.fn} | ${m.precision} | ${m.recall} | ${m.f1} |\n`;
    }
  }
  md += `\n`;

  // Improvement comparison
  md += `## 与 v1 对比\n\n`;
  md += `| 指标 | v1 (旧prompt) | v2 (优化后) | 变化 |\n`;
  md += `|------|-------------|-------------|------|\n`;
  md += `| 准确率 | 67.6% (23/34) | ${accuracy}% (${correct}/${total}) | ${(+accuracy - 67.6).toFixed(1)}pp |\n`;
  md += `| 错误数 | 11 | ${errors.length} | ${errors.length - 11 > 0 ? '+' : ''}${errors.length - 11} |\n`;
  md += `| 数据集大小 | 34 | ${total} | +${total - 34} |\n\n`;

  md += `### v2 主要优化\n\n`;
  md += `1. **IC1-IC3定义对齐生产环境**：IC1从"简单指令"改为"情绪意图"，消除IC5→IC1误分类\n`;
  md += `2. **IC4/IC5边界精确化**：加入"教道理vs任务单"决策法和独立性测试\n`;
  md += `3. **Few-shot examples**：覆盖IC4/IC5的6种典型模式\n`;
  md += `4. **反问句速判规则**：反问单独出现→IC4，反问+独立指令→IC5\n\n`;

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
      if (err.expected === 'IC4' && err.predicted === 'IC5') {
        md += `模型过度拆分——将教学/纠偏目的下的多个陈述误判为独立意图。需强化"教道理vs任务单"决策法。`;
      } else if (err.expected === 'IC5' && err.predicted === 'IC4') {
        md += `模型过度归一——将独立可执行的多个意图误归为单一隐含意图。需强化独立性测试。`;
      } else if (err.expected === 'IC5' && err.predicted === 'IC1') {
        md += `模型降级——将多意图复合消息误判为单一情绪表达或简单指令。`;
      } else if (err.expected === 'IC4' && err.predicted === 'IC3') {
        md += `模型聚焦上下文依赖性但忽略了隐含的教学/Socratic目的。`;
      } else {
        md += `预测偏差 ${err.expected}→${err.predicted}，需针对性分析。`;
      }
      md += `\n\n`;
    }

    // Error pattern summary
    md += `### 错误模式汇总\n\n`;
    const errorPatterns = {};
    for (const e of errors) {
      const key = `${e.expected}→${e.predicted}`;
      errorPatterns[key] = (errorPatterns[key] || 0) + 1;
    }
    for (const [pattern, count] of Object.entries(errorPatterns).sort((a,b) => b[1]-a[1])) {
      md += `- ${pattern}: ${count} 次\n`;
    }
    md += `\n`;
  } else {
    md += `## 错误样本分析\n\n🎯 无错误样本，全部分类正确！\n\n`;
  }

  md += `## 数据集特征\n\n`;
  const avgTurns = (results.reduce((s,r) => s + r.turn_count, 0) / results.length).toFixed(1);
  md += `- 平均轮数: ${avgTurns}\n`;
  md += `- 3轮以上样本: ${results.filter(r => r.turn_count > 2).length}/${total}\n`;
  md += `- IC分布: ${['IC1','IC2','IC3','IC4','IC5'].map(c => `${c}=${byClass[c].total}`).join(', ')}\n\n`;

  // Full results table
  md += `## 完整结果\n\n`;
  md += `| ID | 期望 | 预测 | 正确 | 置信度 |\n`;
  md += `|----|------|------|------|--------|\n`;
  for (const r of results) {
    md += `| ${r.id} | ${r.expected} | ${r.predicted} | ${r.correct ? '✅' : '❌'} | ${r.confidence} |\n`;
  }
  md += `\n`;

  const reportPath = path.join(REPORT_DIR, 'intent-benchmark-90-target-2026-03-06.md');
  fs.writeFileSync(reportPath, md);
  console.log(`\n📄 报告已保存: ${reportPath}`);

  // Save raw JSON
  const jsonData = {
    timestamp: new Date().toISOString(),
    model: MODEL,
    prompt_version: 'v2',
    accuracy: +accuracy,
    total,
    correct,
    classMetrics,
    errors,
    results
  };
  const jsonPath = path.join(REPORT_DIR, 'intent-benchmark-90-target-2026-03-06.json');
  fs.writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2));
  console.log(`📄 JSON数据: ${jsonPath}`);
}

main().catch(e => { console.error('❌', e); process.exit(1); });
