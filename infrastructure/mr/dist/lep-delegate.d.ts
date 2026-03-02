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
import { TaskIntent } from './intent-classifier';
import { AgentConfig } from './preference-merger';
import { SandboxValidationResult } from './sandbox-validator';
/**
 * LEP执行请求
 */
export interface LEPExecuteRequest {
    /** 任务内容 */
    task: TaskContent;
    /** 模型链 */
    modelChain: string[];
    /** 任务意图 */
    intent: TaskIntent;
    /** Agent配置 */
    agentConfig: AgentConfig;
    /** 沙盒验证结果 */
    validationResult: SandboxValidationResult;
    /** 执行选项 */
    options?: ExecuteOptions;
}
/**
 * 任务内容
 */
export interface TaskContent {
    /** 用户输入 */
    prompt: string;
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
}
/**
 * 执行选项
 */
export interface ExecuteOptions {
    /** 超时时间ms */
    timeoutMs?: number;
    /** 最大token数 */
    maxTokens?: number;
    /** 温度参数 */
    temperature?: number;
    /** 是否流式输出 */
    stream?: boolean;
    /** 重试策略 */
    retryPolicy?: RetryPolicy;
    /** 回调函数 */
    callbacks?: ExecuteCallbacks;
}
/**
 * 重试策略
 */
export interface RetryPolicy {
    maxRetries: number;
    backoff: 'fixed' | 'exponential';
    baseDelayMs: number;
    maxDelayMs: number;
}
/**
 * 执行回调
 */
export interface ExecuteCallbacks {
    onModelAttempt?: (model: string, attempt: number) => void;
    onModelSuccess?: (model: string, durationMs: number) => void;
    onModelFailure?: (model: string, error: Error) => void;
    onFallback?: (fromModel: string, toModel: string) => void;
    onProgress?: (chunk: string) => void;
}
/**
 * LEP执行结果
 */
export interface LEPExecuteResult {
    /** 执行状态 */
    status: 'success' | 'failure' | 'partial';
    /** 执行结果 */
    result?: ModelResult;
    /** 错误信息 */
    error?: ExecutionError;
    /** 执行元数据 */
    metadata: ExecutionMetadata;
}
/**
 * 模型结果
 */
export interface ModelResult {
    /** 使用的模型 */
    model: string;
    /** 输出内容 */
    content: string;
    /** Token使用量 */
    usage?: TokenUsage;
    /** 完成原因 */
    finishReason?: string;
}
/**
 * Token使用
 */
export interface TokenUsage {
    prompt: number;
    completion: number;
    total: number;
}
/**
 * 执行错误
 */
export interface ExecutionError {
    code: string;
    message: string;
    model?: string;
    retryable: boolean;
    details?: Record<string, any>;
}
/**
 * 执行元数据
 */
export interface ExecutionMetadata {
    /** 执行ID */
    executionId: string;
    /** 原始模型链 */
    originalChain: string[];
    /** 实际使用的模型 */
    usedModel: string;
    /** 尝试的模型列表 */
    attemptedModels: string[];
    /** 总耗时ms */
    totalDurationMs: number;
    /** 各模型耗时 */
    modelDurations: Record<string, number>;
    /** 重试次数 */
    retryCount: number;
    /** 是否发生降级 */
    wasDegraded: boolean;
    /** 时间戳 */
    timestamp: number;
}
/**
 * LEP核心接口（由infrastructure/lep-core提供）
 */
export interface LEPCoreInterface {
    execute(task: LEPCoreTask): Promise<LEPCoreResult>;
    health(): Promise<LEPHealthStatus>;
    getStats(): LEPStats;
}
/**
 * LEP核心任务
 */
export interface LEPCoreTask {
    type: 'model_inference';
    modelChain: string[];
    prompt: string;
    systemMessage?: string;
    context?: Array<{
        role: string;
        content: string;
    }>;
    options: {
        timeout: number;
        maxTokens?: number;
        temperature?: number;
        stream?: boolean;
    };
    fallbackStrategy: 'chain' | 'abort';
}
/**
 * LEP核心结果
 */
export interface LEPCoreResult {
    status: 'success' | 'failure';
    data?: any;
    error?: {
        code: string;
        message: string;
        retryable: boolean;
    };
    metadata: {
        executionId: string;
        duration: number;
        attempts: number;
        usedModel: string;
    };
}
/**
 * LEP健康状态
 */
export interface LEPHealthStatus {
    healthy: boolean;
    status: string;
    checks: Record<string, any>;
    timestamp: number;
}
/**
 * LEP统计
 */
export interface LEPStats {
    uptime: number;
    totalExecutions: number;
    successRate: number;
    averageDuration: number;
}
export declare class LEPDelegate {
    private lepCore;
    private executionCounter;
    constructor();
    /**
     * 初始化LEP核心
     */
    private initializeLEPCore;
    /**
     * 加载LEP模块
     */
    private loadLEPModule;
    /**
     * 执行模型调用
     * @param request LEP执行请求
     * @returns LEPExecuteResult 执行结果
     */
    execute(request: LEPExecuteRequest): Promise<LEPExecuteResult>;
    /**
     * 使用LEP核心执行
     */
    private executeWithLEP;
    /**
     * 降级模式执行（LEP不可用时）
     */
    private executeFallback;
    /**
     * 构建LEP核心任务
     */
    private buildLEPTask;
    /**
     * 检查LEP健康状态
     */
    health(): Promise<LEPHealthStatus>;
    /**
     * 获取LEP统计
     */
    getStats(): LEPStats | null;
    /**
     * 生成执行ID
     */
    private generateExecutionId;
    /**
     * 判断错误是否可重试
     */
    private isRetryableError;
    /**
     * 重新初始化LEP核心
     */
    reinitialize(): void;
    /**
     * 检查LEP是否可用
     */
    isLEPAvailable(): boolean;
}
export default LEPDelegate;
//# sourceMappingURL=lep-delegate.d.ts.map