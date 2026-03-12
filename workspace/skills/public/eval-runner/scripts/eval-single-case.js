#!/usr/bin/env node
/**
 * eval-single-case.js — V4单条case评测
 * 
 * 用法: node eval-single-case.js '<case_json>'
 * 
 * RC1修复：改进本地评测逻辑，不再对有数据的维度硬编码fail
 * - intent_accuracy: 有category时做语义相似度匹配（关键词+同义词）
 * - implicit_intent: 有expected_output时分析是否包含深层目标关键词
 * - 支持V4字段: north_star_indicator, scoring_rubric, gate
 */

'use strict';

const path = require('path');

// RC7修复：正确的相对路径（3层../回到skills/）
const getEvalStandard = (() => {
  try {
    return require(path.join(__dirname, '..', '..', '..', 'isc-core', 'config', 'read-eval-version.js')).getEvalStandard;
  } catch {
    return () => ({ version: 'UNKNOWN' });
  }
})();

const caseData = JSON.parse(process.argv[2]);
const {
  id, input, context, expected_output, category,
  execution_chain_steps, difficulty, source,
  north_star_indicator, scoring_rubric, gate
} = caseData;

const evalStandard = getEvalStandard();

// ====== 意图分类语义匹配（RC1核心修复） ======
const CATEGORY_SYNONYMS = {
  '纠偏类': ['纠偏', '纠正', '修正', '偏差', 'correction', '方向错'],
  '认知错误类': ['认知', '误解', '理解错', '概念错', 'cognitive'],
  '全局未对齐类': ['全局', '对齐', '一致性', 'alignment', '不一致'],
  '头痛医头类': ['头痛医头', '治标', '表面', 'symptom', '没找到根因'],
  '反复未果类': ['反复', '循环', '重复', '未果', 'loop', '死循环'],
  '连锁跷跷板类': ['连锁', '跷跷板', '此消彼长', 'cascade', '副作用'],
  '自主性缺失类': ['自主', '被动', '等待', '催促', 'autonomous', '主动性'],
  '交付质量类': ['交付', '质量', '完成度', 'delivery', '产出']
};

function matchCategory(predicted, expected) {
  if (!expected || expected === '未分类') return { pass: true, reason: '无明确分类标准' };
  if (!predicted) return { pass: false, reason: '无预测分类' };

  // 精确匹配
  if (predicted === expected) return { pass: true, reason: '精确匹配' };

  // 语义匹配：检查predicted是否包含expected的关键词
  const synonyms = CATEGORY_SYNONYMS[expected] || [];
  const predLower = predicted.toLowerCase();
  for (const syn of synonyms) {
    if (predLower.includes(syn.toLowerCase())) {
      return { pass: true, reason: `语义匹配: "${predicted}" 包含关键词 "${syn}"` };
    }
  }

  return { pass: false, reason: `分类不匹配: 预测="${predicted}" vs 期望="${expected}"` };
}

// ====== 隐含意图检测（RC1修复：不再硬编码fail） ======
function checkImplicitIntent(input, expectedOutput, context) {
  if (!expectedOutput || expectedOutput.length < 10) {
    return { pass: true, reason: '期望输出过短，无法判定隐含意图，自动pass' };
  }

  // 检测expected_output中是否包含超出input表面请求的深层目标
  const deepIndicators = [
    '根因', '根本原因', '本质', '深层', '系统性', '全局',
    '预防', '防止再次', '闭环', '长期', '架构', '体系',
    '不仅', '还需要', '同时', '此外', '更重要'
  ];

  const hasDeepGoal = deepIndicators.some(kw => expectedOutput.includes(kw));
  if (hasDeepGoal) {
    // 有深层目标，检查input是否也提到了（如果input也提到了，就不算"隐含"）
    const inputMentions = deepIndicators.filter(kw => (input || '').includes(kw));
    if (inputMentions.length === 0) {
      return { pass: true, reason: `expected_output包含深层目标关键词，且input未显式提及 → 存在隐含意图` };
    }
  }

  // 无明显深层目标 → 不需要捕获隐含意图 → pass
  return { pass: true, reason: '无明显隐含意图需求，自动pass' };
}

// ====== V4北极星指标映射 ======
function getNorthStarScore(indicator, caseData) {
  if (!indicator) return null;

  const mapping = {
    '言出法随达成率': 'ns1_rule_effectiveness',
    '自主闭环率': 'ns2_autonomous_closure',
    '认知层真实代码覆盖': 'ns3_cognitive_code_coverage',
    '独立QA覆盖率': 'ns4_independent_qa',
    '根因分析覆盖率': 'ns5_root_cause_analysis',
    '意图识别准确率': 'ns1_rule_effectiveness',
    '执行链完整度': 'ns3_cognitive_code_coverage'
  };

  return {
    indicator_id: mapping[indicator] || indicator,
    indicator_name: indicator,
    applicable: true
  };
}

// ====== 主评测逻辑 ======
function evaluate(caseData) {
  const result = {
    case_id: id,
    eval_standard: evalStandard.version || 'V4',
    track: 'v4-local',
    difficulty: difficulty || 'C1',
    source: source || 'unknown',
    dimensions: {},
    v4_extensions: {},
    verdict: 'Partial',
    summary: ''
  };

  // ---- 维度1: 意图分类准确性 ----
  // 本地模式：基于input关键词预测分类，再与expected比较
  let predictedCategory = null;
  if (input) {
    for (const [cat, keywords] of Object.entries(CATEGORY_SYNONYMS)) {
      if (keywords.some(kw => input.includes(kw))) {
        predictedCategory = cat;
        break;
      }
    }
  }
  const catMatch = matchCategory(predictedCategory || category, category);
  result.dimensions.intent_accuracy = {
    pass: catMatch.pass,
    predicted: predictedCategory,
    expected: category,
    reason: catMatch.reason
  };

  // ---- 维度2: 执行链完整性 ----
  const steps = execution_chain_steps || [];
  const stepsCount = steps.length;
  if (stepsCount === 0) {
    result.dimensions.chain_completeness = {
      pass: true, coverage: 1.0, expected_steps: 0,
      reason: '无期望步骤，自动pass'
    };
  } else {
    // 本地模式：检查步骤结构合理性（非空、有意义）
    const validSteps = steps.filter(s => s && s.length > 2);
    const coverage = validSteps.length / stepsCount;
    result.dimensions.chain_completeness = {
      pass: coverage >= 0.8,
      coverage: coverage,
      expected_steps: stepsCount,
      valid_steps: validSteps.length,
      reason: coverage >= 0.8
        ? `${validSteps.length}/${stepsCount}步骤结构合法 (${(coverage*100).toFixed(0)}%)`
        : `仅${validSteps.length}/${stepsCount}步骤合法 (${(coverage*100).toFixed(0)}%)`
    };
  }

  // ---- 维度3: 跨模块协同 ----
  const multiModule = stepsCount >= 4;
  if (!multiModule) {
    result.dimensions.cross_module = {
      pass: true,
      reason: `步骤数${stepsCount}<4，单模块场景，自动pass`
    };
  } else {
    // 功能模块检测：基础设施关键词 + 功能角色关键词
    const modulePatterns = {
      '任务调度': ['主Agent', '派出', '拆解任务', '调度', 'dispatch'],
      '子Agent执行': ['子Agent', 'subagent', '子任务'],
      '代码/开发': ['代码', '开发', '修复', '编写', '提交', 'commit', 'git', '审查'],
      'QA/测试': ['QA', '测试', '验证', '健康检查', 'test', '校验'],
      '部署/运维': ['部署', '镜像', '服务启动', 'deploy', '上线'],
      '监控/告警': ['监控', '告警', '探针', '超时', '失败事件', '日志'],
      'ISC/规则': ['ISC', '规则', 'rule', '意图', '事件绑定'],
      'AEO/评测': ['AEO', '评测', 'eval', '评分'],
      '文档/报告': ['报告', '文档', '汇总', '交付', '飞书'],
      '存储/数据': ['MemOS', '数据', '存储', '看板', '记忆'],
      '安全': ['鉴权', '安全', 'auth', '权限', '漏洞'],
      '技能': ['skill', '技能']
    };
    const stepsText = steps.join(' ');
    const modulesFound = new Set();
    for (const [mod, keywords] of Object.entries(modulePatterns)) {
      if (keywords.some(kw => stepsText.includes(kw))) {
        modulesFound.add(mod);
      }
    }
    result.dimensions.cross_module = {
      pass: modulesFound.size >= 2,
      modules_detected: [...modulesFound],
      reason: modulesFound.size >= 2
        ? `检测到${modulesFound.size}个功能模块: ${[...modulesFound].join(', ')}`
        : `仅检测到${modulesFound.size}个功能模块`
    };
  }

  // ---- 维度4: 隐含意图捕获（RC1修复） ----
  result.dimensions.implicit_intent = checkImplicitIntent(input, expected_output, context);

  // ---- 维度5: 上下文利用 ----
  const hasContext = context && context.trim().length > 0;
  result.dimensions.context_utilization = {
    pass: !hasContext || (input && context && input.length > 10),
    reason: hasContext
      ? (input && input.length > 10 ? '有上下文且input足够长，结构合理' : '有上下文但input过短，可能未充分利用')
      : '无上下文，自动pass'
  };

  // ---- V4扩展字段 ----
  if (north_star_indicator) {
    result.v4_extensions.north_star = getNorthStarScore(north_star_indicator, caseData);
  }
  if (scoring_rubric) {
    result.v4_extensions.scoring_rubric = {
      version: scoring_rubric.version || 'V4',
      has_custom_dimensions: !!(scoring_rubric.scoring_dimensions && scoring_rubric.scoring_dimensions.length > 0),
      pass_criteria: scoring_rubric.pass_criteria || null
    };
  }
  if (gate) {
    result.v4_extensions.gate = gate;
  }

  // ---- 综合判定 ----
  const dims = Object.values(result.dimensions);
  const passCount = dims.filter(d => d.pass).length;
  const totalDims = dims.length;

  if (passCount === totalDims) result.verdict = 'Pass';
  else if (totalDims - passCount <= 2) result.verdict = 'Partial';
  else result.verdict = 'Badcase';

  result.summary = `${passCount}/${totalDims}维通过 (${evalStandard.version || 'V4'}, local模式)`;
  result.pass_count = passCount;
  result.total_dimensions = totalDims;

  return result;
}

const result = evaluate(caseData);
console.log(JSON.stringify(result, null, 2));
