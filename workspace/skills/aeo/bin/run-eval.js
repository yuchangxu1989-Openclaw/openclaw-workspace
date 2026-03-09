#!/usr/bin/env node
/**
 * AEO 端到端评测 Runner
 *
 * 功能：读取评测集，对每条用例调用意图分类，对比预期结果，计算准确率，输出评测报告。
 * 用法：node skills/aeo/bin/run-eval.js [--limit N] [--dataset <path>] [--batch-size N]
 *
 * 默认使用本地 intent-scanner 的正则降级路径进行分类。
 * 设置环境变量 USE_LLM=true 可启用 LLM 路径（需要配置 API Key）。
 *
 * 铁律：评测批次默认10条/批，用户铁令2026-03-09
 * ISC规则：rule.eval-batch-size-limit-001
 */

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

// ─── 路径常量 ───
const WORKSPACE = path.resolve(__dirname, '../../..');

// 加载智谱API Key
if (!process.env.ZHIPU_API_KEY) {
  try {
    const envContent = require('fs').readFileSync('/root/.openclaw/.secrets/zhipu-keys.env', 'utf8');
    const match = envContent.match(/ZHIPU_API_KEY_1="([^"]+)"/);
    if (match) process.env.ZHIPU_API_KEY = match[1];
  } catch {}
}
const DEFAULT_DATASET = path.join(WORKSPACE, 'tests/benchmarks/intent/intent-benchmark-dataset.json');
const CONFIG_PATH = path.join(__dirname, '../config/aeo-config.json');
const REPORT_DIR = path.join(__dirname, '../reports');
const OPENCLAW_CONFIG_PATH = '/root/.openclaw/openclaw.json';

// ─── 解析命令行参数 ───
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { limit: 0, dataset: DEFAULT_DATASET, batchSize: 10, classifier: '' }; // 铁律：默认10条/批
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
    case '--limit':
      if (args[i + 1]) opts.limit = parseInt(args[++i], 10);
      break;
    case '--dataset':
      if (args[i + 1]) opts.dataset = path.resolve(args[++i]);
      break;
    case '--batch-size':
      if (args[i + 1]) opts.batchSize = parseInt(args[++i], 10);
      break;
    case '--classifier':
      opts.classifier = args[++i];
      break;
    default:
      break;
    }
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

// ─── GLM-5 LLM 分类器 ───
const C2_CATEGORIES = ['纠偏类', '自主性缺失类', '全局未对齐类', '认知错误类', '连锁跷跷板类', '交付质量类', '反复未果类', '头痛医头类'];

function getC2SystemPrompt() {
  return `你是一个AI Agent错误分类专家。给定一段描述AI Agent在执行任务时的错误场景，你需要将其分类为以下8类之一：
${C2_CATEGORIES.map((c, i) => `${i + 1}. ${c}`).join('\n')}

分类定义：
- 纠偏类：用户明确否定/修正Agent行为
- 自主性缺失类：Agent该主动做但没做，等用户指出
- 全局未对齐类：局部正确但全局不一致
- 认知错误类：对需求/概念理解错误
- 连锁跷跷板类：修A坏B，修B又影响C
- 交付质量类：半成品/格式错误/残留
- 反复未果类：同一问题多次尝试仍未解决
- 头痛医头类：只改症状不改根因

只返回类别名称，不要任何其他内容。`;
}

function loadOpenClawConfig() {
  try {
    return JSON.parse(fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function getProviderConfig(providerName) {
  const config = loadOpenClawConfig();
  return config?.models?.providers?.find(p => p.name === providerName) || null;
}

async function glm5Classify(input) {
  const messages = Array.isArray(input) ? input : [{ role: 'user', content: input }];
  const lastUserMsg = messages.filter(m => m.role === 'user').pop();
  const text = lastUserMsg?.content || '';

  const apiKey = process.env.ZHIPU_API_KEY || '';
  if (!apiKey) return mockClassify(input);

  const systemPrompt = getC2SystemPrompt();

  const body = JSON.stringify({
    model: 'glm-4-flash',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `请分类以下场景：\n${text.slice(0, 2000)}` },
    ],
    temperature: 0.1,
    max_tokens: 20,
  });

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'open.bigmodel.cn',
      path: '/api/paas/v4/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      timeout: 15000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const answer = (json.choices?.[0]?.message?.content || '').trim();
          const matched = C2_CATEGORIES.find(c => answer.includes(c));
          resolve({ ic: matched || 'UNKNOWN', intents: [], raw: answer });
        } catch {
          resolve(mockClassify(input));
        }
      });
    });
    req.on('error', () => resolve(mockClassify(input)));
    req.on('timeout', () => { req.destroy(); resolve(mockClassify(input)); });
    req.write(body);
    req.end();
  });
}

async function callAnthropic(apiKey, baseURL, input) {
  const messages = Array.isArray(input) ? input : [{ role: 'user', content: input }];
  const lastUserMsg = messages.filter(m => m.role === 'user').pop();
  const text = lastUserMsg?.content || '';

  const systemPrompt = getC2SystemPrompt();
  const body = JSON.stringify({
    model: 'claude-opus-4-6-thinking',
    max_tokens: 32,
    temperature: 0.1,
    system: systemPrompt,
    messages: [{ role: 'user', content: `请分类以下场景：\n${text.slice(0, 2000)}` }],
  });

  return new Promise((resolve) => {
    const url = new URL((baseURL || 'https://api.penguinsai.chat').replace(/\/$/, '') + '/v1/messages');
    const req = https.request({
      hostname: url.hostname,
      port: url.port || 443,
      path: `${url.pathname}${url.search}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      timeout: 30000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const answer = (json.content?.find?.(c => c.type === 'text')?.text || '').trim();
          const matched = C2_CATEGORIES.find(c => answer.includes(c));
          resolve({ ic: matched || 'UNKNOWN', intents: [], raw: answer });
        } catch {
          resolve(mockClassify(input));
        }
      });
    });
    req.on('error', () => resolve(mockClassify(input)));
    req.on('timeout', () => { req.destroy(); resolve(mockClassify(input)); });
    req.write(body);
    req.end();
  });
}

async function opusClassify(input) {
  const envKey = process.env.ANTHROPIC_API_KEY || '';
  if (envKey) return callAnthropic(envKey, 'https://api.penguinsai.chat', input);

  const provider = getProviderConfig('penguinsaichat');
  if (provider?.apiKey) {
    return callAnthropic(provider.apiKey, provider.baseURL || 'https://api.penguinsai.chat', input);
  }
  return mockClassify(input);
}

async function codexClassify(input) {
  const messages = Array.isArray(input) ? input : [{ role: 'user', content: input }];
  const lastUserMsg = messages.filter(m => m.role === 'user').pop();
  const text = lastUserMsg?.content || '';

  const provider = getProviderConfig('boom');
  if (!provider?.apiKey || !provider?.baseURL) return mockClassify(input);

  const body = JSON.stringify({
    model: 'gpt-5.3-codex',
    messages: [
      { role: 'system', content: getC2SystemPrompt() },
      { role: 'user', content: `请分类以下场景：\n${text.slice(0, 2000)}` },
    ],
    temperature: 0.1,
    max_tokens: 20,
  });

  return new Promise((resolve) => {
    const url = new URL(provider.baseURL.replace(/\/$/, '') + '/v1/chat/completions');
    const req = https.request({
      hostname: url.hostname,
      port: url.port || 443,
      path: `${url.pathname}${url.search}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey}`,
      },
      timeout: 30000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const answer = (json.choices?.[0]?.message?.content || '').trim();
          const matched = C2_CATEGORIES.find(c => answer.includes(c));
          resolve({ ic: matched || 'UNKNOWN', intents: [], raw: answer });
        } catch {
          resolve(mockClassify(input));
        }
      });
    });
    req.on('error', () => resolve(mockClassify(input)));
    req.on('timeout', () => { req.destroy(); resolve(mockClassify(input)); });
    req.write(body);
    req.end();
  });
}

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

// ─── 单批次评测执行 ───
async function runBatch(batchSamples, batchIndex, totalBatches, scanner, useScanner, useGLM5, useOpus, useCodex) {
  const results = [];
  let correct = 0;
  const icStats = {};

  for (const sample of batchSamples) {
    const startTime = Date.now();

    // 调用分类器
    let prediction;
    if (useOpus) {
      prediction = await opusClassify(sample.input);
    } else if (useCodex) {
      prediction = await codexClassify(sample.input);
    } else if (useGLM5) {
      prediction = await glm5Classify(sample.input);
    } else if (useScanner) {
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
    if (!isCorrect) {
      const userMsg = sample.input.filter(m => m.role === 'user').pop();
      console.log(`  ❌ ${sample.id} | 期望: ${sample.expected_ic} | 预测: ${prediction.ic} | "${(userMsg?.content || '').slice(0, 30)}..."`);
    }
  }

  // 输出该批次结果
  const batchAccuracy = batchSamples.length > 0 ? (correct / batchSamples.length * 100).toFixed(1) : '0.0';
  console.log(`\n  📊 批次 ${batchIndex}/${totalBatches} 完成: 准确率 ${batchAccuracy}% (${correct}/${batchSamples.length})`);

  return { results, correct, total: batchSamples.length, icStats };
}

// ─── 合并统计 ───
function mergeStats(allBatchResults) {
  const mergedIcStats = {};
  let totalCorrect = 0;
  let totalCount = 0;

  for (const batch of allBatchResults) {
    totalCorrect += batch.correct;
    totalCount += batch.total;

    for (const [ic, stats] of Object.entries(batch.icStats)) {
      if (!mergedIcStats[ic]) {
        mergedIcStats[ic] = { total: 0, correct: 0 };
      }
      mergedIcStats[ic].total += stats.total;
      mergedIcStats[ic].correct += stats.correct;
    }
  }

  return { totalCorrect, totalCount, mergedIcStats };
}

// ─── 评测主逻辑 ───
async function runEvaluation() {
  const opts = parseArgs();
  const BATCH_SIZE = opts.batchSize || 10; // 铁律：默认10条/批

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
    const raw = JSON.parse(fs.readFileSync(opts.dataset, 'utf8'));
    // 兼容纯数组格式（c2-golden评测用例）和对象格式
    if (Array.isArray(raw)) {
      // c2-golden格式适配：input是字符串→转消息数组，category→expected_ic
      const adapted = raw.map(r => ({
        ...r,
        input: typeof r.input === 'string' ? [{ role: 'user', content: r.input }] : r.input,
        expected_ic: r.expected_ic || r.category || 'unknown',
      }));
      dataset = { samples: adapted, description: path.basename(opts.dataset) };
    } else {
      dataset = raw;
      if (!dataset.samples && Array.isArray(dataset.test_cases)) dataset.samples = dataset.test_cases;
      if (!dataset.samples && Array.isArray(dataset.scenarios)) dataset.samples = dataset.scenarios;
    }
    console.log(`📂 已加载评测集: ${path.basename(opts.dataset)}`);
    console.log(`   描述: ${dataset.description || '无'}`);
    console.log(`   样本总数: ${dataset.samples.length}`);
  } catch (err) {
    console.error(`❌ 无法加载评测集: ${err.message}`);
    process.exit(1);
  }

  // 3. 初始化分类器
  const useGLM5 = opts.classifier === 'glm5' || process.env.USE_GLM5 === 'true';
  const useOpus = opts.classifier === 'opus';
  const useCodex = opts.classifier === 'codex';
  const scanner = (!useGLM5 && !useOpus && !useCodex) ? loadIntentScanner() : null;
  const useScanner = !useGLM5 && !useOpus && !useCodex && scanner && process.env.USE_LLM === 'true';
  const classifierName = useOpus
    ? 'Opus (claude-opus-4-6-thinking)'
    : useCodex
      ? 'Codex (gpt-5.3-codex)'
      : useGLM5
        ? 'GLM-5 (glm-4-flash)'
        : (useScanner ? 'IntentScanner (LLM)' : 'Mock 正则分类器');
  console.log(`🔧 分类器: ${classifierName}`);

  // 4. 确定评测范围
  let samples = dataset.samples;
  if (opts.limit > 0 && opts.limit < samples.length) {
    samples = samples.slice(0, opts.limit);
    console.log(`⚡ 限制评测数量: ${opts.limit} 条`);
  }

  // 5. 分批处理（铁律：默认每批10条）
  const batches = [];
  for (let i = 0; i < samples.length; i += BATCH_SIZE) {
    batches.push(samples.slice(i, i + BATCH_SIZE));
  }

  console.log();
  console.log(`📋 共${samples.length}条，分${batches.length}批（每批${BATCH_SIZE}条）`);
  console.log('─'.repeat(50));
  console.log('开始评测...');
  console.log('─'.repeat(50));

  // 6. 逐批执行评测
  const allBatchResults = [];
  for (let b = 0; b < batches.length; b++) {
    console.log(`\n▶ 批次 ${b + 1}/${batches.length}（${batches[b].length}条）`);
    const batchResult = await runBatch(batches[b], b + 1, batches.length, scanner, useScanner, useGLM5, useOpus, useCodex);
    allBatchResults.push(batchResult);
  }

  console.log();
  console.log('─'.repeat(50));

  // 7. 汇总所有批次结果
  const { totalCorrect, totalCount, mergedIcStats } = mergeStats(allBatchResults);
  const allResults = allBatchResults.flatMap(b => b.results);

  // 8. 生成汇总报告
  const accuracy = totalCount > 0 ? (totalCorrect / totalCount) : 0;
  const accuracyPct = (accuracy * 100).toFixed(1);

  // 按 IC 类别汇总
  const icSummary = {};
  for (const [ic, stats] of Object.entries(mergedIcStats)) {
    icSummary[ic] = {
      total: stats.total,
      correct: stats.correct,
      accuracy: stats.total > 0 ? parseFloat((stats.correct / stats.total * 100).toFixed(1)) : 0,
    };
  }

  // 按难度汇总
  const diffStats = {};
  for (const r of allResults) {
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
      样本总数: totalCount,
      批次数: batches.length,
      批次大小: BATCH_SIZE,
      AEO版本: config.version || 'unknown',
    },
    总体结果: {
      正确数: totalCorrect,
      总数: totalCount,
      准确率: `${accuracyPct}%`,
      准确率数值: accuracy,
    },
    按IC类别: icSummary,
    按难度: diffSummary,
    各批次结果: allBatchResults.map((b, i) => ({
      批次: i + 1,
      样本数: b.total,
      正确数: b.correct,
      准确率: b.total > 0 ? `${(b.correct / b.total * 100).toFixed(1)}%` : '0.0%',
    })),
    错误用例: allResults.filter(r => !r.correct),
    全部结果: allResults,
  };

  // 9. 输出汇总结果
  console.log('📊 汇总评测结果');
  console.log(`   总准确率: ${accuracyPct}% (${totalCorrect}/${totalCount})`);
  console.log(`   批次数: ${batches.length} (每批${BATCH_SIZE}条)`);
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

  // 10. 保存报告
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
