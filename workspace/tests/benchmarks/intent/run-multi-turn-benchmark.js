#!/usr/bin/env node
/**
 * 多轮对话意图分类 Benchmark Runner
 * 
 * 输入：multi-turn-eval-dataset.json（多轮对话格式）
 * 对 target_turn 做意图分类
 * 输出：准确率 + 分类别表现 + 错误分析
 */

const fs = require('fs');
const path = require('path');

// ─── 配置 ───
const DATASET_PATH = path.join(__dirname, 'multi-turn-eval-dataset.json');
const REPORT_DIR = path.join(__dirname, '..', '..', '..', 'reports');

// ─── 意图分类器接口 ───
// 实际分类器应替换此函数，接收完整turns数组和target_turn_index
async function classifyIntent(turns, targetTurnIndex) {
  // 默认：调用本地意图分类pipeline
  // 尝试加载本地分类器
  const classifierPaths = [
    path.join(__dirname, '..', '..', '..', 'skills', 'aeo', 'intent-classifier.js'),
    path.join(__dirname, '..', '..', '..', 'scripts', 'intent-classifier.js'),
  ];

  for (const cp of classifierPaths) {
    if (fs.existsSync(cp)) {
      try {
        const classifier = require(cp);
        if (typeof classifier.classifyMultiTurn === 'function') {
          return await classifier.classifyMultiTurn(turns, targetTurnIndex);
        }
        if (typeof classifier.classify === 'function') {
          // 降级：把多轮拼成单轮context+input
          const context = turns.slice(0, targetTurnIndex).map(t => `${t.role}: ${t.content}`).join('\n');
          const input = turns[targetTurnIndex].content;
          return await classifier.classify(input, context);
        }
      } catch (e) {
        console.warn(`分类器加载失败 ${cp}: ${e.message}`);
      }
    }
  }

  // 无可用分类器时返回占位结果
  return {
    intent_class: 'UNKNOWN',
    confidence: 0,
    error: 'no_classifier_available'
  };
}

// ─── 主流程 ───
async function main() {
  // 加载数据集
  if (!fs.existsSync(DATASET_PATH)) {
    console.error(`❌ 数据集不存在: ${DATASET_PATH}`);
    process.exit(1);
  }

  const dataset = JSON.parse(fs.readFileSync(DATASET_PATH, 'utf-8'));
  const conversations = dataset.conversations;
  console.log(`📊 加载 ${conversations.length} 条多轮对话样本\n`);

  // 逐条分类
  const results = [];
  let correct = 0;
  let total = 0;
  const byClass = {}; // { IC3: { total, correct, errors: [] } }
  const byTag = {};   // { implicit: { total, correct } }
  const errors = [];

  for (const conv of conversations) {
    total++;
    const { id, turns, target_turn_index, expected_intent_class, expected_confidence, complexity_tags } = conv;

    process.stdout.write(`  [${id}] ${turns[target_turn_index].content.slice(0, 40)}... `);

    let prediction;
    try {
      prediction = await classifyIntent(turns, target_turn_index);
    } catch (e) {
      prediction = { intent_class: 'ERROR', confidence: 0, error: e.message };
    }

    const predicted = prediction.intent_class;
    const isCorrect = predicted === expected_intent_class;
    if (isCorrect) correct++;

    // 按类别统计
    if (!byClass[expected_intent_class]) {
      byClass[expected_intent_class] = { total: 0, correct: 0, errors: [] };
    }
    byClass[expected_intent_class].total++;
    if (isCorrect) {
      byClass[expected_intent_class].correct++;
    } else {
      byClass[expected_intent_class].errors.push({
        id,
        expected: expected_intent_class,
        predicted,
        target_text: turns[target_turn_index].content.slice(0, 80),
        turn_count: turns.length,
        tags: complexity_tags
      });
    }

    // 按标签统计
    for (const tag of (complexity_tags || [])) {
      if (!byTag[tag]) byTag[tag] = { total: 0, correct: 0 };
      byTag[tag].total++;
      if (isCorrect) byTag[tag].correct++;
    }

    const result = {
      id,
      expected: expected_intent_class,
      predicted,
      correct: isCorrect,
      confidence: prediction.confidence,
      turn_count: turns.length,
      tags: complexity_tags
    };
    results.push(result);

    if (!isCorrect) {
      errors.push(result);
    }

    console.log(isCorrect ? '✅' : `❌ (got ${predicted})`);
  }

  // ─── 汇总报告 ───
  console.log('\n' + '═'.repeat(60));
  console.log('📊 多轮对话意图分类 Benchmark 报告');
  console.log('═'.repeat(60));

  const accuracy = total > 0 ? (correct / total * 100).toFixed(1) : 0;
  console.log(`\n总体准确率: ${correct}/${total} = ${accuracy}%\n`);

  // 分类别表现
  console.log('── 分类别表现 ──');
  for (const cls of Object.keys(byClass).sort()) {
    const c = byClass[cls];
    const acc = c.total > 0 ? (c.correct / c.total * 100).toFixed(1) : 0;
    console.log(`  ${cls}: ${c.correct}/${c.total} = ${acc}%`);
  }

  // 分标签表现
  console.log('\n── 分标签表现 ──');
  for (const tag of Object.keys(byTag).sort()) {
    const t = byTag[tag];
    const acc = t.total > 0 ? (t.correct / t.total * 100).toFixed(1) : 0;
    console.log(`  ${tag}: ${t.correct}/${t.total} = ${acc}%`);
  }

  // 错误分析
  if (errors.length > 0) {
    console.log('\n── 错误分析 ──');
    for (const err of errors) {
      console.log(`  ${err.id}: expected=${err.expected} got=${err.predicted} turns=${err.turn_count} tags=[${(err.tags || []).join(',')}]`);
    }
  }

  // 多轮特有指标
  const multiTurnSamples = results.filter(r => r.turn_count > 2);
  const multiTurnCorrect = multiTurnSamples.filter(r => r.correct).length;
  const multiTurnAcc = multiTurnSamples.length > 0 ? (multiTurnCorrect / multiTurnSamples.length * 100).toFixed(1) : 0;
  console.log(`\n── 多轮深度分析 ──`);
  console.log(`  3轮以上样本: ${multiTurnCorrect}/${multiTurnSamples.length} = ${multiTurnAcc}%`);

  const avgTurns = results.reduce((s, r) => s + r.turn_count, 0) / results.length;
  console.log(`  平均轮数: ${avgTurns.toFixed(1)}`);

  // 写入报告文件
  if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });
  const reportPath = path.join(REPORT_DIR, `multi-turn-benchmark-${new Date().toISOString().slice(0, 10)}.json`);
  const report = {
    timestamp: new Date().toISOString(),
    dataset: DATASET_PATH,
    sample_count: total,
    accuracy: parseFloat(accuracy),
    by_class: Object.fromEntries(
      Object.entries(byClass).map(([k, v]) => [k, {
        total: v.total,
        correct: v.correct,
        accuracy: v.total > 0 ? parseFloat((v.correct / v.total * 100).toFixed(1)) : 0,
        errors: v.errors
      }])
    ),
    by_tag: Object.fromEntries(
      Object.entries(byTag).map(([k, v]) => [k, {
        total: v.total,
        correct: v.correct,
        accuracy: v.total > 0 ? parseFloat((v.correct / v.total * 100).toFixed(1)) : 0
      }])
    ),
    multi_turn_depth: {
      samples_3plus: multiTurnSamples.length,
      accuracy_3plus: parseFloat(multiTurnAcc),
      avg_turns: parseFloat(avgTurns.toFixed(1))
    },
    errors,
    results
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📄 报告已保存: ${reportPath}`);
}

main().catch(e => {
  console.error('❌ Benchmark失败:', e);
  process.exit(1);
});
