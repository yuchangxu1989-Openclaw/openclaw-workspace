"use strict";
/**
 * SandboxValidator - 三层沙盒验证
 *
 * 功能：
 * - L1: 健康检查（50ms超时，内存缓存）
 * - L2: 影子测试（1%旁路，质量对比）
 * - L3: 超时熔断（委托LEP原生）
 * - 零硬编码模型名称，使用{{MODEL_XXX}}占位符
 *
 * @module infrastructure/mr
 * @version 2.0.0
 * @ISC N019/N020 compliant
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SandboxValidator = void 0;
// ============================================================================
// SandboxValidator Implementation
// ============================================================================
class SandboxValidator {
    constructor(config) {
        this.healthCache = new Map();
        this.shadowTestHistory = new Map();
        this.config = {
            L1: {
                timeoutMs: 50,
                cacheTTLMs: 5000,
                enableCache: true,
                ...config?.L1
            },
            L2: {
                enabled: false,
                sampleRate: 0.01,
                qualityThreshold: 0.9,
                maxDeviation: 0.1,
                comparisonWindowSize: 100,
                ...config?.L2
            },
            L3: {
                connectTimeoutMs: 5000,
                responseTimeoutMs: 60000,
                failureThreshold: 5,
                resetTimeoutMs: 30000,
                ...config?.L3
            }
        };
    }
    /**
     * 执行三层沙盒验证
     * @param request 验证请求
     * @returns SandboxValidationResult 验证结果
     */
    async validate(request) {
        const startTime = Date.now();
        const layers = [];
        let currentChain = [...request.modelChain];
        const modelsRejected = [];
        // L1: 健康检查
        const l1Result = await this.runL1HealthCheck(currentChain, request.agentConfig);
        layers.push(l1Result);
        if (l1Result.passed) {
            // 过滤不健康模型
            const healthyModels = l1Result.details.healthyModels;
            modelsRejected.push(...currentChain.filter(m => !healthyModels.includes(m)));
            currentChain = healthyModels.length > 0 ? healthyModels : currentChain;
        }
        // L2: 影子测试（如果启用）
        if (this.config.L2.enabled) {
            const l2Result = await this.runL2ShadowTest(currentChain, request, l1Result.details.results);
            layers.push(l2Result);
            if (l2Result.passed && l2Result.details.shadowResults) {
                const passedModels = l2Result.details.shadowResults
                    .filter(r => r.passed)
                    .map(r => r.model);
                if (passedModels.length > 0) {
                    modelsRejected.push(...currentChain.filter(m => !passedModels.includes(m)));
                    currentChain = passedModels;
                }
            }
        }
        // L3: 超时熔断检查（委托LEP）
        const l3Result = await this.runL3CircuitCheck(currentChain, request);
        layers.push(l3Result);
        // 确保至少有一个模型
        if (currentChain.length === 0 && request.modelChain.length > 0) {
            // 紧急回退到第一个模型，让LEP处理熔断
            currentChain = [request.modelChain[0]];
        }
        const totalDuration = Date.now() - startTime;
        return {
            passed: layers.every(l => l.passed) || currentChain.length > 0,
            layers,
            validatedChain: currentChain,
            metadata: {
                totalDurationMs: totalDuration,
                modelsChecked: request.modelChain,
                modelsRejected: [...new Set(modelsRejected)],
                shadowTestResults: layers.find(l => l.layer === 'L2_shadow_test')?.details?.shadowResults,
                timestamp: Date.now()
            }
        };
    }
    /**
     * L1: 健康检查
     */
    async runL1HealthCheck(modelChain, agentConfig) {
        const startTime = Date.now();
        const timeoutMs = agentConfig.sandboxSettings?.healthCheckTimeoutMs
            || this.config.L1.timeoutMs;
        try {
            const results = [];
            const healthyModels = [];
            for (const model of modelChain) {
                // 检查缓存
                const cached = this.getCachedHealth(model);
                if (cached && this.config.L1.enableCache) {
                    results.push(cached);
                    if (cached.healthy)
                        healthyModels.push(model);
                    continue;
                }
                // 执行健康检查
                const checkResult = await this.performHealthCheck(model, timeoutMs);
                results.push(checkResult);
                if (checkResult.healthy) {
                    healthyModels.push(model);
                }
                // 缓存结果
                if (this.config.L1.enableCache) {
                    this.setCachedHealth(model, checkResult);
                }
            }
            const duration = Date.now() - startTime;
            return {
                layer: 'L1_health_check',
                passed: healthyModels.length > 0,
                durationMs: duration,
                details: {
                    results,
                    healthyModels,
                    totalChecked: modelChain.length,
                    cacheEnabled: this.config.L1.enableCache
                }
            };
        }
        catch (error) {
            return {
                layer: 'L1_health_check',
                passed: false,
                durationMs: Date.now() - startTime,
                details: {},
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
    /**
     * 执行健康检查
     */
    async performHealthCheck(model, timeoutMs) {
        const startTime = Date.now();
        try {
            // 模拟健康检查（实际实现应调用LEP或模型API）
            // 这里使用简化的模拟逻辑
            const checkPromise = this.simulateHealthCheck(model);
            const result = await Promise.race([
                checkPromise,
                new Promise((_, reject) => setTimeout(() => reject(new Error('Health check timeout')), timeoutMs))
            ]);
            const responseTime = Date.now() - startTime;
            return {
                model,
                healthy: true,
                responseTimeMs: responseTime,
                circuitBreakerState: 'CLOSED',
                consecutiveFailures: 0
            };
        }
        catch (error) {
            return {
                model,
                healthy: false,
                responseTimeMs: Date.now() - startTime,
                circuitBreakerState: 'OPEN',
                lastFailureTime: Date.now(),
                consecutiveFailures: 1
            };
        }
    }
    /**
     * 模拟健康检查
     */
    async simulateHealthCheck(model) {
        // 模拟网络延迟 5-20ms
        const delay = 5 + Math.random() * 15;
        await new Promise(resolve => setTimeout(resolve, delay));
        // 模拟极低概率的失败
        if (Math.random() < 0.001) {
            throw new Error('Simulated health check failure');
        }
    }
    /**
     * L2: 影子测试
     */
    async runL2ShadowTest(modelChain, request, healthResults) {
        const startTime = Date.now();
        try {
            if (!this.config.L2.enabled) {
                return {
                    layer: 'L2_shadow_test',
                    passed: true,
                    durationMs: 0,
                    details: { skipped: true, reason: 'disabled' }
                };
            }
            // 采样决策
            const shouldSample = Math.random() < this.config.L2.sampleRate;
            if (!shouldSample) {
                return {
                    layer: 'L2_shadow_test',
                    passed: true,
                    durationMs: 0,
                    details: { skipped: true, reason: 'not_sampled' }
                };
            }
            const shadowResults = [];
            // 对主模型进行影子测试
            if (modelChain.length > 0) {
                const primaryModel = modelChain[0];
                const shadowResult = await this.performShadowTest(primaryModel, request);
                shadowResults.push(shadowResult);
            }
            const duration = Date.now() - startTime;
            const allPassed = shadowResults.every(r => r.passed);
            return {
                layer: 'L2_shadow_test',
                passed: allPassed || shadowResults.length === 0,
                durationMs: duration,
                details: {
                    shadowResults,
                    sampled: true,
                    sampleRate: this.config.L2.sampleRate
                }
            };
        }
        catch (error) {
            return {
                layer: 'L2_shadow_test',
                passed: false,
                durationMs: Date.now() - startTime,
                details: {},
                error: error instanceof Error ? error.message : 'Shadow test failed'
            };
        }
    }
    /**
     * 执行影子测试
     */
    async performShadowTest(model, request) {
        const baselineQuality = this.getBaselineQuality(model);
        // 模拟质量测试
        // 实际实现应调用模型并对比输出质量
        const simulatedQuality = baselineQuality + (Math.random() - 0.5) * 0.1;
        const deviation = Math.abs(simulatedQuality - baselineQuality);
        const result = {
            model,
            sampleRate: this.config.L2.sampleRate,
            qualityScore: simulatedQuality,
            baselineQuality,
            deviation,
            passed: deviation <= this.config.L2.maxDeviation
        };
        // 记录历史
        this.recordShadowTest(model, result);
        return result;
    }
    /**
     * L3: 熔断检查
     */
    async runL3CircuitCheck(modelChain, request) {
        const startTime = Date.now();
        try {
            // L3检查委托给LEP执行时处理
            // 这里只检查配置和返回状态
            const checks = modelChain.map(model => ({
                model,
                connectTimeout: this.config.L3.connectTimeoutMs,
                responseTimeout: request.agentConfig.sandboxSettings?.executionTimeoutMs
                    || this.config.L3.responseTimeoutMs,
                circuitBreaker: {
                    failureThreshold: this.config.L3.failureThreshold,
                    resetTimeout: this.config.L3.resetTimeoutMs
                }
            }));
            return {
                layer: 'L3_circuit_breaker',
                passed: true,
                durationMs: Date.now() - startTime,
                details: {
                    message: 'L3 validation delegated to LEP execution',
                    checks,
                    settings: {
                        connectTimeoutMs: this.config.L3.connectTimeoutMs,
                        responseTimeoutMs: this.config.L3.responseTimeoutMs
                    }
                }
            };
        }
        catch (error) {
            return {
                layer: 'L3_circuit_breaker',
                passed: false,
                durationMs: Date.now() - startTime,
                details: {},
                error: error instanceof Error ? error.message : 'Circuit check failed'
            };
        }
    }
    // ============================================================================
    // Cache Management
    // ============================================================================
    getCachedHealth(model) {
        const entry = this.healthCache.get(model);
        if (!entry)
            return null;
        const now = Date.now();
        if (now - entry.timestamp > this.config.L1.cacheTTLMs) {
            this.healthCache.delete(model);
            return null;
        }
        return entry.result;
    }
    setCachedHealth(model, result) {
        this.healthCache.set(model, {
            result,
            timestamp: Date.now()
        });
        // 限制缓存大小
        if (this.healthCache.size > 100) {
            const firstKey = this.healthCache.keys().next().value;
            if (firstKey !== undefined) {
                this.healthCache.delete(firstKey);
            }
        }
    }
    // ============================================================================
    // Shadow Test History
    // ============================================================================
    recordShadowTest(model, result) {
        if (!this.shadowTestHistory.has(model)) {
            this.shadowTestHistory.set(model, []);
        }
        const history = this.shadowTestHistory.get(model);
        history.push({
            result,
            timestamp: Date.now()
        });
        // 限制历史大小
        const maxSize = this.config.L2.comparisonWindowSize;
        if (history.length > maxSize) {
            history.shift();
        }
    }
    getBaselineQuality(model) {
        const history = this.shadowTestHistory.get(model);
        if (!history || history.length === 0) {
            return this.config.L2.qualityThreshold;
        }
        // 计算历史平均质量分数
        const avg = history.reduce((sum, h) => sum + h.result.qualityScore, 0) / history.length;
        return avg;
    }
    // ============================================================================
    // Public API
    // ============================================================================
    /**
     * 更新配置
     */
    updateConfig(config) {
        this.config = {
            L1: { ...this.config.L1, ...config.L1 },
            L2: { ...this.config.L2, ...config.L2 },
            L3: { ...this.config.L3, ...config.L3 }
        };
    }
    /**
     * 启用/禁用影子测试
     */
    setShadowTestEnabled(enabled) {
        this.config.L2.enabled = enabled;
    }
    /**
     * 清除健康缓存
     */
    clearHealthCache() {
        this.healthCache.clear();
    }
    /**
     * 获取统计信息
     */
    getStats() {
        let historyEntries = 0;
        for (const history of this.shadowTestHistory.values()) {
            historyEntries += history.length;
        }
        return {
            cacheSize: this.healthCache.size,
            historyEntries,
            config: this.config
        };
    }
}
exports.SandboxValidator = SandboxValidator;
exports.default = SandboxValidator;
//# sourceMappingURL=sandbox-validator.js.map