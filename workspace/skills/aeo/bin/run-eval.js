#!/usr/bin/env node
/**
 * AEO 端到端评测 Runner
 * 
 * 功能：读取评测集，对每条用例调用意图分类，对比预期结果，计算准确率，输出评测报告。
 * 用法：node skills/aeo/bin/run-eval.js [--limit N] [--dataset <path>]
 * 
 * 默认使用本地 intent-scanner 的正则降级路径进行分类。
 * 设置环境变量 USE_LLM=true 可启用 LLM 路径（需要配置 API Key）。
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ─── 路径常量 ───
const WORKSPACE = path.resolve(__dirname, '../../..');
const DEFAULT_DATASET = path.join(WORKSPACE, 'tests/benchmarks/intent/intent-benchmark-dataset.json');
const CONFIG_PATH = path.join(__dirname, '../config/aeo-config.json');
const REPORT_DIR = path.join(__dirname, '../reports');

// ─── 解析命令行参数 ───
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { limit: 0, dataset: DEFAULT_DATASET };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) opts.limit = parseInt(args[i + 1], 10);
    if (args[i] === '--dataset' && args[i + 1]) opts.dataset = path.resolve(args[i + 1]);
  }
  return opts;
}

// ─── 加载 IntentScanner（带降级） ───
function loadIntentScanner() {
  const scannerPath = path.join(WORKSPACE, 'infrastructure/intent-engine/intent-scanner.js');
  try {
    const IntentScanner = require(scannerPath);
    return new IntentScanner();
  } catch (err) {
    console.warn(`⚠️  无法加载 IntentScanner (${err.message})，使用内置 mock 分类器`);
    return null;
  }
}

// ─── 内置 Mock 意图分类器（基于正则规则，覆盖 IC1-IC5） ───
const MOCK_RULES = {
  // IC5: 复合意图（优先匹配，因为包含多个信号）
  IC5: [
    // 反馈+重定向：负面+方向调整
    /(?:太复杂|不行|太慢|方向错|进度太慢|做的不错但).+(?:换|先|应该|砍掉)/s,
    // 认可+扩展：正面+追加
    /(?:可以|不错|行).+(?:顺便|另外|对了|也|再)/s,
  ],
  // IC3: 战略/架构决策（含"你觉得"、"还是"、选择性问题）
  IC3: [
    /(?:你觉得|是不是应该|到底在哪|哪个合适|要不要|够不够|哪个先|怎么分配|最大的.*风险|如果只能选|全面转向|先做.*还是)/,
    /(?:赛道|差异化|战略|定位|终态架构|MVP)/,
    /(?:换个方向|换个思路)(?!.*(?:顺便|另外|对了))/,
  ],
  // IC2: 规则/流程触发
  IC2: [
    /(?:ISC|规则|合规|纠偏|架构评审|安全扫描|配置保护|发布.*环境)/,
    /(?:换成Kafka|拆成微服务|重构|新建.*技能|技能.*发布|技能.*上线|同步.*EvoMap)/,
    /(?:修改.*配置|端口改成|openclaw\.json)/,
    /(?:新增.*规则|修改.*规则)/,
    /(?:自动检查|我的问题.*不该|承认错误)/,
  ],
  // IC4: 隐含意图（简短、模糊回复）
  IC4: [
    /^(?:行[，,]?然后呢|嗯[，,]?接下来|可以[，,]?继续|知道了|哦|随便)$/,
    /^(?:好吧[，,]?就这样吧)$/,
    /^(?:嗯\.{3}先说别的|这个\.{3}我再想想)$/,
    /^你确定.*可以[？?]?$/,
    /^你说的对[，,]?但是/,
    /怎么还没好/,
    /今天能搞定/,
    /快一点/,
    /deadline.*不急/,
  ],
  // IC1: 情绪表达（兜底大类）
  IC1: [
    /(?:太棒|不错|搞定|厉害|完美|好多了|期待|非常同意|还行)/,
    /(?:垃圾|不能用|又错了|太差|重做|无语|受不了|杀不完)/,
    /(?:焦虑|放弃|累了|快放弃|搞了.*天|每次都要说)/,
    /(?:做的不行)/,
  ],
};

/**
 * Mock 分类器：基于正则匹配返回 IC 类别
 */
function mockClassify(input) {
  // 取最后一条 user 消息
  const messages = Array.isArray(input) ? input : [input];
  const lastUserMsg = messages.filter(m => m.role === 'user').pop();
  if (!lastUserMsg) return { ic: 'UNKNOWN', intents: [] };

  const text = lastUserMsg.content || '';

  // 按优先级匹配
  for (const [ic, patterns] of Object.entries(MOCK_RULES)) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        return { ic, intents: [] }; // mock 不返回细粒度意图
      }
    }
  }

  return { ic: 'UNKNOWN', intents: [] };
}

// ─── 使用 IntentScanner 分类 ───
async function scannerClassify(scanner, input) {
  try {
    const result = await scanner.scan(input);
    // IntentScanner 返回格式适配
    if (result && result.intents && result.intents.length > 0) {
      const topIntent = result.intents[0];
      // 从 intent name 推断 IC 类别
      const ic = topIntent.ic || inferICFromIntent(topIntent.name || '');
      return { ic, intents: result.intents.map(i => i.name || i) };
    }
    return { ic: 'UNKNOWN', intents: [] };
  } catch (err) {
    console.warn(`  ⚠️ IntentScanner 调用失败: ${err.message}，降级到 mock`);
    return mockClassify(input);
  }
}

function inferICFromIntent(intentName) {
  if (intentName.startsWith('user.emotion')) return 'IC1';
  if (intentName.startsWith('rule.trigger')) return 'IC2';
  if (intentName.startsWith('user.intent.strategic') || intentName.startsWith('user.intent.architecture') || intentName.startsWith('user.intent.resource')) return 'IC3';
  if (intentName.startsWith('user.intent.implicit')) return 'IC4';
  if (intentName.startsWith('user.intent.composite')) return 'IC5';
  return 'UNKNOWN';
}

// ─── 评测主逻辑 ───
async function runEvaluation() {
  const opts = parseArgs();

  console.log('╔══════════════════════════════════════════╗');
  console.log('║   AEO 意图分类 端到端评测 Runner         ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log();

  // 1. 加载配置
  let config;
  try {
    config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    console.log(`📋 已加载 AEO 配置: ${config.name} v${config.version}`);
  } catch (err) {
    console.warn(`⚠️  无法加载配置文件: ${err.message}，使用默认配置`);
    config = { name: 'AEO', version: 'unknown' };
  }

  // 2. 加载评测集
  let dataset;
  try {
    dataset = JSON.parse(fs.readFileSync(opts.dataset, 'utf8'));
    console.log(`📂 已加载评测集: ${path.basename(opts.dataset)}`);
    console.log(`   描述: ${dataset.description || '无'}`);
    console.log(`   样本总数: ${dataset.samples.length}`);
  } catch (err) {
    console.error(`❌ 无法加载评测集: ${err.message}`);
    process.exit(1);
  }

  // 3. 初始化分类器
  const scanner = loadIntentScanner();
  const useScanner = scanner && process.env.USE_LLM === 'true';
  const classifierName = useScanner ? 'IntentScanner (LLM)' : 'Mock 正则分类器';
  console.log(`🔧 分类器: ${classifierName}`);

  // 4. 确定评测范围
  let samples = dataset.samples;
  if (opts.limit > 0 && opts.limit < samples.length) {
    samples = samples.slice(0, opts.limit);
    console.log(`⚡ 限制评测数量: ${opts.limit} 条`);
  }
  console.log();
  console.log('─'.repeat(50));
  console.log('开始评测...');
  console.log('─'.repeat(50));

  // 5. 逐条评测
  const results = [];
  let correct = 0;
  let total = samples.length;

  // 按 IC 类别统计
  const icStats = {};

  for (const sample of samples) {
    const startTime = Date.now();

    // 调用分类器
    let prediction;
    if (useScanner) {
      prediction = await scannerClassify(scanner, sample.input);
    } else {
      prediction = mockClassify(sample.input);
    }

    const elapsed = Date.now() - startTime;
    const isCorrect = prediction.ic === sample.expected_ic;
    if (isCorrect) correct++;

    // 统计每个 IC 类别
    if (!icStats[sample.expected_ic]) {
      icStats[sample.expected_ic] = { total: 0, correct: 0 };
    }
    icStats[sample.expected_ic].total++;
    if (isCorrect) icStats[sample.expected_ic].correct++;

    // 记录结果
    const result = {
      id: sample.id,
      description: sample.description,
      difficulty: sample.difficulty,
      expected_ic: sample.expected_ic,
      predicted_ic: prediction.ic,
      correct: isCorrect,
      elapsed_ms: elapsed,
    };
    results.push(result);

    // 输出进度（错误用例详细显示）
    const icon = isCorrect ? '✅' : '❌';
    if (!isCorrect) {
      const userMsg = sample.input.filter(m => m.role === 'user').pop();
      console.log(`${icon} ${sample.id} | 期望: ${sample.expected_ic} | 预测: ${prediction.ic} | "${(userMsg?.content || '').slice(0, 30)}..." | ${sample.description}`);
    }
  }

  console.log();
  console.log('─'.repeat(50));

  // 6. 生成报告
  const accuracy = total > 0 ? (correct / total) : 0;
  const accuracyPct = (accuracy * 100).toFixed(1);

  // 按 IC 类别汇总
  const icSummary = {};
  for (const [ic, stats] of Object.entries(icStats)) {
    icSummary[ic] = {
      total: stats.total,
      correct: stats.correct,
      accuracy: stats.total > 0 ? parseFloat((stats.correct / stats.total * 100).toFixed(1)) : 0,
    };
  }

  // 按难度汇总
  const diffStats = {};
  for (const r of results) {
    if (!diffStats[r.difficulty]) diffStats[r.difficulty] = { total: 0, correct: 0 };
    diffStats[r.difficulty].total++;
    if (r.correct) diffStats[r.difficulty].correct++;
  }
  const diffSummary = {};
  for (const [diff, stats] of Object.entries(diffStats)) {
    diffSummary[diff] = {
      total: stats.total,
      correct: stats.correct,
      accuracy: stats.total > 0 ? parseFloat((stats.correct / stats.total * 100).toFixed(1)) : 0,
    };
  }

  const report = {
    meta: {
      评测时间: new Date().toISOString(),
      评测集: path.basename(opts.dataset),
      分类器: classifierName,
      样本总数: total,
      AEO版本: config.version || 'unknown',
    },
    总体结果: {
      正确数: correct,
      总数: total,
      准确率: `${accuracyPct}%`,
      准确率数值: accuracy,
    },
    按IC类别: icSummary,
    按难度: diffSummary,
    错误用例: results.filter(r => !r.correct),
    全部结果: results,
  };

  // 7. 输出结果摘要
  console.log('📊 评测结果摘要');
  console.log(`   总准确率: ${accuracyPct}% (${correct}/${total})`);
  console.log();
  console.log('   按 IC 类别:');
  for (const [ic, stats] of Object.entries(icSummary).sort()) {
    const bar = '█'.repeat(Math.round(stats.accuracy / 5)) + '░'.repeat(20 - Math.round(stats.accuracy / 5));
    console.log(`     ${ic}: ${bar} ${stats.accuracy}% (${stats.correct}/${stats.total})`);
  }
  console.log();
  console.log('   按难度:');
  for (const diff of ['easy', 'medium', 'hard']) {
    if (diffSummary[diff]) {
      const s = diffSummary[diff];
      console.log(`     ${diff}: ${s.accuracy}% (${s.correct}/${s.total})`);
    }
  }

  if (report.错误用例.length > 0) {
    console.log();
    console.log(`   ❌ 错误用例数: ${report.错误用例.length}`);
  }

  // 8. 保存报告
  try {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    const reportFile = path.join(REPORT_DIR, `eval-report-${Date.now()}.json`);
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), 'utf8');
    console.log();
    console.log(`💾 评测报告已保存: ${path.relative(WORKSPACE, reportFile)}`);
  } catch (err) {
    console.warn(`⚠️  保存报告失败: ${err.message}，输出到 stdout`);
    console.log(JSON.stringify(report, null, 2));
  }

  console.log();
  console.log('✅ 评测完成');

  return report;
}

// ─── 入口 ───
runEvaluation().catch(err => {
  console.error(`❌ 评测失败: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});
