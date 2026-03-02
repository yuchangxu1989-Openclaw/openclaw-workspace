/**
 * test-dual-track.cjs - 双轨运营系统测试
 * 测试 selector, ai-effect-evaluator, function-quality-evaluator
 */

const { TrackSelector, TRACKS } = require('./selector.cjs');
const { AIEffectEvaluator } = require('./ai-effect-evaluator.cjs');
const { FunctionQualityEvaluator } = require('./function-quality-evaluator.cjs');

// 测试统计
const stats = {
  passed: 0,
  failed: 0,
  tests: []
};

function test(name, fn) {
  try {
    fn();
    stats.passed++;
    stats.tests.push({ name, status: '✅ PASS' });
    console.log(`✅ ${name}`);
  } catch (error) {
    stats.failed++;
    stats.tests.push({ name, status: '❌ FAIL', error: error.message });
    console.log(`❌ ${name}: ${error.message}`);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || 'Assertion failed'}: expected ${expected}, got ${actual}`);
  }
}

function assertTrue(value, message) {
  if (!value) {
    throw new Error(message || 'Expected true but got false');
  }
}

// ============ Selector 测试 ============
console.log('\n🎯 测试 Selector - 轨道自动选择器\n');

const selector = new TrackSelector();

test('Selector: AI类型技能选择AI效果轨道', () => {
  const result = selector.select({
    name: 'chat-assistant',
    type: 'llm',
    description: '一个AI对话助手'
  });
  assertEqual(result.track, TRACKS.AI_EFFECT, '应该选择AI效果轨道');
  assertTrue(result.confidence >= 0.9, '置信度应该>=0.9');
});

test('Selector: 工具类型技能选择功能质量轨道', () => {
  const result = selector.select({
    name: 'file-processor',
    type: 'tool',
    description: '文件处理工具'
  });
  assertEqual(result.track, TRACKS.FUNCTIONAL_QUALITY, '应该选择功能质量轨道');
});

test('Selector: 工作流类型技能选择功能质量轨道', () => {
  const result = selector.select({
    name: 'auto-workflow',
    type: 'workflow',
    description: '自动化工作流'
  });
  assertEqual(result.track, TRACKS.FUNCTIONAL_QUALITY, '应该选择功能质量轨道');
});

test('Selector: 混合类型技能选择混合轨道', () => {
  const result = selector.select({
    name: 'smart-agent',
    type: 'hybrid',
    description: '智能代理'
  });
  assertEqual(result.track, TRACKS.HYBRID, '应该选择混合轨道');
});

test('Selector: 未知类型使用默认轨道', () => {
  const result = selector.select({
    name: 'unknown-skill',
    type: 'unknown',
    description: '未知类型技能'
  });
  assertTrue(result.track === TRACKS.AI_EFFECT, '应该使用默认轨道');
});

test('Selector: 基于描述分析选择轨道', () => {
  const result = selector.select({
    name: 'desc-test',
    type: '',
    description: '这是一个自动化工具，用于处理文件和数据集成'
  });
  // 描述中包含工具、自动化、集成等关键词，应该选择功能质量轨道
  assertTrue(result.track === TRACKS.FUNCTIONAL_QUALITY || result.track === TRACKS.HYBRID, '应该基于描述选择功能轨道');
});

test('Selector: 批量选择', () => {
  const skills = [
    { name: 's1', type: 'llm', description: 'AI技能' },
    { name: 's2', type: 'tool', description: '工具技能' },
    { name: 's3', type: 'workflow', description: '工作流' }
  ];
  const results = selector.selectBatch(skills);
  assertEqual(results.length, 3, '应该返回3个结果');
  assertEqual(results[0].track, TRACKS.AI_EFFECT, '第一个应该是AI轨道');
  assertEqual(results[1].track, TRACKS.FUNCTIONAL_QUALITY, '第二个应该是功能轨道');
});

test('Selector: 获取统计信息', () => {
  const stats = selector.getStats();
  assertTrue(stats.total > 0, '应该有历史记录');
  assertTrue(stats.byTrack[TRACKS.AI_EFFECT] >= 0, '应该有AI轨道统计');
});

// ============ AI Effect Evaluator 测试 ============
console.log('\n🤖 测试 AI Effect Evaluator - AI效果评测器\n');

const aiEvaluator = new AIEffectEvaluator();

test('AI Evaluator: 实例化成功', () => {
  assertTrue(aiEvaluator !== null, '应该成功实例化');
});

test('AI Evaluator: 模拟技能评测', async () => {
  const mockSkill = {
    name: 'test-ai-skill',
    path: './',
    execute: async (input) => `这是一个有用的、相关的、连贯的回答：${input}`
  };
  
  const testCases = [
    { input: '你好', expected: '友好的回复' },
    { input: '讲个故事', expected: '有趣的故事' },
    { input: '写首诗', expected: '优美的诗歌' }
  ];
  
  const result = await aiEvaluator.evaluate(mockSkill, testCases);
  
  assertTrue(result.track === 'ai-effect', '应该是AI效果轨道');
  assertTrue(result.overallScore >= 0, '应该有总分');
  assertTrue(result.dimensionScores.relevance !== undefined, '应该有相关性维度');
  assertTrue(result.dimensionScores.coherence !== undefined, '应该有连贯性维度');
  assertTrue(result.dimensionScores.helpfulness !== undefined, '应该有用性维度');
  assertTrue(result.dimensionScores.creativity !== undefined, '应该有创造性维度');
  assertTrue(result.dimensionScores.safety !== undefined, '应该有安全性维度');
});

test('AI Evaluator: 生成改进建议', async () => {
  // 创建一个低分技能
  const badSkill = {
    name: 'bad-ai-skill',
    path: './',
    execute: async () => '不对 错了 无用 有害'
  };
  
  const testCases = [{ input: '测试', expected: '好结果' }];
  const result = await aiEvaluator.evaluate(badSkill, testCases);
  
  assertTrue(Array.isArray(result.suggestions), '应该有建议数组');
  assertTrue(result.suggestions.length > 0, '应该至少有一条建议');
});

// ============ Function Quality Evaluator 测试 ============
console.log('\n⚙️ 测试 Function Quality Evaluator - 功能质量评测器\n');

const funcEvaluator = new FunctionQualityEvaluator({ iterations: 3 });

test('Function Evaluator: 实例化成功', () => {
  assertTrue(funcEvaluator !== null, '应该成功实例化');
});

test('Function Evaluator: 模拟工具技能评测', async () => {
  const mockSkill = {
    name: 'test-api-tool',
    path: './',
    execute: async (input) => {
      // 模拟API调用
      await new Promise(r => setTimeout(r, 10));
      return JSON.stringify({ success: true, data: input });
    }
  };
  
  const testCases = [
    { input: 'request1', expected: 'success' },
    { input: 'request2', expected: 'success' }
  ];
  
  const result = await funcEvaluator.evaluate(mockSkill, testCases);
  
  assertTrue(result.track === 'functional-quality', '应该是功能质量轨道');
  assertTrue(result.overallScore >= 0, '应该有总分');
  assertTrue(result.dimensionScores.accuracy !== undefined, '应该有准确性维度');
  assertTrue(result.dimensionScores.responseTime !== undefined, '应该有响应时间维度');
  assertTrue(result.dimensionScores.errorRate !== undefined, '应该有错误率维度');
  assertTrue(result.dimensionScores.compatibility !== undefined, '应该有兼容性维度');
  assertTrue(result.dimensionScores.stability !== undefined, '应该有稳定性维度');
  assertTrue(result.performanceReport !== undefined, '应该有性能报告');
});

test('Function Evaluator: 性能报告包含响应时间统计', async () => {
  const mockSkill = {
    name: 'perf-test-skill',
    path: './',
    execute: async () => 'result'
  };
  
  const result = await funcEvaluator.evaluate(mockSkill, [{ input: 'test' }]);
  
  assertTrue(result.performanceReport.responseTimeStats !== undefined, '应该有响应时间统计');
  assertTrue(result.performanceReport.responseTimeStats.avg !== undefined, '应该有平均值');
  assertTrue(result.performanceReport.responseTimeStats.min !== undefined, '应该有最小值');
  assertTrue(result.performanceReport.responseTimeStats.max !== undefined, '应该有最大值');
});

// ============ 集成测试 ============
console.log('\n🔗 集成测试 - 完整双轨运营流程\n');

test('集成: 选择轨道 + 执行对应评测', async () => {
  // 1. 选择轨道
  const skillInfo = {
    name: 'ai-writer',
    type: 'generation',
    description: 'AI写作助手'
  };
  
  const selection = selector.select(skillInfo);
  
  // 2. 根据选择执行评测
  let evalResult;
  if (selection.track === TRACKS.AI_EFFECT) {
    const mockSkill = {
      name: skillInfo.name,
      path: './',
      execute: async (input) => `生成的内容：${input}`
    };
    evalResult = await aiEvaluator.evaluate(mockSkill, [
      { input: '写一段介绍' }
    ]);
  } else {
    const mockSkill = {
      name: skillInfo.name,
      path: './',
      execute: async () => '执行结果'
    };
    evalResult = await funcEvaluator.evaluate(mockSkill, [
      { input: 'test' }
    ]);
  }
  
  assertTrue(evalResult !== undefined, '应该有评测结果');
  assertEqual(evalResult.skillName, skillInfo.name, '技能名称应该匹配');
});

test('集成: 双轨并行评测', async () => {
  const hybridSkill = {
    name: 'hybrid-assistant',
    type: 'agent',
    description: '智能助手'
  };
  
  // 选择混合轨道
  const selection = selector.select(hybridSkill);
  assertEqual(selection.track, TRACKS.HYBRID, '混合技能应该选择混合轨道');
  
  // 执行两个轨道的评测
  const mockSkill1 = {
    name: hybridSkill.name,
    path: './',
    execute: async (input) => `AI响应：${input}`
  };
  
  const mockSkill2 = {
    name: hybridSkill.name,
    path: './',
    execute: async (input) => {
      await new Promise(r => setTimeout(r, 5));
      return `功能执行：${input}`;
    }
  };
  
  const [aiResult, funcResult] = await Promise.all([
    aiEvaluator.evaluate(mockSkill1, [{ input: '测试' }]),
    funcEvaluator.evaluate(mockSkill2, [{ input: '测试' }])
  ]);
  
  assertTrue(aiResult.track === 'ai-effect', 'AI评测应该返回AI轨道');
  assertTrue(funcResult.track === 'functional-quality', '功能评测应该返回功能轨道');
});

// 打印测试报告
console.log('\n' + '='.repeat(50));
console.log('📊 测试报告');
console.log('='.repeat(50));
console.log(`总测试数: ${stats.passed + stats.failed}`);
console.log(`✅ 通过: ${stats.passed}`);
console.log(`❌ 失败: ${stats.failed}`);
console.log(`通过率: ${Math.round((stats.passed / (stats.passed + stats.failed)) * 100)}%`);

if (stats.failed === 0) {
  console.log('\n🎉 所有测试通过！双轨运营系统就绪！');
  process.exit(0);
} else {
  console.log('\n⚠️ 部分测试失败，请检查实现');
  process.exit(1);
}
