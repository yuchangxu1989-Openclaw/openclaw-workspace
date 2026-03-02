"use strict";
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
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.PreferenceMerger = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const yaml = __importStar(require("js-yaml"));
// ============================================================================
// PreferenceMerger Implementation
// ============================================================================
class PreferenceMerger {
    constructor(anchorPath) {
        this.capabilityAnchor = null;
        this.agentConfigs = new Map();
        this.anchorCacheTime = 0;
        this.ANCHOR_CACHE_TTL = 30000; // 30秒缓存
        this.anchorPath = anchorPath || path.join(__dirname, '../capability-anchor/models.yaml');
        this.loadCapabilityAnchor();
    }
    /**
     * 融合意图和子Agent偏好，生成模型链
     * @param intent 任务意图
     * @param agentConfig 子Agent配置
     * @param options 融合选项
     * @returns MergeResult 融合结果
     */
    async merge(intent, agentConfig, options = {}) {
        const { enforceCapabilityMatch = true, minMatchScore = 0.5, maxChainLength = 5 } = options;
        // 1. 检查意图覆盖
        const override = this.checkIntentOverride(intent, agentConfig);
        if (override) {
            return this.buildOverrideChain(override, intent, agentConfig, enforceCapabilityMatch);
        }
        // 2. 获取基础偏好链
        const preferenceChain = this.buildPreferenceChain(agentConfig.modelPreferences);
        // 3. 基于CapabilityAnchor过滤
        let candidateChain = preferenceChain;
        let filterReason = 'using_agent_preferences';
        let capabilityMatches = [];
        if (enforceCapabilityMatch && this.capabilityAnchor) {
            const filterResult = this.filterByCapability(preferenceChain, intent, minMatchScore);
            if (filterResult.filtered.length > 0) {
                candidateChain = filterResult.filtered;
                capabilityMatches = filterResult.matches;
                filterReason = 'filtered_by_capability';
            }
            else if (!agentConfig.modelPreferences.strictMode) {
                // 严格模式下不扩展，非严格模式从CapabilityAnchor推荐
                const recommended = this.recommendFromCapabilityAnchor(intent);
                candidateChain = recommended;
                filterReason = 'fallback_to_anchor_recommendation';
            }
        }
        // 4. 复杂度匹配调整
        candidateChain = this.adjustByComplexity(candidateChain, intent.complexity);
        // 5. 限制链长度
        candidateChain = candidateChain.slice(0, maxChainLength);
        // 6. 确保有兜底模型
        if (candidateChain.length === 0) {
            candidateChain = ['{{MODEL_GENERAL}}'];
            filterReason = 'emergency_fallback';
        }
        // 7. 生成选择原因
        const selectionReason = this.generateSelectionReason(intent, agentConfig, candidateChain[0]);
        return {
            modelChain: candidateChain,
            selectionReason,
            metadata: {
                intentCategory: intent.taskCategory,
                intentComplexity: intent.complexity,
                agentPrimary: agentConfig.modelPreferences.primary,
                capabilityMatches,
                filteredModels: preferenceChain.filter(p => !candidateChain.includes(p)),
                filterReason
            }
        };
    }
    /**
     * 检查意图覆盖
     */
    checkIntentOverride(intent, agentConfig) {
        if (!agentConfig.intentOverrides)
            return null;
        // 按任务类别查找覆盖
        const override = agentConfig.intentOverrides[intent.taskCategory];
        if (!override)
            return null;
        // 检查复杂度要求
        if (override.minComplexity) {
            const complexityOrder = ['low', 'medium', 'high', 'extreme'];
            const intentLevel = complexityOrder.indexOf(intent.complexity);
            const requiredLevel = complexityOrder.indexOf(override.minComplexity);
            if (intentLevel < requiredLevel)
                return null;
        }
        return override;
    }
    /**
     * 构建覆盖链
     */
    buildOverrideChain(override, intent, agentConfig, enforceCapabilityMatch) {
        const chain = [override.preferredModel];
        // 添加Agent偏好链作为兜底
        if (!agentConfig.modelPreferences.strictMode) {
            const fallbackChain = agentConfig.modelPreferences.fallbacks.filter(m => m !== override.preferredModel);
            chain.push(...fallbackChain);
        }
        // 验证能力匹配
        let filteredChain = chain;
        let capabilityMatches = [];
        if (enforceCapabilityMatch && this.capabilityAnchor) {
            const filterResult = this.filterByCapability(chain, intent);
            filteredChain = filterResult.filtered.length > 0 ? filterResult.filtered : chain;
            capabilityMatches = filterResult.matches;
        }
        return {
            modelChain: filteredChain,
            selectionReason: `intent_override: ${intent.taskCategory} -> ${override.preferredModel}`,
            metadata: {
                intentCategory: intent.taskCategory,
                intentComplexity: intent.complexity,
                agentPrimary: agentConfig.modelPreferences.primary,
                capabilityMatches,
                filteredModels: [],
                filterReason: 'intent_override_applied'
            }
        };
    }
    /**
     * 构建偏好链
     */
    buildPreferenceChain(preferences) {
        const chain = [preferences.primary];
        // 去重添加fallbacks
        for (const fallback of preferences.fallbacks) {
            if (!chain.includes(fallback)) {
                chain.push(fallback);
            }
        }
        // 确保有通用兜底
        if (!chain.includes('{{MODEL_GENERAL}}')) {
            chain.push('{{MODEL_GENERAL}}');
        }
        return chain;
    }
    /**
     * 基于CapabilityAnchor过滤
     */
    filterByCapability(modelChain, intent, minMatchScore = 0.5) {
        if (!this.capabilityAnchor) {
            return { filtered: modelChain, matches: [] };
        }
        const filtered = [];
        const matches = [];
        for (const modelPlaceholder of modelChain) {
            const model = this.capabilityAnchor.models[modelPlaceholder];
            if (!model)
                continue;
            const match = this.calculateCapabilityMatch(model, intent);
            matches.push(match);
            if (match.score >= minMatchScore) {
                filtered.push(modelPlaceholder);
            }
        }
        return { filtered, matches };
    }
    /**
     * 计算能力匹配分数
     */
    calculateCapabilityMatch(model, intent) {
        const matchedCapabilities = [];
        const mismatches = [];
        let totalScore = 0;
        let maxScore = 0;
        // 1. 检查输入模态
        maxScore += 1;
        if (model.inputModality.includes(intent.inputModality) ||
            model.inputModality.includes('text')) {
            totalScore += 1;
            matchedCapabilities.push(`input:${intent.inputModality}`);
        }
        else {
            mismatches.push(`input:${intent.inputModality}`);
        }
        // 2. 检查输出模态
        maxScore += 1;
        if (model.outputModality.includes(intent.outputModality) ||
            model.outputModality.includes('text')) {
            totalScore += 1;
            matchedCapabilities.push(`output:${intent.outputModality}`);
        }
        else {
            mismatches.push(`output:${intent.outputModality}`);
        }
        // 3. 检查复杂度支持
        maxScore += 1;
        const complexityOrder = ['L1', 'L2', 'L3', 'L4', 'L5'];
        const intentComplexityMap = {
            'low': 'L1',
            'medium': 'L2',
            'high': 'L3',
            'extreme': 'L5'
        };
        const requiredLevel = complexityOrder.indexOf(intentComplexityMap[intent.complexity]);
        const maxSupportedLevel = complexityOrder.indexOf(model.complexity.maxComplexity);
        if (maxSupportedLevel >= requiredLevel) {
            totalScore += 1;
            matchedCapabilities.push(`complexity:${intent.complexity}`);
        }
        else {
            mismatches.push(`complexity:${intent.complexity}`);
        }
        // 4. 检查领域能力
        maxScore += 1;
        const domainCapability = this.mapDomainToCapability(intent.domain);
        if (model.capabilities.some(c => c.includes(domainCapability) || c.includes(intent.taskCategory))) {
            totalScore += 1;
            matchedCapabilities.push(`domain:${domainCapability}`);
        }
        // 5. 特殊模态检查
        if (intent.inputModality === 'image' || intent.inputModality === 'mixed') {
            maxScore += 1;
            if (model.capabilities.includes('image_understanding')) {
                totalScore += 1;
                matchedCapabilities.push('capability:image_understanding');
            }
        }
        if (intent.inputModality === 'audio') {
            maxScore += 1;
            if (model.capabilities.includes('speech_recognition')) {
                totalScore += 1;
                matchedCapabilities.push('capability:speech_recognition');
            }
        }
        const score = maxScore > 0 ? totalScore / maxScore : 0;
        return {
            model: model.id,
            score,
            matchedCapabilities,
            mismatches
        };
    }
    /**
     * 从CapabilityAnchor推荐模型
     */
    recommendFromCapabilityAnchor(intent) {
        if (!this.capabilityAnchor)
            return ['{{MODEL_GENERAL}}'];
        const recommendations = [];
        // 遍历所有模型计算匹配分数
        for (const [placeholder, model] of Object.entries(this.capabilityAnchor.models)) {
            const match = this.calculateCapabilityMatch(model, intent);
            recommendations.push({ model: placeholder, score: match.score });
        }
        // 按分数排序
        recommendations.sort((a, b) => b.score - a.score);
        // 返回Top 3
        return recommendations
            .slice(0, 3)
            .map(r => r.model);
    }
    /**
     * 根据复杂度调整链
     */
    adjustByComplexity(chain, complexity) {
        if (!this.capabilityAnchor)
            return chain;
        // 复杂度优先级映射
        const complexityPriority = {
            'extreme': ['{{MODEL_DEEP_THINKING}}', '{{MODEL_CODE_REVIEW}}'],
            'high': ['{{MODEL_DEEP_THINKING}}', '{{MODEL_CODE_REVIEW}}', '{{MODEL_GENERAL}}'],
            'medium': ['{{MODEL_GENERAL}}', '{{MODEL_DEEP_THINKING}}'],
            'low': ['{{MODEL_GENERAL}}']
        };
        const priority = complexityPriority[complexity] || complexityPriority['medium'];
        // 根据优先级重排序
        const sortedChain = chain.sort((a, b) => {
            const indexA = priority.indexOf(a);
            const indexB = priority.indexOf(b);
            if (indexA === -1 && indexB === -1)
                return 0;
            if (indexA === -1)
                return 1;
            if (indexB === -1)
                return -1;
            return indexA - indexB;
        });
        return sortedChain;
    }
    /**
     * 生成选择原因
     */
    generateSelectionReason(intent, agentConfig, selectedModel) {
        const reasons = [
            `intent: ${intent.taskCategory}/${intent.complexity}`,
            `agent: ${agentConfig.agentId}`,
            `model: ${selectedModel}`
        ];
        if (intent.confidence < 0.7) {
            reasons.push('low_confidence_fallback');
        }
        return reasons.join(' | ');
    }
    /**
     * 领域到能力的映射
     */
    mapDomainToCapability(domain) {
        const mapping = {
            'software_engineering': 'coding',
            'data_science': 'research',
            'academic': 'research',
            'creative': 'text_generation',
            'business': 'simple_qa'
        };
        return mapping[domain] || 'conversational_response';
    }
    // ============================================================================
    // Configuration Management
    // ============================================================================
    /**
     * 加载CapabilityAnchor
     */
    loadCapabilityAnchor() {
        try {
            // 检查缓存是否有效
            const now = Date.now();
            if (now - this.anchorCacheTime < this.ANCHOR_CACHE_TTL && this.capabilityAnchor) {
                return;
            }
            // 尝试多种路径
            const possiblePaths = [
                this.anchorPath,
                path.join(__dirname, '../../capability-anchor/models.yaml'),
                path.join(process.cwd(), 'infrastructure/capability-anchor/models.yaml')
            ];
            for (const tryPath of possiblePaths) {
                if (fs.existsSync(tryPath)) {
                    const content = fs.readFileSync(tryPath, 'utf-8');
                    this.capabilityAnchor = yaml.load(content);
                    this.anchorCacheTime = now;
                    return;
                }
            }
            console.warn('[PreferenceMerger] CapabilityAnchor not found, using defaults');
        }
        catch (error) {
            console.error('[PreferenceMerger] Failed to load CapabilityAnchor:', error);
        }
    }
    /**
     * 加载子Agent配置
     */
    loadAgentConfig(configPath) {
        try {
            const content = fs.readFileSync(configPath, 'utf-8');
            const rawConfig = JSON.parse(content);
            const config = {
                agentId: rawConfig.agent_id,
                version: rawConfig.version || '1.0.0',
                modelPreferences: {
                    primary: rawConfig.model_preferences.primary,
                    fallbacks: rawConfig.model_preferences.fallbacks || [],
                    strictMode: rawConfig.model_preferences.strict_mode || false
                },
                intentOverrides: this.parseIntentOverrides(rawConfig.intent_overrides),
                sandboxSettings: rawConfig.sandbox_settings || {
                    healthCheckTimeoutMs: 50,
                    executionTimeoutMs: 120000,
                    shadowTestEnabled: false,
                    shadowTestSampleRate: 0.01,
                    qualityThreshold: 0.9
                }
            };
            this.agentConfigs.set(config.agentId, config);
            return config;
        }
        catch (error) {
            throw new Error(`Failed to load agent config from ${configPath}: ${error}`);
        }
    }
    /**
     * 解析意图覆盖
     */
    parseIntentOverrides(rawOverrides) {
        if (!rawOverrides)
            return undefined;
        const overrides = {};
        for (const [key, value] of Object.entries(rawOverrides)) {
            overrides[key] = {
                preferredModel: value.preferred_model,
                minComplexity: value.min_complexity
            };
        }
        return overrides;
    }
    /**
     * 获取Agent配置
     */
    getAgentConfig(agentId) {
        return this.agentConfigs.get(agentId);
    }
    /**
     * 刷新CapabilityAnchor
     */
    refreshCapabilityAnchor() {
        this.anchorCacheTime = 0;
        this.loadCapabilityAnchor();
    }
    /**
     * 获取CapabilityAnchor模型列表
     */
    getAvailableModels() {
        if (!this.capabilityAnchor)
            return [];
        return Object.keys(this.capabilityAnchor.models);
    }
    /**
     * 获取模型能力详情
     */
    getModelCapability(modelPlaceholder) {
        if (!this.capabilityAnchor)
            return null;
        return this.capabilityAnchor.models[modelPlaceholder] || null;
    }
}
exports.PreferenceMerger = PreferenceMerger;
exports.default = PreferenceMerger;
//# sourceMappingURL=preference-merger.js.map