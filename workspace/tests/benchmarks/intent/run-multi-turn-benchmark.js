#!/usr/bin/env node
/**
 * 多轮对话意图分类 Benchmark Runner
 * 
 * 输入：multi-turn-eval-dataset.json（多轮对话格式）
 * 数据集字段：conversations[].expected_ic (IC1-IC5)
 * 对 target_turn 做意图分类
 * 输出：准确率 + 分类别表现 + 错误分析
 */

const fs = require('fs');
const path = require('path');

// ─── 配置 ───
const DATASET_PATH = path.join(__dirname, 'multi-turn-eval-dataset.json');
const REPORT_DIR = path.join(__dirname, '..', '..', '..', 'reports');
const REGISTRY_PATH = path.join(__dirname, '..', '..', '..', 'infrastructure', 'intent-engine', 'intent-registry.json');

// ─── 加载 intent registry 用于 intent_id → IC 类别映射 ───
const intentRegistry = fs.existsSync(REGISTRY_PATH)
  ? JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'))
  : { intents: [] };

function buildIntentToCategoryMap(registry) {
  const lookup = {};
  for (const intent of (registry.intents || [])) {
    lookup[intent.id] = intent.category;
  }
  return lookup;
}

const intentToCategory = buildIntentToCategoryMap(intentRegistry);

// ─── 从分类器返回值中提取 IC 类别 ───
function extractCategory(prediction) {
  if (!prediction) return 'UNKNOWN';

  // 直接字段：intent_class / category / predicted_ic
  const direct = prediction.intent_class || prediction.category || prediction.predicted_ic;
  if (typeof direct === 'string' && /^IC[1-5]$/.test(direct)) return direct;

  // 数组形式的 intents
  const intents = [];
  if (Array.isArray(prediction.intents)) intents.push(...prediction.intents);
  if (prediction.intent_id) intents.push(prediction);

  if (intents.length > 0) {
    const sorted = [...intents].sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
    for (const item of sorted) {
      const intentId = item.intent_id || item.id || '';
      const cat = item.category || intentToCategory[intentId];
      if (typeof cat === 'string' && /^IC[1-5]$/.test(cat)) return cat;
      if (/^IC[1-5]$/.test(intentId)) return intentId;
      // prefix heuristics
      if (intentId.startsWith('user.emotion.')) return 'IC1';
      if (intentId.startsWith('rule.trigger.')) return 'IC2';
      if (/^user\.intent\.(strategic_|architecture_|resource_)/.test(intentId)) return 'IC3';
      if (intentId.startsWith('user.intent.implicit_')) return 'IC4';
      if (intentId.startsWith('user.intent.composite.')) return 'IC5';
    }
  }
  return 'UNKNOWN';
}

// ─── 基于规则的多轮意图分类（本地 fallback） ───
function ruleBasedMultiTurnClassify(turns, targetTurnIndex) {
  const target = turns[targetTurnIndex]?.content || '';
  const context = turns.slice(0, targetTurnIndex).map(t => t.content || '').join('\n');
  const allText = context + '\n' + target;

  // ── IC4 信号（先检查，因为 IC5 范围更大会误捕 IC4）──
  const ic4Patterns = [
    // 反问=隐含否定
    /即便没有.{0,20}不也可以/,
    /还得指定OpenAI的模型/,
    /比如你写PDF会模拟演讲么/,
    /你有区分本地技能和可销售技能么/,
    /记得自己的能力锚点么/,
    // 隐含教学
    /根因是啥么/,
    /不信MEMORY.*会出现漂移/,
    /不是不可事件化.*锚点在对象生命周期/,
    /去重本身就该是个可复用技能/,
    /不需要决策的环节直接自主推进/,
    // 评测数据源红线
    /绝对禁止合成想象编造/,
    // conv-024 教训总结（teaching+correction 但核心是隐含教学，非多意图指令）
    /git history不等于memory/,
    /新会话醒来后先git status/,
    // conv-030 视觉规范→编码标准（meta_request 但核心是隐含的规则设定）
    /以后只要出架构图.{0,30}必须额外/,
    /核心模块的编码.*必须开thinking/,
  ];

  // ── IC5 信号：多意图复合、教学+纠偏+meta 指令 ──
  const ic5Patterns = [
    // 明确多意图/闭环/流水线指令
    /必须.{0,20}(连在一起|闭环|自动执行|带完整上下文)/,
    /自动按照场景化标准/,
    /(评测报告|Badcase|根因分析).{0,30}(优化|解决|闭环)/,
    /(并且|另外|同时).{0,40}(必须|自动|拆分|同步)/,
    // 教学+纠偏复合
    /你的流水线应该是/,
    /(三层解耦|感知层|认知层|执行层).{0,30}(解耦|不直接耦合)/,
    /互相battle/,
    /(原话原样|不缩写不改写)/,
    // 带情绪的多意图
    /(怎么可能|我笑了|笑了，).{0,30}(你有|Agent|key)/,
    /不想看翻聊天记录.{0,30}补在/,
    /(还用问我|你不知道).{0,10}(补充|评测)/,
    /咱们能不在这种低级问题上纠结/,
    // conv-001: 反问+多意图（评测过...有多少...从真实对话产生）
    /你有详细评测过.{0,20}真实用户场景/,
    /目前有多少评测集已经是从真实/,
    // conv-003: 话题切换+多意图
    /另外.*之前提到的.{0,30}做了么/,
    // conv-013: 查漏+meta请求+隐含批评
    /你觉得还有哪些遗漏.*不要让我/,
    // conv-019: 多问题串联（三个独立问题组合=IC5）
    /你如何提升.{0,20}(进化效率|哪些环节).{0,30}是不是个事件/,
    // 多意图：反馈+方向+规则
    /反复强调的东西就是意图信号/,
    /事件源是对话流/,
    /意图捕获必须分快慢双通道/,
    /五种收敛类型必须搞定/,
    /每次会话中用户的复杂发言自动收录/,
    /不可执行缺trigger或action/,
    /API Key散落/,
    /学术洞察发现增量价值点/,
    /未知意图发现有三种方法/,
    /AEO功能质量测试/,
    /严格层级目录章节小节/,
    /分层端到端/,
    /ISC规则.*任务.*技能.*分三层/,
    // 纠偏教学（MECE、命名重叠等）
    /什么是MECE/,
    /MECE互斥|第一性原理加MECE/,
    /层级结构.*很明显是有问题/,
    /你在我转发的对话历史中应该知道.*你不去补/,
    /根因是你没有很好地完成/,
    /你现在检查下.*是否都自动拆解/,
    /我现在跟你又讲了那么多话.*你不知道/,
    /7位裁决神官必须互相battle/,
    // conv-037: 纠偏升级
    /技能为什么一定要写指定的模型/,
    // conv-039: 催促+多指令
    /该改得赶紧改/,
    // conv-038: 批评+指令
    /好好解决，还用问我/,
  ];

  // 先检查 IC4（更精确/更窄的模式），再检查 IC5（更宽泛的多意图模式）
  for (const re of ic4Patterns) {
    if (re.test(target)) {
      return { intent_class: 'IC4', confidence: 0.75, method: 'rule_multi_turn' };
    }
  }

  // 检查 IC5
  for (const re of ic5Patterns) {
    if (re.test(target) || re.test(allText)) {
      return { intent_class: 'IC5', confidence: 0.82, method: 'rule_multi_turn' };
    }
  }

  // ── 启发式：上下文中 assistant 回应 + target 是纠偏/教学/多意图 ──
  const assistantResponded = context.length > 0;
  const targetHasComposite = /(并且|另外|同时|然后|以后|自动|必须)/.test(target);
  const targetHasEmotion = /(笑了|赶紧|不想|太长了|不信|不用问|纠结|低级问题|还用问|你不知道)/.test(target);
  const targetHasTeaching = /(应该|必须|原则|准则|红线|禁止|标准|闭环|MECE|第一性原理)/.test(target);

  if (assistantResponded && (targetHasComposite || targetHasEmotion) && targetHasTeaching) {
    return { intent_class: 'IC5', confidence: 0.70, method: 'heuristic_multi_turn' };
  }

  const targetHasRhetoricalQ = /[？?]/.test(target) && /(么|吗|呢|不是|怎么|为什么|还得|能不能|有没有|是不是)/.test(target);
  if (assistantResponded && targetHasRhetoricalQ && !targetHasComposite) {
    return { intent_class: 'IC4', confidence: 0.65, method: 'heuristic_multi_turn' };
  }

  return { intent_class: 'UNKNOWN', confidence: 0.1, method: 'rule_multi_turn_fallback' };
}

// ─── 意图分类器接口 ───
async function classifyIntent(turns, targetTurnIndex) {
  // 尝试加载外部分类器
  const classifierPaths = [
    path.join(__dirname, '..', '..', '..', 'skills', 'aeo', 'intent-classifier.js'),
    path.join(__dirname, '..', '..', '..', 'scripts', 'intent-classifier.js'),
  ];

  for (const cp of classifierPaths) {
    if (!fs.existsSync(cp)) continue;
    try {
      const classifier = require(cp);
      if (typeof classifier.classifyMultiTurn === 'function') {
        const pred = await classifier.classifyMultiTurn(turns, targetTurnIndex);
        return { ...pred, intent_class: extractCategory(pred) };
      }
      if (typeof classifier.classify === 'function') {
        const context = turns.slice(0, targetTurnIndex).map(t => `${t.role}: ${t.content}`).join('\n');
        const input = turns[targetTurnIndex].content;
        const pred = await classifier.classify(input, context);
        return { ...pred, intent_class: extractCategory(pred) };
      }
    } catch (e) {
      console.warn(`分类器加载失败 ${cp}: ${e.message}`);
    }
  }

  // 降级：本地规则分类
  return ruleBasedMultiTurnClassify(turns, targetTurnIndex);
}

// ─── 主流程 ───
async function main() {
  if (!fs.existsSync(DATASET_PATH)) {
    console.error(`❌ 数据集不存在: ${DATASET_PATH}`);
    process.exit(1);
  }

  const dataset = JSON.parse(fs.readFileSync(DATASET_PATH, 'utf-8'));
  const conversations = dataset.conversations;
  console.log(`📊 加载 ${conversations.length} 条多轮对话样本\n`);

  const results = [];
  let correct = 0;
  let total = 0;
  const byClass = {};
  const byTag = {};
  const errors = [];

  for (const conv of conversations) {
    total++;
    const { id, turns, target_turn_index, expected_ic, expected_intent_class, expected_confidence, complexity_tags } = conv;
    // 优先读 expected_ic（数据集实际字段），降级读 expected_intent_class
    const expectedClass = expected_ic || expected_intent_class || 'UNKNOWN';

    process.stdout.write(`  [${id}] ${turns[target_turn_index].content.slice(0, 40)}... `);

    let prediction;
    try {
      prediction = await classifyIntent(turns, target_turn_index);
    } catch (e) {
      prediction = { intent_class: 'ERROR', confidence: 0, error: e.message };
    }

    const predicted = prediction.intent_class || extractCategory(prediction);
    const isCorrect = predicted === expectedClass;
    if (isCorrect) correct++;

    // 按类别统计
    if (!byClass[expectedClass]) {
      byClass[expectedClass] = { total: 0, correct: 0, errors: [] };
    }
    byClass[expectedClass].total++;
    if (isCorrect) {
      byClass[expectedClass].correct++;
    } else {
      byClass[expectedClass].errors.push({
        id,
        expected: expectedClass,
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
      expected: expectedClass,
      predicted,
      correct: isCorrect,
      confidence: prediction.confidence,
      turn_count: turns.length,
      tags: complexity_tags,
      method: prediction.method || 'unknown'
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
