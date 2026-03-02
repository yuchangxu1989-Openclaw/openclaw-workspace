"use strict";
/**
 * MRRouter - 模型路由主入口
 *
 * 功能：
 * - 整合 IntentClassifier + PreferenceMerger + SandboxValidator + LEPDelegate
 * - 提供简洁的routeAndExecute API
 * - 非阻塞架构，支持取消
 * - 零硬编码模型名称，使用{{MODEL_XXX}}占位符
 * - 100%复用LEP，零复刻韧性逻辑
 *
 * @module infrastructure/mr
 * @version 2.0.0
 * @ISC N019/N020 compliant
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MRRouter = void 0;
exports.getRouter = getRouter;
exports.routeAndExecute = routeAndExecute;
exports.health = health;
const intent_classifier_1 = require("./intent-classifier");
const preference_merger_1 = require("./preference-merger");
const sandbox_validator_1 = require("./sandbox-validator");
const lep_delegate_1 = require("./lep-delegate");
// ============================================================================
// MRRouter Implementation
// ============================================================================
class MRRouter {
    constructor(config = {}) {
        this.activeExecutions = new Map();
        this.config = config;
        // 初始化各组件
        this.intentClassifier = new intent_classifier_1.IntentClassifier({
            intentTemplatesPath: config.intentTemplatesPath,
            ...config.classifierConfig
        });
        this.preferenceMerger = new preference_merger_1.PreferenceMerger(config.capabilityAnchorPath);
        this.sandboxValidator = new sandbox_validator_1.SandboxValidator(config.sandboxConfig);
        this.lepDelegate = new lep_delegate_1.LEPDelegate();
    }
    /**
     * 主路由执行方法
     *
     * 流程：
     * 1. 语义意图识别 (IntentClassifier)
     * 2. 偏好融合 (PreferenceMerger)
     * 3. 沙盒验证 (SandboxValidator)
     * 4. LEP执行 (LEPDelegate)
     *
     * @param request 路由请求
     * @returns RouteResult 路由结果
     */
    async routeAndExecute(request) {
        const startTime = Date.now();
        const executionId = this.generateExecutionId();
        // 创建取消控制器
        const abortController = new AbortController();
        this.activeExecutions.set(executionId, abortController);
        try {
            // ================================================================
            // Phase 1: 语义意图识别
            // ================================================================
            const phase1Start = Date.now();
            const classificationRequest = {
                description: request.description,
                context: request.context?.map(c => ({
                    role: c.role,
                    content: c.content,
                    timestamp: Date.now()
                })),
                attachments: request.attachments?.map(a => ({
                    type: a.type,
                    mimeType: a.mimeType,
                    content: a.content,
                    url: a.url
                }))
            };
            const intent = await this.intentClassifier.classify(classificationRequest);
            const phase1Duration = Date.now() - phase1Start;
            request.options?.callbacks?.onIntentClassified?.(intent);
            // 检查取消
            if (abortController.signal.aborted) {
                return this.createCancelledResult(executionId, intent, startTime);
            }
            // ================================================================
            // Phase 2: 偏好融合
            // ================================================================
            const phase2Start = Date.now();
            const mergeResult = await this.preferenceMerger.merge(intent, request.agentConfig, {
                enforceCapabilityMatch: request.options?.enforceCapabilityMatch ?? true,
                maxChainLength: 5
            });
            const phase2Duration = Date.now() - phase2Start;
            request.options?.callbacks?.onPreferencesMerged?.(mergeResult);
            // 检查取消
            if (abortController.signal.aborted) {
                return this.createCancelledResult(executionId, intent, startTime);
            }
            // ================================================================
            // Phase 3: 沙盒验证
            // ================================================================
            const phase3Start = Date.now();
            let validationResult;
            if (request.options?.enableSandbox !== false) {
                validationResult = await this.sandboxValidator.validate({
                    modelChain: mergeResult.modelChain,
                    intent,
                    agentConfig: request.agentConfig,
                    taskPreview: request.description.slice(0, 200)
                });
            }
            else {
                // 沙盒禁用，直接通过
                validationResult = {
                    passed: true,
                    layers: [],
                    validatedChain: mergeResult.modelChain,
                    metadata: {
                        totalDurationMs: 0,
                        modelsChecked: mergeResult.modelChain,
                        modelsRejected: [],
                        timestamp: Date.now()
                    }
                };
            }
            const phase3Duration = Date.now() - phase3Start;
            request.options?.callbacks?.onSandboxValidated?.(validationResult);
            // 检查取消
            if (abortController.signal.aborted) {
                return this.createCancelledResult(executionId, intent, startTime);
            }
            // ================================================================
            // Phase 4: LEP执行
            // ================================================================
            const phase4Start = Date.now();
            const lepRequest = {
                task: {
                    prompt: request.description,
                    systemMessage: request.systemMessage,
                    context: request.context,
                    attachments: request.attachments
                },
                modelChain: validationResult.validatedChain,
                intent,
                agentConfig: request.agentConfig,
                validationResult,
                options: {
                    timeoutMs: request.options?.timeoutMs,
                    maxTokens: request.options?.maxTokens,
                    temperature: request.options?.temperature,
                    stream: request.options?.stream,
                    callbacks: {
                        onModelAttempt: request.options?.callbacks?.onModelAttempt,
                        onModelSuccess: request.options?.callbacks?.onModelSuccess,
                        onModelFailure: request.options?.callbacks?.onModelFailure,
                        onFallback: request.options?.callbacks?.onDegraded,
                        onProgress: request.options?.callbacks?.onProgress
                    }
                }
            };
            const lepResult = await this.lepDelegate.execute(lepRequest);
            const phase4Duration = Date.now() - phase4Start;
            const totalDuration = Date.now() - startTime;
            // 清理
            this.activeExecutions.delete(executionId);
            // 构建结果
            return this.buildRouteResult(lepResult, intent, mergeResult, executionId, totalDuration, {
                classification: phase1Duration,
                merging: phase2Duration,
                sandbox: phase3Duration,
                execution: phase4Duration
            });
        }
        catch (error) {
            // 清理
            this.activeExecutions.delete(executionId);
            const totalDuration = Date.now() - startTime;
            return {
                status: 'failure',
                usedModel: '',
                modelChain: [],
                wasDegraded: false,
                error: {
                    code: 'ROUTER_ERROR',
                    message: error instanceof Error ? error.message : 'Unknown router error',
                    retryable: false
                },
                metadata: {
                    executionId,
                    intent: {
                        taskCategory: 'general',
                        complexity: 'medium',
                        inputModality: 'text',
                        outputModality: 'text',
                        domain: 'unknown',
                        confidence: 0
                    },
                    totalDurationMs: totalDuration,
                    phaseDurations: { classification: 0, merging: 0, sandbox: 0, execution: 0 },
                    attemptedModels: [],
                    retryCount: 0,
                    timestamp: Date.now()
                }
            };
        }
    }
    /**
     * 取消执行
     */
    cancel(executionId) {
        const controller = this.activeExecutions.get(executionId);
        if (controller) {
            controller.abort();
            this.activeExecutions.delete(executionId);
            return true;
        }
        return false;
    }
    /**
     * 取消所有执行
     */
    cancelAll() {
        let count = 0;
        for (const [id, controller] of this.activeExecutions) {
            controller.abort();
            this.activeExecutions.delete(id);
            count++;
        }
        return count;
    }
    /**
     * 快速路由（跳过部分验证，低延迟）
     */
    async quickRoute(description, agentConfig, timeoutMs) {
        return this.routeAndExecute({
            description,
            agentConfig,
            options: {
                timeoutMs,
                enableSandbox: false,
                enforceCapabilityMatch: false
            }
        });
    }
    /**
     * 健康检查
     */
    async health() {
        const lepHealth = await this.lepDelegate.health();
        return {
            healthy: lepHealth.healthy,
            components: {
                classifier: this.intentClassifier.getLoadedTemplates().length > 0,
                merger: this.preferenceMerger.getAvailableModels().length > 0,
                sandbox: true,
                lep: this.lepDelegate.isLEPAvailable()
            },
            lepHealth,
            timestamp: Date.now()
        };
    }
    /**
     * 获取统计信息
     */
    getStats() {
        return {
            activeExecutions: this.activeExecutions.size,
            sandboxStats: this.sandboxValidator.getStats(),
            lepStats: this.lepDelegate.getStats()
        };
    }
    /**
     * 加载Agent配置
     */
    loadAgentConfig(configPath) {
        return this.preferenceMerger.loadAgentConfig(configPath);
    }
    /**
     * 创建取消结果
     */
    createCancelledResult(executionId, intent, startTime) {
        return {
            status: 'cancelled',
            usedModel: '',
            modelChain: [],
            wasDegraded: false,
            metadata: {
                executionId,
                intent,
                totalDurationMs: Date.now() - startTime,
                phaseDurations: { classification: 0, merging: 0, sandbox: 0, execution: 0 },
                attemptedModels: [],
                retryCount: 0,
                timestamp: Date.now()
            }
        };
    }
    /**
     * 构建路由结果
     */
    buildRouteResult(lepResult, intent, mergeResult, executionId, totalDuration, phaseDurations) {
        if (lepResult.status === 'success') {
            return {
                status: 'success',
                content: lepResult.result?.content,
                usage: lepResult.result?.usage,
                usedModel: lepResult.result?.model || mergeResult.modelChain[0],
                modelChain: mergeResult.modelChain,
                wasDegraded: lepResult.metadata.wasDegraded,
                metadata: {
                    executionId,
                    intent,
                    totalDurationMs: totalDuration,
                    phaseDurations,
                    attemptedModels: lepResult.metadata.attemptedModels,
                    retryCount: lepResult.metadata.retryCount,
                    timestamp: Date.now()
                }
            };
        }
        else {
            return {
                status: 'failure',
                usedModel: lepResult.metadata.usedModel,
                modelChain: mergeResult.modelChain,
                wasDegraded: false,
                error: lepResult.error,
                metadata: {
                    executionId,
                    intent,
                    totalDurationMs: totalDuration,
                    phaseDurations,
                    attemptedModels: lepResult.metadata.attemptedModels,
                    retryCount: lepResult.metadata.retryCount,
                    timestamp: Date.now()
                }
            };
        }
    }
    /**
     * 生成执行ID
     */
    generateExecutionId() {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substr(2, 6);
        return `mr_${timestamp}_${random}`;
    }
    /**
     * 更新配置
     */
    updateConfig(config) {
        this.config = { ...this.config, ...config };
        if (config.classifierConfig) {
            this.intentClassifier.updateConfig(config.classifierConfig);
        }
        if (config.sandboxConfig) {
            this.sandboxValidator.updateConfig(config.sandboxConfig);
        }
    }
    /**
     * 获取子Agent配置
     */
    getAgentConfig(agentId) {
        return this.preferenceMerger.getAgentConfig(agentId);
    }
    /**
     * 获取可用模型列表
     */
    getAvailableModels() {
        return this.preferenceMerger.getAvailableModels();
    }
    /**
     * 获取模型能力详情
     */
    getModelCapability(modelPlaceholder) {
        return this.preferenceMerger.getModelCapability(modelPlaceholder);
    }
}
exports.MRRouter = MRRouter;
// ============================================================================
// Export Convenience Functions
// ============================================================================
let defaultRouter = null;
/**
 * 获取默认路由器实例
 */
function getRouter(config) {
    if (!defaultRouter) {
        defaultRouter = new MRRouter(config);
    }
    return defaultRouter;
}
/**
 * 快速执行
 */
async function routeAndExecute(request) {
    return getRouter().routeAndExecute(request);
}
/**
 * 检查健康状态
 */
async function health() {
    return getRouter().health();
}
exports.default = MRRouter;
// Re-export all types
__exportStar(require("./intent-classifier"), exports);
__exportStar(require("./preference-merger"), exports);
__exportStar(require("./sandbox-validator"), exports);
__exportStar(require("./lep-delegate"), exports);
//# sourceMappingURL=mr-router.js.map