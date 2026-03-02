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
import { TaskIntent } from './intent-classifier';
import { AgentConfig } from './preference-merger';
/**
 * 沙盒验证结果
 */
export interface SandboxValidationResult {
    /** 是否通过验证 */
    passed: boolean;
    /** 验证层级结果 */
    layers: LayerValidationResult[];
    /** 最终推荐模型链 */
    validatedChain: string[];
    /** 验证元数据 */
    metadata: SandboxMetadata;
}
/**
 * 层级验证结果
 */
export interface LayerValidationResult {
    /** 层级名称 */
    layer: 'L1_health_check' | 'L2_shadow_test' | 'L3_circuit_breaker';
    /** 是否通过 */
    passed: boolean;
    /** 验证耗时ms */
    durationMs: number;
    /** 详细信息 */
    details: Record<string, any>;
    /** 错误信息（如失败） */
    error?: string;
}
/**
 * 沙盒元数据
 */
export interface SandboxMetadata {
    totalDurationMs: number;
    modelsChecked: string[];
    modelsRejected: string[];
    shadowTestResults?: ShadowTestResult[];
    timestamp: number;
}
/**
 * 影子测试结果
 */
export interface ShadowTestResult {
    model: string;
    sampleRate: number;
    qualityScore: number;
    baselineQuality: number;
    deviation: number;
    passed: boolean;
}
/**
 * 健康检查结果
 */
export interface HealthCheckResult {
    model: string;
    healthy: boolean;
    responseTimeMs: number;
    circuitBreakerState: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
    lastFailureTime?: number;
    consecutiveFailures: number;
}
/**
 * 验证请求
 */
export interface ValidationRequest {
    modelChain: string[];
    intent: TaskIntent;
    agentConfig: AgentConfig;
    taskPreview?: string;
}
/**
 * 沙盒配置
 */
export interface SandboxConfig {
    L1: L1Config;
    L2: L2Config;
    L3: L3Config;
}
interface L1Config {
    timeoutMs: number;
    cacheTTLMs: number;
    enableCache: boolean;
}
interface L2Config {
    enabled: boolean;
    sampleRate: number;
    qualityThreshold: number;
    maxDeviation: number;
    comparisonWindowSize: number;
}
interface L3Config {
    connectTimeoutMs: number;
    responseTimeoutMs: number;
    failureThreshold: number;
    resetTimeoutMs: number;
}
export declare class SandboxValidator {
    private config;
    private healthCache;
    private shadowTestHistory;
    constructor(config?: Partial<SandboxConfig>);
    /**
     * 执行三层沙盒验证
     * @param request 验证请求
     * @returns SandboxValidationResult 验证结果
     */
    validate(request: ValidationRequest): Promise<SandboxValidationResult>;
    /**
     * L1: 健康检查
     */
    private runL1HealthCheck;
    /**
     * 执行健康检查
     */
    private performHealthCheck;
    /**
     * 模拟健康检查
     */
    private simulateHealthCheck;
    /**
     * L2: 影子测试
     */
    private runL2ShadowTest;
    /**
     * 执行影子测试
     */
    private performShadowTest;
    /**
     * L3: 熔断检查
     */
    private runL3CircuitCheck;
    private getCachedHealth;
    private setCachedHealth;
    private recordShadowTest;
    private getBaselineQuality;
    /**
     * 更新配置
     */
    updateConfig(config: Partial<SandboxConfig>): void;
    /**
     * 启用/禁用影子测试
     */
    setShadowTestEnabled(enabled: boolean): void;
    /**
     * 清除健康缓存
     */
    clearHealthCache(): void;
    /**
     * 获取统计信息
     */
    getStats(): {
        cacheSize: number;
        historyEntries: number;
        config: SandboxConfig;
    };
}
export default SandboxValidator;
//# sourceMappingURL=sandbox-validator.d.ts.map