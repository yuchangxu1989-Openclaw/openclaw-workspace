/**
 * 灰度路由器测试
 * @description 测试gradual-router.js的核心功能
 */

const path = require('path');

// 设置测试环境
const PROJECT_ROOT = path.join(__dirname, '..', '..', '..');
process.chdir(PROJECT_ROOT);

console.log('🧪 灰度路由器测试开始...\n');

// 测试计数器
let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  ✓ ${name}`);
        testsPassed++;
    } catch (err) {
        console.log(`  ✗ ${name}`);
        console.log(`    Error: ${err.message}`);
        testsFailed++;
    }
}

function assertEqual(actual, expected, msg) {
    if (actual !== expected) {
        throw new Error(`${msg || 'Assertion failed'}: expected ${expected}, got ${actual}`);
    }
}

function assertTrue(value, msg) {
    if (!value) {
        throw new Error(msg || 'Expected true');
    }
}

// 加载路由器
const gradualRouter = require(path.join(__dirname, '..', 'gradual-router.js'));

console.log('📦 加载模块测试...');
test('gradual-router模块加载成功', () => {
    assertTrue(gradualRouter, 'Module should be loaded');
    assertTrue(typeof gradualRouter.routeAndExecute === 'function', 'routeAndExecute should be a function');
});

test('配置API可用', () => {
    assertTrue(typeof gradualRouter.getConfig === 'function', 'getConfig should be a function');
    assertTrue(typeof gradualRouter.setPercentage === 'function', 'setPercentage should be a function');
});

test('熔断器API可用', () => {
    assertTrue(typeof gradualRouter.emergencyStop === 'function', 'emergencyStop should be a function');
    assertTrue(typeof gradualRouter.resetCircuitBreaker === 'function', 'resetCircuitBreaker should be a function');
    assertTrue(typeof gradualRouter.getCircuitBreakerState === 'function', 'getCircuitBreakerState should be a function');
});

test('指标API可用', () => {
    assertTrue(typeof gradualRouter.getMetrics === 'function', 'getMetrics should be a function');
    assertTrue(typeof gradualRouter.resetMetrics === 'function', 'resetMetrics should be a function');
});

console.log('\n⚙️ 决策逻辑测试...');
test('白名单检查', () => {
    gradualRouter.addToWhitelist('test-agent');
    const decision = gradualRouter.shouldUseFullVersion('test-agent');
    assertEqual(decision.useFull, true, 'Whitelisted agent should use full version');
    assertEqual(decision.reason, 'whitelist', 'Reason should be whitelist');
    gradualRouter.removeFromWhitelist('test-agent');
});

test('黑名单检查', () => {
    gradualRouter.addToBlacklist('blocked-agent');
    const decision = gradualRouter.shouldUseFullVersion('blocked-agent');
    assertEqual(decision.useFull, false, 'Blacklisted agent should not use full version');
    assertEqual(decision.reason, 'blacklist', 'Reason should be blacklist');
    gradualRouter.removeFromBlacklist('blocked-agent');
});

test('百分比决策 (0%)', () => {
    gradualRouter.setPercentage(0);
    const decision = gradualRouter.shouldUseFullVersion('random-agent');
    assertEqual(decision.useFull, false, 'With 0% no agent should use full version');
});

test('百分比决策 (100%)', () => {
    gradualRouter.setPercentage(100);
    const decision = gradualRouter.shouldUseFullVersion('random-agent');
    assertEqual(decision.useFull, true, 'With 100% all agents should use full version');
});

console.log('\n📊 配置管理测试...');
test('设置灰度比例', () => {
    const result = gradualRouter.setPercentage(50);
    assertEqual(result.percentage, 50, 'Percentage should be set to 50');
    const config = gradualRouter.getConfig();
    assertEqual(config.percentage, 50, 'Config should reflect new percentage');
});

test('白名单管理', () => {
    gradualRouter.addToWhitelist('agent-1');
    gradualRouter.addToWhitelist('agent-2');
    let config = gradualRouter.getConfig();
    assertTrue(config.whitelist.includes('agent-1'), 'agent-1 should be in whitelist');
    assertTrue(config.whitelist.includes('agent-2'), 'agent-2 should be in whitelist');
    
    gradualRouter.removeFromWhitelist('agent-1');
    config = gradualRouter.getConfig();
    assertEqual(config.whitelist.includes('agent-1'), false, 'agent-1 should be removed from whitelist');
    
    gradualRouter.removeFromWhitelist('agent-2');
});

test('黑名单管理', () => {
    gradualRouter.addToBlacklist('bad-agent');
    let config = gradualRouter.getConfig();
    assertTrue(config.blacklist.includes('bad-agent'), 'bad-agent should be in blacklist');
    
    gradualRouter.removeFromBlacklist('bad-agent');
    config = gradualRouter.getConfig();
    assertEqual(config.blacklist.includes('bad-agent'), false, 'bad-agent should be removed from blacklist');
});

console.log('\n🔥 熔断器测试...');
test('熔断器状态获取', () => {
    const state = gradualRouter.getCircuitBreakerState();
    assertTrue(typeof state.isOpen === 'boolean', 'isOpen should be boolean');
});

test('熔断器重置', () => {
    gradualRouter.resetCircuitBreaker();
    const state = gradualRouter.getCircuitBreakerState();
    assertEqual(state.isOpen, false, 'Circuit breaker should be closed after reset');
    assertEqual(state.consecutiveErrors, 0, 'Consecutive errors should be reset');
});

test('紧急停止', () => {
    gradualRouter.setPercentage(100);
    const result = gradualRouter.emergencyStop();
    assertEqual(result.newPercentage, 0, 'Emergency stop should set percentage to 0');
    const config = gradualRouter.getConfig();
    assertEqual(config.percentage, 0, 'Config should be 0 after emergency stop');
});

console.log('\n📈 指标测试...');
test('获取指标', () => {
    const metrics = gradualRouter.getMetrics();
    assertTrue(metrics, 'Metrics should be returned');
    assertTrue(metrics.comparison, 'Comparison should exist');
    assertTrue(metrics.comparison.mvp, 'MVP metrics should exist');
    assertTrue(metrics.comparison.full, 'Full metrics should exist');
    assertTrue(typeof metrics.downgradeCount === 'number', 'Downgrade count should be number');
});

test('重置指标', () => {
    const result = gradualRouter.resetMetrics();
    assertEqual(result.reset, true, 'Reset should return true');
    const metrics = gradualRouter.getMetrics();
    assertEqual(metrics.comparison.mvp.requests, 0, 'MVP requests should be 0 after reset');
    assertEqual(metrics.comparison.full.requests, 0, 'Full requests should be 0 after reset');
});

console.log('\n🔧 健康检查测试...');
test('健康检查API', async () => {
    const health = await gradualRouter.healthCheck();
    assertTrue(health, 'Health check should return result');
    assertTrue(health.versions, 'Versions should be checked');
    assertTrue(health.versions.mvp, 'MVP version should be checked');
});

// 运行异步测试
(async () => {
    try {
        await test('健康检查完整', async () => {
            const health = await gradualRouter.healthCheck();
            assertEqual(health.versions.mvp.available, true, 'MVP should be available');
            assertTrue(['healthy', 'degraded', 'critical'].includes(health.overall), 'Overall status should be valid');
        });
    } catch (err) {
        console.log(`  ✗ 健康检查: ${err.message}`);
        testsFailed++;
    }
    
    // 测试结果汇总
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  测试完成: ${testsPassed} 通过, ${testsFailed} 失败`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    if (testsFailed > 0) {
        process.exit(1);
    }
    
    console.log('\n✅ 所有测试通过！');
})();
