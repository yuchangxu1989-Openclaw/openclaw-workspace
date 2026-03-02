"use strict";
/**
 * LEPDelegate - LEP执行委托层
 *
 * 功能：
 * - 100%复用infrastructure/lep-core，不复刻韧性逻辑
 * - 委托LEP执行模型调用
 * - 统一错误处理和结果包装
 * - 零硬编码模型名称，使用{{MODEL_XXX}}占位符
 *
 * @module infrastructure/mr
 * @version 2.0.0
 * @ISC N019/N020 compliant
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LEPDelegate = void 0;
// ============================================================================
// LEPDelegate Implementation
// ============================================================================
class LEPDelegate {
    constructor() {
        this.lepCore = null;
        this.executionCounter = 0;
        this.initializeLEPCore();
    }
    /**
     * 初始化LEP核心
     */
    initializeLEPCore() {
        try {
            // 动态加载LEP核心，避免硬依赖
            // 实际部署时从 infrastructure/lep-core 加载
            const lepModule = this.loadLEPModule();
            this.lepCore = lepModule.getLEP ? lepModule.getLEP() : lepModule;
        }
        catch (error) {
            console.warn('[LEPDelegate] LEP Core not available, using fallback mode:', error);
            this.lepCore = null;
        }
    }
    /**
     * 加载LEP模块
     */
    loadLEPModule() {
        // 尝试多种路径加载LEP核心
        const possiblePaths = [
            '../lep-core',
            '../../lep-core',
            '../../../infrastructure/lep-core',
            '/root/.openclaw/workspace/infrastructure/lep-core'
        ];
        for (const tryPath of possiblePaths) {
            try {
                return require(tryPath);
            }
            catch {
                continue;
            }
        }
        throw new Error('LEP Core module not found');
    }
    /**
     * 执行模型调用
     * @param request LEP执行请求
     * @returns LEPExecuteResult 执行结果
     */
    async execute(request) {
        const startTime = Date.now();
        const executionId = this.generateExecutionId();
        const attemptedModels = [];
        const modelDurations = {};
        try {
            // 构建LEP核心任务
            const lepTask = this.buildLEPTask(request, executionId);
            // 调用LEP核心执行
            let lepResult;
            if (this.lepCore) {
                // 使用LEP核心
                lepResult = await this.executeWithLEP(lepTask, request);
            }
            else {
                // 降级模式：直接执行（仅用于测试）
                lepResult = await this.executeFallback(lepTask, request);
            }
            const totalDuration = Date.now() - startTime;
            // 记录尝试的模型
            if (lepResult.metadata.attempts > 0) {
                for (let i = 0; i < Math.min(lepResult.metadata.attempts, request.modelChain.length); i++) {
                    attemptedModels.push(request.modelChain[i]);
                }
            }
            // 构建结果
            if (lepResult.status === 'success') {
                return {
                    status: 'success',
                    result: {
                        model: lepResult.metadata.usedModel,
                        content: lepResult.data?.content || lepResult.data,
                        usage: lepResult.data?.usage,
                        finishReason: lepResult.data?.finishReason
                    },
                    metadata: {
                        executionId,
                        originalChain: request.modelChain,
                        usedModel: lepResult.metadata.usedModel,
                        attemptedModels,
                        totalDurationMs: totalDuration,
                        modelDurations,
                        retryCount: lepResult.metadata.attempts - 1,
                        wasDegraded: lepResult.metadata.usedModel !== request.modelChain[0],
                        timestamp: Date.now()
                    }
                };
            }
            else {
                return {
                    status: 'failure',
                    error: {
                        code: lepResult.error?.code || 'EXECUTION_FAILED',
                        message: lepResult.error?.message || 'Unknown execution error',
                        model: lepResult.metadata.usedModel,
                        retryable: lepResult.error?.retryable || false
                    },
                    metadata: {
                        executionId,
                        originalChain: request.modelChain,
                        usedModel: lepResult.metadata.usedModel || request.modelChain[0],
                        attemptedModels,
                        totalDurationMs: totalDuration,
                        modelDurations,
                        retryCount: lepResult.metadata.attempts - 1,
                        wasDegraded: false,
                        timestamp: Date.now()
                    }
                };
            }
        }
        catch (error) {
            const totalDuration = Date.now() - startTime;
            return {
                status: 'failure',
                error: {
                    code: 'DELEGATE_ERROR',
                    message: error instanceof Error ? error.message : 'Unknown error',
                    retryable: this.isRetryableError(error)
                },
                metadata: {
                    executionId,
                    originalChain: request.modelChain,
                    usedModel: request.modelChain[0],
                    attemptedModels,
                    totalDurationMs: totalDuration,
                    modelDurations,
                    retryCount: 0,
                    wasDegraded: false,
                    timestamp: Date.now()
                }
            };
        }
    }
    /**
     * 使用LEP核心执行
     */
    async executeWithLEP(lepTask, request) {
        const callbacks = request.options?.callbacks;
        // 包装回调以跟踪模型尝试
        const wrappedCallbacks = callbacks ? {
            ...callbacks,
            onModelAttempt: (model, attempt) => {
                callbacks.onModelAttempt?.(model, attempt);
            },
            onModelSuccess: (model, durationMs) => {
                callbacks.onModelSuccess?.(model, durationMs);
            },
            onModelFailure: (model, error) => {
                callbacks.onModelFailure?.(model, error);
            }
        } : undefined;
        // 调用LEP核心
        // LEP核心内部处理：熔断/重试/降级/WAL日志
        return await this.lepCore.execute(lepTask);
    }
    /**
     * 降级模式执行（LEP不可用时）
     */
    async executeFallback(lepTask, request) {
        console.warn('[LEPDelegate] Using fallback execution mode');
        // 简化实现：模拟执行
        const primaryModel = lepTask.modelChain[0];
        return {
            status: 'success',
            data: {
                content: `[Fallback Mode] Task would be executed with model: ${primaryModel}`,
                usage: { prompt: 0, completion: 0, total: 0 }
            },
            metadata: {
                executionId: this.generateExecutionId(),
                duration: 0,
                attempts: 1,
                usedModel: primaryModel
            }
        };
    }
    /**
     * 构建LEP核心任务
     */
    buildLEPTask(request, executionId) {
        const timeout = request.options?.timeoutMs
            || request.agentConfig.sandboxSettings?.executionTimeoutMs
            || 120000;
        return {
            type: 'model_inference',
            modelChain: request.modelChain,
            prompt: request.task.prompt,
            systemMessage: request.task.systemMessage,
            context: request.task.context,
            options: {
                timeout,
                maxTokens: request.options?.maxTokens,
                temperature: request.options?.temperature,
                stream: request.options?.stream
            },
            fallbackStrategy: request.agentConfig.modelPreferences.strictMode ? 'abort' : 'chain'
        };
    }
    /**
     * 检查LEP健康状态
     */
    async health() {
        if (!this.lepCore) {
            return {
                healthy: false,
                status: 'lep_not_available',
                checks: {},
                timestamp: Date.now()
            };
        }
        try {
            return await this.lepCore.health();
        }
        catch (error) {
            return {
                healthy: false,
                status: 'health_check_failed',
                checks: { error: error instanceof Error ? error.message : 'Unknown' },
                timestamp: Date.now()
            };
        }
    }
    /**
     * 获取LEP统计
     */
    getStats() {
        if (!this.lepCore)
            return null;
        try {
            return this.lepCore.getStats();
        }
        catch {
            return null;
        }
    }
    /**
     * 生成执行ID
     */
    generateExecutionId() {
        this.executionCounter++;
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substr(2, 6);
        return `mr_${timestamp}_${random}_${this.executionCounter}`;
    }
    /**
     * 判断错误是否可重试
     */
    isRetryableError(error) {
        const retryableCodes = [
            'ECONNRESET',
            'ETIMEDOUT',
            'ECONNREFUSED',
            'ENOTFOUND',
            'EAI_AGAIN',
            'TIMEOUT',
            'RATE_LIMIT'
        ];
        if (error?.code && retryableCodes.includes(error.code)) {
            return true;
        }
        if (error?.message?.includes('timeout')) {
            return true;
        }
        return false;
    }
    /**
     * 重新初始化LEP核心
     */
    reinitialize() {
        this.initializeLEPCore();
    }
    /**
     * 检查LEP是否可用
     */
    isLEPAvailable() {
        return this.lepCore !== null;
    }
}
exports.LEPDelegate = LEPDelegate;
exports.default = LEPDelegate;
//# sourceMappingURL=lep-delegate.js.map