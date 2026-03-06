/**
 * Shadow Tester 测试脚本
 * 验证影子测试框架的功能
 */

const fs = require('fs');
const path = require('path');
const { ShadowTester, getShadowTester, wrapRouteAndExecute, createMVPRouterWrapper } = require('./shadow-tester.js');

// 测试结果
const testResults = {
  passed: 0,
  failed: 0,
  tests: []
};

function test(name, fn) {
  return new Promise(async (resolve) => {
    try {
      await fn();
      testResults.passed++;
      testResults.tests.push({ name, status: 'PASSED' });
      console.log(`  ✓ ${name}`);
      resolve();
    } catch (error) {
      testResults.failed++;
      testResults.tests.push({ name, status: 'FAILED', error: error.message });
      console.log(`  ✗ ${name}: ${error.message}`);
      resolve();
    }
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

// ============================================================================
// 测试套件
// ============================================================================

async function runTests() {
  console.log('========================================');
  console.log('Shadow Tester 测试套件');
  console.log('========================================\n');

  // 清理之前的报告
  const reportPath = path.join(__dirname, 'shadow-test-report.json');
  if (fs.existsSync(reportPath)) {
    fs.unlinkSync(reportPath);
  }

  // 测试1: 配置加载
  await test('应该正确加载配置文件', () => {
    const tester = new ShadowTester();
    assert(tester.config.enabled === true, '配置应该启用');
    assert(tester.config.sampleRate === 0.01, '采样率应该是1%');
    tester.destroy();
  });

  // 测试2: 采样逻辑
  await test('应该根据采样率正确采样', () => {
    const tester = new ShadowTester({ sampleRate: 1.0 }); // 100%采样
    let samples = 0;
    for (let i = 0; i < 10; i++) {
      if (tester.shouldSample()) samples++;
    }
    assert(samples === 10, '100%采样率应该采样所有请求');
    tester.destroy();
  });

  // 测试3: 熔断器
  await test('熔断器应该在连续失败后开启', () => {
    const tester = new ShadowTester({ 
      safety: { circuitBreaker: { failureThreshold: 3, resetTimeoutMs: 60000 } }
    });
    
    assert(!tester.stats.circuitOpen, '初始状态熔断器应该关闭');
    
    tester.recordFailure();
    tester.recordFailure();
    tester.recordFailure();
    
    assert(tester.stats.circuitOpen, '3次失败后熔断器应该开启');
    tester.destroy();
  });

  // 测试4: 请求ID生成
  await test('应该生成唯一的请求ID', () => {
    const tester = new ShadowTester();
    const id1 = tester.generateRequestId();
    const id2 = tester.generateRequestId();
    
    assert(id1 !== id2, '请求ID应该唯一');
    assert(id1.startsWith('shadow_'), '请求ID应该以shadow_开头');
    tester.destroy();
  });

  // 测试5: 结果对比
  await test('应该正确对比两个版本的结果', () => {
    const tester = new ShadowTester();
    
    const mvp = { intent: 'reasoning', modelChain: ['model-a'], duration: 100 };
    const full = { intent: 'reasoning', modelChain: ['model-a'], duration: 120 };
    
    const comparison = tester.compareResults(mvp, full);
    
    assert(comparison.match === true, '相同结果应该匹配');
    assert(comparison.severity === 'low', '相同结果应该是低严重性');
    
    const mvp2 = { intent: 'reasoning', modelChain: ['model-a'] };
    const full2 = { intent: 'general', modelChain: ['model-b'] };
    
    const comparison2 = tester.compareResults(mvp2, full2);
    
    assert(comparison2.match === false, '不同结果应该不匹配');
    assert(comparison2.severity === 'high', '模型链不匹配应该是高严重性');
    tester.destroy();
  });

  // 测试6: 超时处理
  await test('应该正确处理超时', async () => {
    const tester = new ShadowTester();
    
    const slowFn = () => new Promise(resolve => setTimeout(resolve, 2000));
    
    try {
      await tester.executeWithTimeout(slowFn, 100);
      assert(false, '应该抛出超时错误');
    } catch (error) {
      assert(error.message.includes('timeout'), '错误应该是超时');
    }
    tester.destroy();
  });

  // 测试7: 统计摘要
  await test('应该正确计算统计摘要', () => {
    const tester = new ShadowTester();
    
    tester.stats.shadowRequests = 100;
    tester.stats.bypassSuccess = 95;
    tester.stats.intentMatches = 92;
    tester.stats.modelMatches = 96;
    
    const summary = tester.getSummary();
    
    assert(summary.bypassSuccessRate === 0.95, '成功率应该是95%');
    assert(summary.intentConsistency === 0.92, '意图一致性应该是92%');
    assert(summary.modelSelectionConsistency === 0.96, '模型一致性应该是96%');
    tester.destroy();
  });

  // 测试8: 报告生成
  await test('应该生成正确的报告格式', async () => {
    const tester = new ShadowTester();
    
    const report = {
      requestId: 'test_123',
      timestamp: new Date().toISOString(),
      input: '测试输入',
      mvpResult: { intent: 'reasoning', modelChain: ['a'], duration: 100 },
      fullResult: { intent: 'reasoning', modelChain: ['a'], duration: 110 },
      match: true,
      diff: [],
      severity: 'low'
    };
    
    tester.addReport(report);
    
    assert(tester.reports.length === 1, '报告应该被添加');
    assert(tester.reports[0].requestId === 'test_123', '报告ID应该正确');
    tester.destroy();
  });

  // 测试9: MVP包装器
  await test('应该正确包装MVP路由', async () => {
    const mvpMock = {
      routeAndExecute: async (req) => ({
        intent: 'reasoning',
        usedModel: 'model-a',
        modelChain: ['model-a'],
        status: 'success'
      }),
      classifyIntent: (desc) => 'reasoning'
    };
    
    const wrapped = createMVPRouterWrapper(mvpMock, { sampleRate: 0 });
    
    const result = await wrapped.routeAndExecute({
      description: '测试描述',
      agentId: 'test-agent'
    });
    
    assert(result.intent === 'reasoning', '应该返回正确的意图');
    assert(result.usedModel === 'model-a', '应该返回正确的模型');
  });

  // 测试10: 安全隔离
  await test('影子测试失败不应该影响主流程', async () => {
    const mvpMock = {
      routeAndExecute: async (req) => ({
        intent: 'general',
        usedModel: 'model-b',
        status: 'success'
      })
    };
    
    // 创建一个会失败的完整版
    const tester = new ShadowTester({ sampleRate: 1.0 });
    tester.fullRouter = {
      routeAndExecute: async () => { throw new Error('模拟失败'); }
    };
    
    let mainFlowCompleted = false;
    
    try {
      await tester.wrapMVPRoute(
        async () => {
          mainFlowCompleted = true;
          return { intent: 'general', usedModel: 'model-b', status: 'success' };
        },
        { description: '测试' }
      );
    } catch (error) {
      // 主流程不应该抛出错误
    }
    
    // 等待异步影子测试
    await new Promise(resolve => setTimeout(resolve, 100));
    
    assert(mainFlowCompleted, '主流程应该完成');
    tester.destroy();
  });

  // 测试11: 报告文件写入
  await test('应该将报告写入文件', async () => {
    const tester = new ShadowTester({ 
      reporting: { outputPath: reportPath, maxReportsInMemory: 10 }
    });
    
    tester.addReport({
      requestId: 'file_test',
      timestamp: new Date().toISOString(),
      match: true,
      diff: [],
      severity: 'low'
    });
    
    // 等待文件写入
    await new Promise(resolve => setTimeout(resolve, 100));
    
    assert(fs.existsSync(reportPath), '报告文件应该存在');
    
    const content = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
    assert(content.reports.length >= 1, '报告应该被写入');
    tester.destroy();
  });

  // 汇总
  console.log('\n========================================');
  console.log('测试结果汇总');
  console.log('========================================');
  console.log(`总测试: ${testResults.passed + testResults.failed}`);
  console.log(`通过: ${testResults.passed}`);
  console.log(`失败: ${testResults.failed}`);
  console.log(`通过率: ${Math.round((testResults.passed / (testResults.passed + testResults.failed)) * 100)}%`);
  
  if (testResults.failed > 0) {
    console.log('\n失败的测试:');
    testResults.tests.filter(t => t.status === 'FAILED').forEach(t => {
      console.log(`  - ${t.name}: ${t.error}`);
    });
  }

  // 清理
  if (fs.existsSync(reportPath)) {
    fs.unlinkSync(reportPath);
  }

  return testResults;
}

// 运行测试
runTests().catch(console.error);
