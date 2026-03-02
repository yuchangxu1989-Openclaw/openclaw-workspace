#!/usr/bin/env node
/**
 * APIAggregator 并行调用测试脚本
 * 测试目标：并行调用3个httpbin.org/get请求，验证并行执行能力
 */

const APIAggregator = require('./index.js');

async function runTest() {
  console.log('========================================');
  console.log('APIAggregator 并行调用测试');
  console.log('========================================\n');

  const aggregator = new APIAggregator({
    timeout: 10000,  // 10秒超时
    maxConcurrency: 5
  });

  // 准备3个并行请求
  const requests = [
    { url: 'https://httpbin.org/get?id=1', method: 'GET' },
    { url: 'https://httpbin.org/get?id=2', method: 'GET' },
    { url: 'https://httpbin.org/get?id=3', method: 'GET' }
  ];

  const startTime = Date.now();
  
  try {
    console.log('开始并行调用3个API请求...\n');
    
    const result = await aggregator.parallel(requests);
    
    const totalTime = Date.now() - startTime;
    
    console.log('\n========================================');
    console.log('测试结果');
    console.log('========================================');
    console.log(`总耗时: ${totalTime}ms`);
    console.log(`成功: ${result.summary.success}/${result.summary.total}`);
    console.log(`失败: ${result.summary.failed}/${result.summary.total}`);
    
    // 验证是否真正并行（如果串行，耗时应该 > 3秒）
    const isParallel = totalTime < 2000; // httpbin响应通常在几百ms
    console.log(`\n并行执行验证: ${isParallel ? '✅ 通过（并行）' : '⚠️ 可能串行'}`);
    
    console.log('\n--- 详细结果 ---');
    result.results.forEach((r, i) => {
      console.log(`\n请求 ${i + 1}:`);
      console.log(`  URL: ${r.request.url}`);
      console.log(`  状态: ${r.status === 'fulfilled' ? '✅ 成功' : '❌ 失败'}`);
      if (r.status === 'fulfilled' && r.data) {
        console.log(`  响应: origin=${r.data.origin}, url=${r.data.url}`);
      } else if (r.error) {
        console.log(`  错误: ${r.error}`);
      }
    });

    console.log('\n========================================');
    console.log(`测试结论: ${result.summary.success === 3 ? '✅ 成功' : '❌ 失败'}`);
    console.log('========================================');
    
    return {
      success: result.summary.success === 3,
      totalTime,
      summary: result.summary,
      isParallel
    };
    
  } catch (err) {
    console.error('测试执行异常:', err.message);
    return { success: false, error: err.message };
  }
}

// 运行测试
runTest().then(result => {
  process.exit(result.success ? 0 : 1);
}).catch(err => {
  console.error('测试失败:', err);
  process.exit(1);
});
