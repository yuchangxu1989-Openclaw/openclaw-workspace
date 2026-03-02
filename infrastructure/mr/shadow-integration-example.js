/**
 * Shadow Tester 集成示例
 * 展示如何将影子测试器集成到现有的MVP路由调用中
 */

const { createMVPRouterWrapper, wrapRouteAndExecute, getShadowTester } = require('./shadow-tester.js');
const mvp = require('./mr-router.mvp.js');

// ============================================================================
// 使用方式1: 直接包装MVP模块
// ============================================================================
async function example1() {
    console.log('=== 示例1: 使用包装器 ===\n');
    
    // 创建包装后的MVP路由器
    const wrappedMVP = createMVPRouterWrapper(mvp);
    
    // 正常调用MVP路由（自动进行影子测试采样）
    const result = await wrappedMVP.routeAndExecute({
        description: '分析这段代码的性能问题',
        agentId: 'agent-code-reviewer',
        systemMessage: '你是一个代码审查助手'
    });
    
    console.log('MVP结果:', {
        intent: result.intent,
        usedModel: result.usedModel,
        status: result.status
    });
}

// ============================================================================
// 使用方式2: 包装单个函数
// ============================================================================
async function example2() {
    console.log('\n=== 示例2: 包装单个函数 ===\n');
    
    // 包装routeAndExecute函数
    const wrappedRoute = wrapRouteAndExecute(mvp.routeAndExecute);
    
    // 调用包装后的函数
    const result = await wrappedRoute({
        description: '解释这张图片的内容',
        agentId: 'agent-doc-writer',
        attachments: [{ type: 'image', mimeType: 'image/png', url: 'https://example.com/image.png' }]
    });
    
    console.log('MVP结果:', {
        intent: result.intent,
        usedModel: result.usedModel,
        status: result.status
    });
}

// ============================================================================
// 使用方式3: 手动调用（高级）
// ============================================================================
async function example3() {
    console.log('\n=== 示例3: 手动使用ShadowTester ===\n');
    
    const tester = getShadowTester();
    
    // 手动调用MVP
    const mvpResult = await mvp.routeAndExecute({
        description: '优化数据库查询',
        agentId: 'agent-code-reviewer'
    });
    
    console.log('直接MVP结果:', mvpResult.intent, mvpResult.usedModel);
    
    // 如果需要，手动触发影子测试
    if (tester.shouldSample()) {
        console.log('触发影子测试...');
        // 影子测试自动在后台执行
    }
}

// ============================================================================
// 查看报告示例
// ============================================================================
async function showReportExample() {
    console.log('\n=== 报告示例 ===\n');
    
    const tester = getShadowTester();
    const summary = tester.getSummary();
    
    console.log('当前统计:');
    console.log('  总请求数:', summary.totalRequests);
    console.log('  影子请求数:', summary.shadowRequests);
    console.log('  旁路成功率:', (summary.bypassSuccessRate * 100).toFixed(2) + '%');
    console.log('  意图一致性:', (summary.intentConsistency * 100).toFixed(2) + '%');
    console.log('  模型一致性:', (summary.modelSelectionConsistency * 100).toFixed(2) + '%');
}

// ============================================================================
// 模拟生产环境使用
// ============================================================================
async function simulateProduction() {
    console.log('\n=== 模拟生产环境 ===\n');
    
    const wrappedMVP = createMVPRouterWrapper(mvp);
    const requests = [
        { description: '分析代码架构', agentId: 'agent-code-reviewer' },
        { description: '生成API文档', agentId: 'agent-doc-writer' },
        { description: '识别图片中的文字', agentId: 'agent-doc-writer' },
        { description: '优化算法性能', agentId: 'agent-code-reviewer' },
        { description: '解释设计模式', agentId: 'agent-code-reviewer' }
    ];
    
    console.log('发送', requests.length, '个请求（1%采样率会触发影子测试）\n');
    
    for (const req of requests) {
        try {
            const result = await wrappedMVP.routeAndExecute(req);
            console.log('✓', req.description.slice(0, 20) + '...', '-', result.intent);
        } catch (error) {
            console.log('✗', req.description.slice(0, 20) + '...', '- 错误:', error.message);
        }
    }
    
    // 等待影子测试完成
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('\n影子测试报告已更新');
}

// ============================================================================
// 主函数
// ============================================================================
async function main() {
    console.log('========================================');
    console.log('Shadow Tester 集成示例');
    console.log('========================================\n');
    
    try {
        // 等待初始化
        await new Promise(resolve => setTimeout(resolve, 500));
        
        await example1();
        await example2();
        await example3();
        await showReportExample();
        await simulateProduction();
        
        console.log('\n========================================');
        console.log('所有示例执行完成');
        console.log('查看报告: cat shadow-test-report.json');
        console.log('========================================');
        
    } catch (error) {
        console.error('执行错误:', error);
    } finally {
        // 清理资源
        const tester = getShadowTester();
        tester.destroy();
    }
}

// 如果直接运行此文件
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { example1, example2, example3, simulateProduction };
