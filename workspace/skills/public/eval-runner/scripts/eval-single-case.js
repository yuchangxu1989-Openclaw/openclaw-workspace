#!/usr/bin/env node
/**
 * eval-single-case.js — 评测单条case
 * 
 * 用法: node eval-single-case.js '<case_json>'
 * 
 * 角色分离：
 *   Executor: 模拟被测Agent，输出意图分类+执行链
 *   Evaluator: 独立评测Agent，按V3标准5维度判定
 * 
 * 输出: JSON结构化评测结果
 */

const caseData = JSON.parse(process.argv[2]);

const { id, input, context, expected_output, category, execution_chain_steps } = caseData;

// ====== Step 1: 构造 Executor Prompt ======
const executorPrompt = `你是一个AI助手，收到以下用户消息和上下文。请输出：
1) 意图分类（一个简短类别名）
2) 执行计划（按顺序的步骤列表）

用户消息: ${input}

上下文: ${context || '无'}

请以JSON格式输出：
{
  "intent_category": "你判断的意图类别",
  "execution_steps": ["步骤1", "步骤2", ...]
}`;

// ====== Step 2: 构造 Evaluator Prompt ======
function buildEvaluatorPrompt(executorResult) {
  return `你是一个独立的评测专家。请按V3标准的5个维度评测以下执行结果。

## 被测Agent输出
${JSON.stringify(executorResult, null, 2)}

## 标准答案
- 期望意图分类: ${category}
- 期望执行链: ${JSON.stringify(execution_chain_steps, null, 2)}
- 期望输出描述: ${expected_output}

## 评测维度（逐一判定 pass/fail + 理由）

### 维度1 — 意图分类准确性
被测分类 "${executorResult.intent_category}" vs 期望分类 "${category}"
是否语义一致？

### 维度2 — 执行链完整性
被测步骤是否覆盖期望执行链的所有关键步骤？
覆盖率 = 被覆盖步骤数 / 期望步骤总数

### 维度3 — 跨模块协同
期望执行链涉及哪些模块？被测是否正确调度了多模块协同？
（若仅涉及单模块，此维度自动pass）

### 维度4 — 隐含意图捕获
期望输出中的深层目标（非表面请求）是否被识别？
surface intent vs deep intent

### 维度5 — 上下文利用
上下文: ${context || '无'}
被测是否在执行中体现了对上下文的利用？
（若上下文为空，此维度自动pass）

请以JSON格式输出：
{
  "dimensions": {
    "intent_accuracy": { "pass": true/false, "reason": "..." },
    "chain_completeness": { "pass": true/false, "coverage": 0.0-1.0, "reason": "..." },
    "cross_module": { "pass": true/false, "reason": "..." },
    "implicit_intent": { "pass": true/false, "reason": "..." },
    "context_utilization": { "pass": true/false, "reason": "..." }
  },
  "verdict": "Pass/Partial/Badcase",
  "summary": "一句话总结"
}`;
}

// ====== Step 3: 模拟执行（无实际LLM调用时的本地逻辑） ======
// 注意：实际部署时应通过OpenClaw Agent API调用executor和evaluator
// 此处提供结构化的prompt模板，供上层调度使用

function evaluateLocally(caseData) {
  // 本地规则评测（不依赖LLM，作为fallback/快速模式）
  const result = {
    case_id: id,
    executor_prompt: executorPrompt,
    evaluator_prompt_template: 'buildEvaluatorPrompt(executorResult)',
    // 本地规则判定
    dimensions: {},
    verdict: 'Partial',
    summary: ''
  };

  // 维度1: 意图分类 — 需要LLM语义匹配，本地仅做字符串包含检查
  const intentPass = !category || category === '未分类';
  result.dimensions.intent_accuracy = {
    pass: intentPass,
    reason: intentPass ? '无明确分类标准，自动pass' : `需LLM判定: 期望="${category}"`
  };

  // 维度2: 执行链完整性
  const stepsCount = (execution_chain_steps || []).length;
  result.dimensions.chain_completeness = {
    pass: stepsCount === 0,
    expected_steps: stepsCount,
    reason: stepsCount === 0 ? '无期望步骤，自动pass' : `需LLM评测${stepsCount}个步骤的覆盖率`
  };

  // 维度3: 跨模块协同
  const multiModule = stepsCount > 3;
  result.dimensions.cross_module = {
    pass: !multiModule,
    reason: multiModule ? '步骤≥4，可能涉及多模块，需LLM判定' : '步骤较少，单模块场景，自动pass'
  };

  // 维度4: 隐含意图
  result.dimensions.implicit_intent = {
    pass: false,
    reason: '需LLM判定是否存在deep intent'
  };

  // 维度5: 上下文利用
  const hasContext = context && context.trim().length > 0;
  result.dimensions.context_utilization = {
    pass: !hasContext,
    reason: hasContext ? '有上下文，需LLM判定是否被利用' : '无上下文，自动pass'
  };

  // 综合判定
  const dims = Object.values(result.dimensions);
  const passCount = dims.filter(d => d.pass).length;
  if (passCount === 5) result.verdict = 'Pass';
  else if (passCount >= 3) result.verdict = 'Partial';
  else result.verdict = 'Badcase';

  result.summary = `${passCount}/5维通过(本地规则模式，完整评测需LLM)`;

  return result;
}

// 执行并输出
const result = evaluateLocally(caseData);
console.log(JSON.stringify(result, null, 2));
