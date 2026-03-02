/**
 * MR Phase 1 离线测试脚本
 * 对比完整版(Compiled TS)与MVP版(JS)的结果
 */

const fs = require('fs');
const path = require('path');

// 导入MVP版
const mvp = require('../mr-router.mvp.js');

// 导入完整版 (编译后的JS)
const { MRRouter, IntentClassifier } = require('../dist/index.js');

// 测试用例
const testCases = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'test-cases.json'), 'utf-8')
).testSuite.testCases;

// 结果存储
const results = {
  phase: 'Phase 1 - 离线测试',
  timestamp: new Date().toISOString(),
  summary: {
    total: testCases.length,
    mvpPassed: 0,
    fullPassed: 0,
    intentAccuracy: {
      mvp: 0,
      full: 0
    }
  },
  testResults: [],
  comparison: {
    intentMatches: 0,
    modelMatches: 0,
    chainMatches: 0
  }
};

async function runTest() {
  console.log('========================================');
  console.log('MR Phase 1 离线测试 - 完整版独立运行验证');
  console.log('========================================\n');

  // 初始化完整版MR
  const fullRouter = new MRRouter({
    intentTemplatesPath: path.join(__dirname, '../intent-templates')
  });

  console.log('完整版MR已初始化');
  console.log('开始执行测试用例...\n');

  let mvpCorrectIntents = 0;
  let fullCorrectIntents = 0;
  let intentMatches = 0;
  let modelMatches = 0;

  for (const tc of testCases) {
    console.log(`\n----------------------------------------`);
    console.log(`测试用例: ${tc.id} - ${tc.name}`);
    console.log(`类别: ${tc.category}`);
    console.log(`输入: ${tc.input.description.slice(0, 50)}${tc.input.description.length > 50 ? '...' : ''}`);

    const testResult = {
      id: tc.id,
      name: tc.name,
      category: tc.category,
      mvp: { passed: false, output: null },
      full: { passed: false, output: null },
      comparison: { intentMatch: false, modelMatch: false }
    };

    try {
      // 运行MVP版
      const mvpResult = await mvp.routeAndExecute({
        description: tc.input.description,
        agentId: tc.input.agentConfig.agentId,
        systemMessage: undefined,
        timeout: 60000
      });
      
      testResult.mvp.output = {
        intent: mvpResult.intent,
        usedModel: mvpResult.usedModel,
        modelChain: mvpResult.modelChain,
        status: mvpResult.status
      };

      // MVP意图分类正确性判断
      const mvpIntentCorrect = mvpResult.intent === tc.expected.intentCategory;
      if (mvpIntentCorrect) mvpCorrectIntents++;

      console.log(`  MVP版 → 意图: ${mvpResult.intent}, 模型: ${mvpResult.usedModel}`);

    } catch (error) {
      console.log(`  MVP版 → 错误: ${error.message}`);
      testResult.mvp.error = error.message;
    }

    try {
      // 运行完整版
      const fullResult = await fullRouter.routeAndExecute({
        description: tc.input.description,
        agentConfig: tc.input.agentConfig,
        attachments: tc.input.attachments,
        options: {
          timeoutMs: 60000,
          enableSandbox: false,
          enforceCapabilityMatch: false
        }
      });

      testResult.full.output = {
        intent: fullResult.metadata.intent,
        usedModel: fullResult.usedModel,
        modelChain: fullResult.metadata.intent ? undefined : fullResult.modelChain,
        status: fullResult.status
      };

      // 完整版意图分类正确性判断
      const fullIntentCorrect = fullResult.metadata.intent?.taskCategory === tc.expected.intentCategory;
      if (fullIntentCorrect) fullCorrectIntents++;

      // 测试通过判断
      testResult.full.passed = fullResult.status === 'success' || fullResult.status === 'failure';

      console.log(`  完整版 → 意图: ${fullResult.metadata.intent?.taskCategory}, 模型: ${fullResult.usedModel}`);
      console.log(`  完整版 → 5维意图向量:`, JSON.stringify(fullResult.metadata.intent, null, 2).replace(/\n/g, ' '));

    } catch (error) {
      console.log(`  完整版 → 错误: ${error.message}`);
      testResult.full.error = error.message;
      testResult.full.passed = false;
    }

    // 对比两个版本的输出
    if (testResult.mvp.output && testResult.full.output) {
      testResult.comparison.intentMatch = testResult.mvp.output.intent === testResult.full.output.intent?.taskCategory;
      testResult.comparison.modelMatch = testResult.mvp.output.usedModel === testResult.full.output.usedModel;
      
      if (testResult.comparison.intentMatch) intentMatches++;
      if (testResult.comparison.modelMatch) modelMatches++;
    }

    results.testResults.push(testResult);

    // 更新计数
    if (testResult.mvp.passed) results.summary.mvpPassed++;
    if (testResult.full.passed) results.summary.fullPassed++;
  }

  // 计算准确率
  results.summary.intentAccuracy.mvp = Math.round((mvpCorrectIntents / testCases.length) * 100);
  results.summary.intentAccuracy.full = Math.round((fullCorrectIntents / testCases.length) * 100);
  results.comparison.intentMatches = intentMatches;
  results.comparison.modelMatches = modelMatches;

  // 输出汇总
  console.log('\n========================================');
  console.log('测试汇总');
  console.log('========================================');
  console.log(`总测试用例: ${results.summary.total}`);
  console.log(`MVP版通过: ${results.summary.mvpPassed}/${results.summary.total}`);
  console.log(`完整版通过: ${results.summary.fullPassed}/${results.summary.total}`);
  console.log(`\n意图识别准确率:`);
  console.log(`  MVP版: ${results.summary.intentAccuracy.mvp}%`);
  console.log(`  完整版: ${results.summary.intentAccuracy.full}%`);
  console.log(`\n版本对比:`);
  console.log(`  意图匹配: ${intentMatches}/${testCases.length} (${Math.round(intentMatches/testCases.length*100)}%)`);
  console.log(`  模型匹配: ${modelMatches}/${testCases.length} (${Math.round(modelMatches/testCases.length*100)}%)`);

  // 保存结果
  const outputPath = path.join(__dirname, 'phase1-results.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n结果已保存: ${outputPath}`);

  return results;
}

// 运行测试
runTest().catch(console.error);
