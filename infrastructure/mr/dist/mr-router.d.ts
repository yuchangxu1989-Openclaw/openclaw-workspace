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
import { TaskIntent } from './intent-classifier';
import { AgentConfig, MergeResult } from './preference-merger';
import { SandboxValidationResult, SandboxConfig } from './sandbox-validator';
/**
 * 路由请求
 */
export interface RouteRequest {
    /** 任务描述 */
    description: string;
    /** 系统消息 */
    systemMessage?: string;
    /** 历史上下文 */
    context?: Array<{
        role: string;
        content: string;
    }>;
    /** 附件 */
    attachments?: Array<{
        type: string;
        mimeType: string;
        content?: string;
        url?: string;
    }>;
    /** 子Agent配置 */
    agentConfig: AgentConfig;
    /** 执行选项 */
    options?: RouteOptions;
}
/**
 * 路由选项
 */
export interface RouteOptions {
    /** 超时时间ms */
    timeoutMs?: number;
    /** 最大token数 */
    maxTokens?: number;
    /** 温度参数 */
    temperature?: number;
    /** 是否流式输出 */
    stream?: boolean;
    /** 是否启用沙盒 */
    enableSandbox?: boolean;
    /** 是否强制Capability匹配 */
    enforceCapabilityMatch?: boolean;
    /** 回调函数 */
    callbacks?: RouteCallbacks;
}
/**
 * 路由回调
 */
export interface RouteCallbacks {
    /** 意图识别完成 */
    onIntentClassified?: (intent: TaskIntent) => void;
    /** 偏好融合完成 */
    onPreferencesMerged?: (result: MergeResult) => void;
    /** 沙盒验证完成 */
    onSandboxValidated?: (result: SandboxValidationResult) => void;
    /** 模型尝试 */
    onModelAttempt?: (model: string, attempt: number) => void;
    /** 模型成功 */
    onModelSuccess?: (model: string, durationMs: number) => void;
    /** 模型失败 */
    onModelFailure?: (model: string, error: Error) => void;
    /** 降级发生 */
    onDegraded?: (fromModel: string, toModel: string) => void;
    /** 进度更新 */
    onProgress?: (chunk: string) => void;
}
/**
 * 路由结果
 */
export interface RouteResult {
    /** 执行状态 */
    status: 'success' | 'failure' | 'cancelled';
    /** 输出内容 */
    content?: string;
    /** Token使用 */
    usage?: {
        prompt: number;
        completion: number;
        total: number;
    };
    /** 使用的模型 */
    usedModel: string;
    /** 原始模型链 */
    modelChain: string[];
    /** 是否发生降级 */
    wasDegraded: boolean;
    /** 路由元数据 */
    metadata: RouteMetadata;
    /** 错误信息 */
    error?: {
        code: string;
        message: string;
        retryable: boolean;
    };
}
/**
 * 路由元数据
 */
export interface RouteMetadata {
    /** 执行ID */
    executionId: string;
    /** 任务意图 */
    intent: TaskIntent;
    /** 总耗时ms */
    totalDurationMs: number;
    /** 各阶段耗时 */
    phaseDurations: {
        classification: number;
        merging: number;
        sandbox: number;
        execution: number;
    };
    /** 尝试的模型 */
    attemptedModels: string[];
    /** 重试次数 */
    retryCount: number;
    /** 时间戳 */
    timestamp: number;
}
/**
 * MR配置
 */
export interface MRConfig {
    /** CapabilityAnchor路径 */
    capabilityAnchorPath?: string;
    /** 意图模板路径 */
    intentTemplatesPath?: string;
    /** 沙盒配置 */
    sandboxConfig?: Partial<SandboxConfig>;
    /** 分类器配置 */
    classifierConfig?: {
        similarityThreshold?: number;
        contextWindowSize?: number;
    };
}
/**
 * MR健康状态
 */
export interface MRHealthStatus {
    /** 整体健康 */
    healthy: boolean;
    /** 各组件状态 */
    components: {
        classifier: boolean;
        merger: boolean;
        sandbox: boolean;
        lep: boolean;
    };
    /** LEP健康详情 */
    lepHealth?: any;
    /** 时间戳 */
    timestamp: number;
}
export declare class MRRouter {
    private intentClassifier;
    private preferenceMerger;
    private sandboxValidator;
    private lepDelegate;
    private config;
    private activeExecutions;
    constructor(config?: MRConfig);
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
    routeAndExecute(request: RouteRequest): Promise<RouteResult>;
    /**
     * 取消执行
     */
    cancel(executionId: string): boolean;
    /**
     * 取消所有执行
     */
    cancelAll(): number;
    /**
     * 快速路由（跳过部分验证，低延迟）
     */
    quickRoute(description: string, agentConfig: AgentConfig, timeoutMs?: number): Promise<RouteResult>;
    /**
     * 健康检查
     */
    health(): Promise<MRHealthStatus>;
    /**
     * 获取统计信息
     */
    getStats(): {
        activeExecutions: number;
        sandboxStats: any;
        lepStats: any;
    };
    /**
     * 加载Agent配置
     */
    loadAgentConfig(configPath: string): AgentConfig;
    /**
     * 创建取消结果
     */
    private createCancelledResult;
    /**
     * 构建路由结果
     */
    private buildRouteResult;
    /**
     * 生成执行ID
     */
    private generateExecutionId;
    /**
     * 更新配置
     */
    updateConfig(config: Partial<MRConfig>): void;
    /**
     * 获取子Agent配置
     */
    getAgentConfig(agentId: string): AgentConfig | undefined;
    /**
     * 获取可用模型列表
     */
    getAvailableModels(): string[];
    /**
     * 获取模型能力详情
     */
    getModelCapability(modelPlaceholder: string): import("./preference-merger").ModelCapability | null;
}
/**
 * 获取默认路由器实例
 */
export declare function getRouter(config?: MRConfig): MRRouter;
/**
 * 快速执行
 */
export declare function routeAndExecute(request: RouteRequest): Promise<RouteResult>;
/**
 * 检查健康状态
 */
export declare function health(): Promise<MRHealthStatus>;
export default MRRouter;
export * from './intent-classifier';
export * from './preference-merger';
export * from './sandbox-validator';
export * from './lep-delegate';
//# sourceMappingURL=mr-router.d.ts.map