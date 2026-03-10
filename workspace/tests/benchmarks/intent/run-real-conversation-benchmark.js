#!/usr/bin/env node
/**
 * Real Conversation Benchmark Runner
 * 
 * Classifies 12 real conversation samples into IC1-IC5 categories.
 * Uses Claude Opus via OpenClaw's gateway proxy for top-tier intent classification.
 * 
 * Usage: node run-real-conversation-benchmark.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const SAMPLES_PATH = path.join(__dirname, 'real-conversation-samples.json');
const REPORT_PATH = path.join(__dirname, '../../../reports/real-conversation-benchmark.md');
const REGISTRY_PATH = path.join(__dirname, '../../../infrastructure/intent-engine/intent-registry.json');

// IC category definitions for the classification prompt
const IC_DEFINITIONS = `
## 意图分类体系 (IC1-IC5)

**IC1: 情绪意图** — 用户正/负向情绪表达（满意、不满、挫败等）。纯情绪宣泄，无具体任务指令。
  示例："这做的什么垃圾"、"太好了终于搞定"、"累了不想弄了"

**IC2: 规则触发意图** — 可直接映射到ISC规则trigger的确定性意图。明确的单一指令（创建/修改/删除/查询）。
  示例："新增一条规则禁止XX"、"把这个配置改成YY"、"帮我查一下ZZ的状态"

**IC3: 复杂意图（多轮上下文依赖）** — 需要前文上下文才能理解的意图。离开对话历史，单看这句话无法判断用户要什么。
  示例：引用之前讨论的架构原则、延续之前的设计方向讨论、对之前方案的追加约束

**IC4: 隐含意图** — 字面意思≠真实意图。用户表面在问问题/陈述事实，实际在教学、纠偏、暗示方向。
  示例：用苏格拉底式提问引导思考、通过反问暗示应该怎么做、表面承认问题实际要求系统性改变

**IC5: 多意图复合** — 单句/段包含2个以上独立意图，需拆分后分别处理。常见模式：纠正+教学+指令、反馈+方向调整+新需求。
  示例："文档结构有问题（纠正），一级目录不该超过5个（教学），你去整合一下（指令）"
`;

const SYSTEM_PROMPT = `你是一个精确的意图分类引擎。对用户的真实对话进行意图分类。

${IC_DEFINITIONS}

## 分类规则

1. **复合优先**：如果一句话同时包含纠正+教学+指令等多个独立意图，归IC5。
2. **隐含优先于显式**：如果用户表面在问问题但实际在教学/纠偏，归IC4而非IC2。
3. **上下文依赖判断**：如果必须依赖context才能理解input的含义，归IC3。
4. **IC5 vs IC3区分**：IC3是"需要上下文才能理解这一个意图"，IC5是"包含多个独立意图"。两者可共存时优先IC5。
5. **IC4 vs IC5区分**：IC4核心是"字面≠真意"，IC5核心是"多个意图并存"。如果既有隐含又有多意图，看哪个特征更突出。

## 输出格式

严格JSON：
{"predicted_class": "IC1-IC5", "confidence": 0.0-1.0, "reasoning": "一句话解释为什么选这个分类", "detected_intents": ["拆解出的每个意图"]}
`;

function buildUserPrompt(sample) {
  let prompt = `## 待分类文本\n\n**Input**: ${sample.input}\n\n`;
  if (sample.context) {
    prompt += `**Context**: ${sample.context}\n\n`;
  }
  if (sample.complexity_tags && sample.complexity_tags.length > 0) {
    prompt += `**Complexity tags (参考)**: ${sample.complexity_tags.join(', ')}\n\n`;
  }
  prompt += `请分类为IC1-IC5，输出JSON。`;
  return prompt;
}

// Gateway proxy call to Claude
async function callClaude(systemPrompt, userPrompt) {
  // Try OpenClaw gateway first, then direct Anthropic
  const gatewayUrl = process.env.OPENCLAW_GATEWAY_URL || 'http://127.0.0.1:4321';
  
  const body = JSON.stringify({
    model: 'claude-opus-4-6-thinking',
    max_tokens: 1024,
    messages: [
      { role: 'user', content: `${systemPrompt}\n\n---\n\n${userPrompt}` }
    ],
    temperature: 0.1
  });

  return new Promise((resolve, reject) => {
    const url = new URL(`${gatewayUrl}/v1/chat/completions`);
    const transport = url.protocol === 'https:' ? https : http;
    
    const req = transport.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 120000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          return reject(new Error(`API error ${res.statusCode}: ${data.slice(0, 300)}`));
        }
        try {
          const json = JSON.parse(data);
          const content = json.choices?.[0]?.message?.content || '';
          resolve(content);
        } catch (e) {
          reject(new Error(`Parse error: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(body);
    req.end();
  });
}

function parseResponse(raw) {
  if (!raw) return null;
  let cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  // Find JSON object
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) {
    cleaned = cleaned.slice(start, end + 1);
  }
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const dataset = JSON.parse(fs.readFileSync(SAMPLES_PATH, 'utf8'));
  const samples = dataset.samples;
  
  console.log(`🚀 Real Conversation Benchmark (Claude Opus)`);
  console.log(`   Samples: ${samples.length}\n`);

  const results = [];
  let correct = 0;
  const categoryStats = {};
  for (const ic of ['IC1','IC2','IC3','IC4','IC5']) {
    categoryStats[ic] = { tp: 0, fp: 0, fn: 0, total: 0 };
  }

  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    const expected = sample.expected_intent_class;
    const tag = `[${i+1}/${samples.length}]`;
    
    let predicted = null;
    let response = null;
    let parsed = null;
    let error = null;
    const start = Date.now();

    try {
      response = await callClaude(SYSTEM_PROMPT, buildUserPrompt(sample));
      parsed = parseResponse(response);
      if (parsed && parsed.predicted_class) {
        predicted = parsed.predicted_class;
      }
    } catch (e) {
      error = e.message;
    }

    const elapsed = Date.now() - start;
    const isCorrect = predicted === expected;
    if (isCorrect) correct++;

    // Stats
    if (categoryStats[expected]) categoryStats[expected].total++;
    if (isCorrect && categoryStats[expected]) categoryStats[expected].tp++;
    if (!isCorrect) {
      if (categoryStats[expected]) categoryStats[expected].fn++;
      if (predicted && categoryStats[predicted]) categoryStats[predicted].fp++;
    }

    const icon = isCorrect ? '✅' : '❌';
    console.log(`${tag} ${icon} expected=${expected} predicted=${predicted || 'NONE'} (${elapsed}ms)`);
    if (parsed?.reasoning) console.log(`     → ${parsed.reasoning}`);

    results.push({
      index: i + 1,
      input: sample.input.slice(0, 100),
      context: (sample.context || '').slice(0, 80),
      expected,
      predicted: predicted || 'NONE',
      correct: isCorrect,
      confidence: parsed?.confidence || 0,
      reasoning: parsed?.reasoning || error || 'N/A',
      detected_intents: parsed?.detected_intents || [],
      elapsed,
      complexity_tags: sample.complexity_tags || [],
      source: sample.source_file || ''
    });

    if (i < samples.length - 1) await sleep(500);
  }

  // Generate report
  const accuracy = (correct / samples.length * 100).toFixed(1);
  
  let md = `# 真实对话评测集 Benchmark 报告\n\n`;
  md += `**日期**: ${new Date().toISOString().slice(0, 19)}  \n`;
  md += `**模型**: Claude Opus (claude-opus-4-6-thinking)  \n`;
  md += `**样本数**: ${samples.length}  \n`;
  md += `**数据来源**: 真实用户对话记录提取  \n\n`;

  md += `## 📊 总体准确率\n\n`;
  md += `| 指标 | 值 |\n|------|----|\n`;
  md += `| **总准确率** | **${accuracy}%** (${correct}/${samples.length}) |\n`;
  md += `| 目标 (>80%) | ${parseFloat(accuracy) >= 80 ? '✅ 达标' : '❌ 未达标'} |\n\n`;

  md += `## 📈 按IC类别详细表现\n\n`;
  md += `| 类别 | Precision | Recall | F1 | 样本数 |\n`;
  md += `|------|-----------|--------|-----|--------|\n`;
  for (const ic of ['IC1','IC2','IC3','IC4','IC5']) {
    const s = categoryStats[ic];
    const precision = (s.tp + s.fp) > 0 ? (s.tp / (s.tp + s.fp) * 100).toFixed(1) : '-';
    const recall = s.total > 0 ? (s.tp / s.total * 100).toFixed(1) : '-';
    const p = parseFloat(precision) || 0;
    const r = parseFloat(recall) || 0;
    const f1 = (p + r) > 0 ? (2 * p * r / (p + r)).toFixed(1) : '-';
    md += `| ${ic} | ${precision}% | ${recall}% | ${f1}% | ${s.total} |\n`;
  }

  md += `\n## 🔍 逐条分析\n\n`;
  for (const r of results) {
    const icon = r.correct ? '✅' : '❌';
    md += `### ${icon} 样本 #${r.index}: expected=${r.expected} → predicted=${r.predicted}\n\n`;
    md += `- **输入**: ${r.input}...\n`;
    md += `- **上下文**: ${r.context}...\n`;
    md += `- **复杂度标签**: ${r.complexity_tags.join(', ')}\n`;
    md += `- **置信度**: ${r.confidence}\n`;
    md += `- **模型推理**: ${r.reasoning}\n`;
    md += `- **检测到的意图**: ${r.detected_intents.join(', ') || '-'}\n`;
    md += `- **耗时**: ${r.elapsed}ms\n\n`;
  }

  // Error analysis
  const errors = results.filter(r => !r.correct);
  md += `## ❌ 错误样本分析 (${errors.length}/${samples.length})\n\n`;
  if (errors.length === 0) {
    md += `🎉 全部分类正确！\n\n`;
  } else {
    for (const e of errors) {
      md += `### 样本 #${e.index}: ${e.expected} → ${e.predicted}\n\n`;
      md += `- **输入**: ${e.input}...\n`;
      md += `- **上下文**: ${e.context}...\n`;
      md += `- **模型推理**: ${e.reasoning}\n`;
      md += `- **误分类原因分析**:\n`;
      
      if (e.expected === 'IC5' && e.predicted === 'IC3') {
        md += `  - IC5（多意图复合）被误判为IC3（上下文依赖）：模型可能只识别了主意图，未拆解出多个独立意图\n`;
      } else if (e.expected === 'IC5' && e.predicted === 'IC4') {
        md += `  - IC5（多意图复合）被误判为IC4（隐含意图）：模型过度关注隐含特征，忽略了多意图并存\n`;
      } else if (e.expected === 'IC4' && e.predicted === 'IC3') {
        md += `  - IC4（隐含意图）被误判为IC3（上下文依赖）：两者确实有重叠——隐含意图常需上下文才能解读\n`;
      } else if (e.expected === 'IC3' && e.predicted === 'IC5') {
        md += `  - IC3（上下文依赖）被误判为IC5（多意图）：模型过度拆分，将上下文关联的不同方面误认为独立意图\n`;
      } else {
        md += `  - ${e.expected}→${e.predicted}：分类边界模糊，需要更精细的定义或示例来区分\n`;
      }
      md += `\n`;
    }
  }

  md += `## 💡 改进建议\n\n`;
  md += `### 基于本轮评测结果\n\n`;
  
  // Dynamic suggestions based on results
  const ic3Recall = categoryStats.IC3.total > 0 ? categoryStats.IC3.tp / categoryStats.IC3.total : 1;
  const ic4Recall = categoryStats.IC4.total > 0 ? categoryStats.IC4.tp / categoryStats.IC4.total : 1;
  const ic5Recall = categoryStats.IC5.total > 0 ? categoryStats.IC5.tp / categoryStats.IC5.total : 1;
  
  if (ic5Recall < 0.8) {
    md += `1. **IC5（多意图复合）识别率偏低 (${(ic5Recall*100).toFixed(0)}%)**: 需要增加"纠正+教学+指令"复合模式的训练样本，强化多意图拆分能力\n`;
  }
  if (ic4Recall < 0.8) {
    md += `2. **IC4（隐含意图）识别率偏低 (${(ic4Recall*100).toFixed(0)}%)**: 隐含意图是最难的分类，建议增加苏格拉底式提问、反讽、暗示等样本\n`;
  }
  if (ic3Recall < 0.8) {
    md += `3. **IC3（上下文依赖）识别率偏低 (${(ic3Recall*100).toFixed(0)}%)**: IC3与IC5边界模糊，建议在prompt中增加对比示例\n`;
  }
  
  md += `\n### 通用改进方向\n\n`;
  md += `1. **扩大评测集规模**: 12条样本统计意义有限，建议扩展到50+条覆盖更多边界case\n`;
  md += `2. **增加IC1/IC2样本**: 当前评测集偏重IC3-IC5，缺少简单意图的基线验证\n`;
  md += `3. **多模型对比**: 对比Claude Opus vs GLM-5 vs GPT-4o在相同评测集上的表现\n`;
  md += `4. **边界case专项**: IC3/IC4/IC5三者边界模糊，需要专门的边界case评测集\n`;
  md += `5. **上下文长度实验**: 测试context长度对IC3/IC4分类准确率的影响\n`;

  md += `\n---\n*Generated by run-real-conversation-benchmark.js*\n`;

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, md, 'utf8');

  console.log(`\n${'='.repeat(50)}`);
  console.log(`📊 Benchmark Complete: ${correct}/${samples.length} (${accuracy}%)`);
  console.log(`   Report: ${REPORT_PATH}`);
  console.log(`${'='.repeat(50)}`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
