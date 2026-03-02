#!/usr/bin/env node
/**
 * run-dual-track-demo.cjs - 双轨运营系统演示
 */

const { TrackSelector, TRACKS } = require('./selector.cjs');
const { AIEffectEvaluator } = require('./ai-effect-evaluator.cjs');
const { FunctionQualityEvaluator } = require('./function-quality-evaluator.cjs');

console.log('='.repeat(60));
console.log('🎯 AEO Phase 2 - 双轨运营系统演示');
console.log('='.repeat(60));

async function runDemo() {
  const selector = new TrackSelector();
  
  // 场景1: AI聊天技能
  console.log('\n📌 场景1: AI聊天技能 (AI效果轨道)');
  console.log('-'.repeat(60));
  
  const aiSkillInfo = {
    name: 'smart-chat-assistant',
    type: 'llm',
    description: '智能对话助手，能够理解用户意图并提供有用的回答'
  };
  
  const aiSelection = selector.select(aiSkillInfo);
  console.log(`技能名称: ${aiSelection.skillName}`);
  console.log(`选择轨道: ${aiSelection.track}`);
  console.log(`轨道名称: ${aiSelection.config.name}`);
  console.log(`置信度: ${(aiSelection.confidence * 100).toFixed(1)}%`);
  console.log(`原因: ${aiSelection.reason}`);
  
  // 执行AI效果评测
  const aiEvaluator = new AIEffectEvaluator();
  const mockAISkill = {
    name: aiSkillInfo.name,
    path: './',
    execute: async (input) => {
      // 模拟高质量AI回复
      const responses = [
        `这是一个有用的回答：${input}`,
        `根据您的问题，我建议：${input}`,
        `以下是详细解释：${input}`
      ];
      return responses[Math.floor(Math.random() * responses.length)];
    }
  };
  
  const aiTestCases = [
    { input: '你好，请介绍一下自己', expected: '友好的自我介绍' },
    { input: '帮我写一段产品介绍', expected: '专业的产品描述' }
  ];
  
  const aiResult = await aiEvaluator.evaluate(mockAISkill, aiTestCases);
  console.log(`\n评测结果:`);
  console.log(`  总分: ${aiResult.overallScore}`);
  console.log(`  状态: ${aiResult.passed ? '✅ 通过' : '❌ 未通过'}`);
  console.log(`  维度得分:`);
  Object.entries(aiResult.dimensionScores).forEach(([dim, score]) => {
    const passed = score.passed ? '✅' : '❌';
    console.log(`    ${passed} ${dim}: ${score.score}`);
  });
  
  // 场景2: 数据处理工具
  console.log('\n\n📌 场景2: API数据获取工具 (功能质量轨道)');
  console.log('-'.repeat(60));
  
  const toolSkillInfo = {
    name: 'api-data-fetcher',
    type: 'tool',
    description: '自动化API数据获取和处理工具'
  };
  
  const toolSelection = selector.select(toolSkillInfo);
  console.log(`技能名称: ${toolSelection.skillName}`);
  console.log(`选择轨道: ${toolSelection.track}`);
  console.log(`轨道名称: ${toolSelection.config.name}`);
  console.log(`置信度: ${(toolSelection.confidence * 100).toFixed(1)}%`);
  console.log(`原因: ${toolSelection.reason}`);
  
  // 执行功能质量评测
  const funcEvaluator = new FunctionQualityEvaluator({ iterations: 3 });
  const mockToolSkill = {
    name: toolSkillInfo.name,
    path: './',
    execute: async (input) => {
      // 模拟API调用
      await new Promise(r => setTimeout(r, Math.random() * 20 + 5));
      return JSON.stringify({ success: true, data: { input, timestamp: Date.now() } });
    }
  };
  
  const toolTestCases = [
    { input: 'https://api.example.com/data1', expected: 'success' },
    { input: 'https://api.example.com/data2', expected: 'success' }
  ];
  
  const funcResult = await funcEvaluator.evaluate(mockToolSkill, toolTestCases);
  console.log(`\n评测结果:`);
  console.log(`  总分: ${funcResult.overallScore}`);
  console.log(`  状态: ${funcResult.passed ? '✅ 通过' : '❌ 未通过'}`);
  console.log(`  维度得分:`);
  Object.entries(funcResult.dimensionScores).forEach(([dim, score]) => {
    const passed = score.passed ? '✅' : '❌';
    console.log(`    ${passed} ${dim}: ${score.score}`);
  });
  console.log(`  性能数据:`);
  console.log(`    平均响应: ${funcResult.performanceReport.responseTimeStats.avg}ms`);
  console.log(`    P95响应: ${funcResult.performanceReport.responseTimeStats.p95}ms`);
  
  // 场景3: 混合类型技能
  console.log('\n\n📌 场景3: 智能工作流代理 (混合轨道)');
  console.log('-'.repeat(60));
  
  const hybridSkillInfo = {
    name: 'intelligent-workflow-agent',
    type: 'agent',
    description: '结合AI决策和自动化执行的工作流代理'
  };
  
  const hybridSelection = selector.select(hybridSkillInfo);
  console.log(`技能名称: ${hybridSelection.skillName}`);
  console.log(`选择轨道: ${hybridSelection.track}`);
  console.log(`轨道名称: ${hybridSelection.config.name}`);
  console.log(`主轨道: ${hybridSelection.hybridConfig?.primaryTrack || 'ai-effect'}`);
  console.log(`次轨道: ${hybridSelection.hybridConfig?.secondaryTrack || 'functional-quality'}`);
  console.log(`权重比: ${(hybridSelection.hybridConfig?.weightRatio || 0.6) * 100}% : ${(1 - (hybridSelection.hybridConfig?.weightRatio || 0.6)) * 100}%`);
  
  // 统计
  console.log('\n' + '='.repeat(60));
  console.log('📊 选择统计');
  console.log('='.repeat(60));
  const stats = selector.getStats();
  console.log(`总选择次数: ${stats.total}`);
  Object.entries(stats.byTrack).forEach(([track, count]) => {
    console.log(`  ${track}: ${count}次`);
  });
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ 双轨运营系统演示完成!');
  console.log('='.repeat(60));
}

runDemo().catch(console.error);
