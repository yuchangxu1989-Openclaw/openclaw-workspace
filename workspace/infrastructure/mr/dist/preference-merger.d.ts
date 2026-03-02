/**
 * PreferenceMerger - 子Agent偏好融合器
 *
 * 功能：
 * - 查询子Agent的模型偏好配置
 * - 查询CapabilityAnchor能力矩阵
 * - 融合：偏好 ∩ 能力 → 候选模型列表
 * - 零硬编码模型名称，使用{{MODEL_XXX}}占位符
 *
 * @module infrastructure/mr
 * @version 2.0.0
 * @ISC N019/N020 compliant
 */
import { TaskIntent } from './intent-classifier';
/**
 * 模型偏好配置
 */
export interface ModelPreference {
    /** 主模型占位符 */
    primary: string;
    /** 降级链 */
    fallbacks: string[];
    /** 严格模式（只使用偏好模型） */
    strictMode: boolean;
}
/**
 * 意图覆盖配置
 */
export interface IntentOverride {
    preferredModel: string;
    minComplexity?: 'low' | 'medium' | 'high' | 'extreme';
}
/**
 * 子Agent配置
 */
export interface AgentConfig {
    agentId: string;
    version: string;
    modelPreferences: ModelPreference;
    intentOverrides?: Record<string, IntentOverride>;
    sandboxSettings?: SandboxSettings;
}
/**
 * 沙盒设置
 */
export interface SandboxSettings {
    healthCheckTimeoutMs: number;
    executionTimeoutMs: number;
    shadowTestEnabled: boolean;
    shadowTestSampleRate: number;
    qualityThreshold: number;
}
/**
 * 模型能力定义
 */
export interface ModelCapability {
    id: string;
    name: string;
    description: string;
    capabilities: string[];
    inputModality: string[];
    outputModality: string[];
    complexity: {
        supportedLevels: Record<string, string>;
        maxComplexity: string;
        contextWindow?: string;
        reasoningDepth?: string;
    };
    latencyTarget: {
        optimal: string;
        acceptable: string;
        priority: string;
    };
    resourceProfile: {
        computeTier: string;
        memoryRequirement: string;
    };
    supportedFormats?: string[];
    maxImageSize?: string;
    supportedLanguages?: string[];
}
/**
 * 融合结果
 */
export interface MergeResult {
    /** 最终模型链 */
    modelChain: string[];
    /** 选中原因 */
    selectionReason: string;
    /** 融合元数据 */
    metadata: MergeMetadata;
}
/**
 * 融合元数据
 */
export interface MergeMetadata {
    intentCategory: string;
    intentComplexity: string;
    agentPrimary: string;
    capabilityMatches: CapabilityMatch[];
    filteredModels: string[];
    filterReason: string;
}
/**
 * 能力匹配
 */
export interface CapabilityMatch {
    model: string;
    score: number;
    matchedCapabilities: string[];
    mismatches: string[];
}
/**
 * 融合选项
 */
export interface MergeOptions {
    /** 是否强制使用CapabilityAnchor匹配 */
    enforceCapabilityMatch?: boolean;
    /** 最小能力匹配分数 */
    minMatchScore?: number;
    /** 最大模型链长度 */
    maxChainLength?: number;
}
export declare class PreferenceMerger {
    private capabilityAnchor;
    private agentConfigs;
    private anchorPath;
    private anchorCacheTime;
    private readonly ANCHOR_CACHE_TTL;
    constructor(anchorPath?: string);
    /**
     * 融合意图和子Agent偏好，生成模型链
     * @param intent 任务意图
     * @param agentConfig 子Agent配置
     * @param options 融合选项
     * @returns MergeResult 融合结果
     */
    merge(intent: TaskIntent, agentConfig: AgentConfig, options?: MergeOptions): Promise<MergeResult>;
    /**
     * 检查意图覆盖
     */
    private checkIntentOverride;
    /**
     * 构建覆盖链
     */
    private buildOverrideChain;
    /**
     * 构建偏好链
     */
    private buildPreferenceChain;
    /**
     * 基于CapabilityAnchor过滤
     */
    private filterByCapability;
    /**
     * 计算能力匹配分数
     */
    private calculateCapabilityMatch;
    /**
     * 从CapabilityAnchor推荐模型
     */
    private recommendFromCapabilityAnchor;
    /**
     * 根据复杂度调整链
     */
    private adjustByComplexity;
    /**
     * 生成选择原因
     */
    private generateSelectionReason;
    /**
     * 领域到能力的映射
     */
    private mapDomainToCapability;
    /**
     * 加载CapabilityAnchor
     */
    private loadCapabilityAnchor;
    /**
     * 加载子Agent配置
     */
    loadAgentConfig(configPath: string): AgentConfig;
    /**
     * 解析意图覆盖
     */
    private parseIntentOverrides;
    /**
     * 获取Agent配置
     */
    getAgentConfig(agentId: string): AgentConfig | undefined;
    /**
     * 刷新CapabilityAnchor
     */
    refreshCapabilityAnchor(): void;
    /**
     * 获取CapabilityAnchor模型列表
     */
    getAvailableModels(): string[];
    /**
     * 获取模型能力详情
     */
    getModelCapability(modelPlaceholder: string): ModelCapability | null;
}
export default PreferenceMerger;
//# sourceMappingURL=preference-merger.d.ts.map