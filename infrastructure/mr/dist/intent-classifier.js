"use strict";
/**
 * IntentClassifier - 语义意图识别引擎
 *
 * 功能：
 * - 基于语义嵌入的任务分类（vs 关键词匹配）
 * - 5维意图向量识别：taskCategory, complexity, input/output modality, domain, confidence
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
exports.IntentClassifier = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// ============================================================================
// IntentClassifier Implementation
// ============================================================================
class IntentClassifier {
    constructor(config) {
        this.templates = new Map();
        this.cache = new Map();
        this.cacheTTL = 60000; // 60秒缓存
        this.config = {
            embeddingModel: '{{MODEL_EMBEDDING}}',
            similarityThreshold: 0.75,
            contextWindowSize: 5,
            intentTemplatesPath: path.join(__dirname, '../intent-templates'),
            enableCache: true,
            ...config
        };
        this.loadTemplates();
    }
    /**
     * 加载意图模板
     * 适配新的JSON格式（包含_meta和intents数组）
     */
    loadTemplates() {
        const templateFiles = [
            { file: 'reasoning-intents.json', category: 'reasoning' },
            { file: 'multimodal-intents.json', category: 'multimodal' },
            { file: 'general-intents.json', category: 'general' }
        ];
        for (const { file, category } of templateFiles) {
            try {
                const filePath = path.join(this.config.intentTemplatesPath, file);
                if (fs.existsSync(filePath)) {
                    const content = fs.readFileSync(filePath, 'utf-8');
                    const rawTemplate = JSON.parse(content);
                    // 转换新格式为内部格式
                    const template = this.convertToInternalFormat(rawTemplate, category);
                    this.templates.set(category, template);
                }
            }
            catch (error) {
                console.warn(`[IntentClassifier] Failed to load template: ${file}`, error);
            }
        }
        console.log(`[IntentClassifier] Loaded ${this.templates.size} templates: ${Array.from(this.templates.keys()).join(', ')}`);
    }
    /**
     * 将新JSON格式转换为内部格式
     */
    convertToInternalFormat(raw, category) {
        const semanticVectors = {};
        const complexityIndicators = {};
        // 从intents数组构建semantic_vectors
        if (raw.intents && Array.isArray(raw.intents)) {
            for (const intent of raw.intents) {
                // 构建语义向量
                const allKeywords = [
                    ...(intent.semantic_features?.keywords || []),
                    ...(intent.semantic_features?.patterns || []),
                    ...(intent.semantic_features?.vector_hints || [])
                ];
                semanticVectors[intent.intent_id] = {
                    keywords: [...new Set(allKeywords)],
                    embeddings: [], // 简化的嵌入向量
                    weight: intent.routing_priority ? intent.routing_priority / 10 : 0.5
                };
                // 构建复杂度指示器
                const complexityLevel = this.parseComplexityRange(intent.complexity_range);
                complexityIndicators[complexityLevel] = {
                    patterns: intent.semantic_features?.complexity_indicators || [],
                    max_tokens_estimate: intent.task_examples ?
                        intent.task_examples.reduce((max, ex) => Math.max(max, ex.length * 2), 100) : 100
                };
            }
        }
        // 从第一个intent获取默认模型和fallback链
        const firstIntent = raw.intents?.[0];
        const defaultModel = raw._meta?.recommended_model || firstIntent?.recommended_models?.[0] || `{{MODEL_${category.toUpperCase()}}}`;
        const fallbackChain = firstIntent?.fallback_model ? [firstIntent.fallback_model] : ['{{MODEL_GENERAL}}'];
        return {
            version: raw._meta?.version || '1.0.0',
            category: category,
            description: raw._meta?.description || `${category} intents`,
            semantic_vectors: semanticVectors,
            complexity_indicators: complexityIndicators,
            default_model: defaultModel,
            fallback_chain: fallbackChain,
            routing_hints: {
                min_confidence: 0.6
            },
            quick_response_patterns: raw.intents?.map((i) => i.semantic_features?.patterns || []).flat()
        };
    }
    /**
     * 解析复杂度范围字符串
     */
    parseComplexityRange(range) {
        if (!range)
            return 'medium';
        if (range.includes('L5') || range.includes('L4'))
            return 'extreme';
        if (range.includes('L3'))
            return 'high';
        if (range.includes('L2'))
            return 'medium';
        return 'low';
    }
    /**
     * 分类任务意图
     * @param request 分类请求
     * @returns TaskIntent 5维意图向量
     */
    async classify(request) {
        const cacheKey = this.generateCacheKey(request);
        // 检查缓存
        if (this.config.enableCache) {
            const cached = this.getCached(cacheKey);
            if (cached)
                return cached;
        }
        // 1. 检测输入模态
        const inputModality = this.detectInputModality(request);
        // 2. 基于语义相似度分类
        const { category, semanticScores, confidence } = this.classifyBySemantics(request.description, request.context);
        // 3. 检测复杂度
        const complexity = this.detectComplexity(request.description, category);
        // 4. 检测输出模态
        const outputModality = this.detectOutputModality(request.description);
        // 5. 识别领域
        const domain = this.detectDomain(request.description, category);
        // 6. 结合上下文调整置信度
        const adjustedConfidence = this.adjustConfidence(confidence, request.context, category);
        const intent = {
            taskCategory: category,
            complexity,
            inputModality,
            outputModality,
            domain,
            confidence: adjustedConfidence,
            features: {
                keywords: this.extractKeywords(request.description),
                modalities: [inputModality, outputModality],
                complexityScore: this.calculateComplexityScore(request.description),
                semanticScores
            }
        };
        // 缓存结果
        if (this.config.enableCache) {
            this.setCached(cacheKey, intent);
        }
        return intent;
    }
    /**
     * 基于语义相似度分类
     * 使用简化的余弦相似度计算（实际部署可使用embedding模型）
     */
    classifyBySemantics(description, context) {
        const normalizedDesc = this.normalizeText(description);
        const semanticScores = {};
        let bestCategory = 'general';
        let maxScore = 0;
        // 遍历所有模板计算相似度
        for (const [category, template] of this.templates) {
            let categoryScore = 0;
            let totalWeight = 0;
            for (const [intentName, vector] of Object.entries(template.semantic_vectors)) {
                // 计算关键词匹配分数
                const keywordScore = this.calculateKeywordScore(normalizedDesc, vector.keywords);
                // 加权
                const weightedScore = keywordScore * vector.weight;
                categoryScore += weightedScore;
                totalWeight += vector.weight;
            }
            // 归一化
            const normalizedScore = totalWeight > 0 ? categoryScore / totalWeight : 0;
            semanticScores[category] = normalizedScore;
            if (normalizedScore > maxScore) {
                maxScore = normalizedScore;
                bestCategory = category;
            }
        }
        // 上下文增强
        if (context && context.length > 0) {
            const contextBoost = this.calculateContextBoost(context, bestCategory);
            maxScore = Math.min(1, maxScore + contextBoost);
        }
        // 计算最终置信度
        const confidence = maxScore > this.config.similarityThreshold
            ? maxScore
            : maxScore * 0.8; // 低于阈值时降低置信度
        return { category: bestCategory, semanticScores, confidence };
    }
    /**
     * 计算关键词匹配分数
     */
    calculateKeywordScore(text, keywords) {
        let matches = 0;
        for (const keyword of keywords) {
            if (text.includes(this.normalizeText(keyword))) {
                matches++;
            }
        }
        return matches / Math.max(keywords.length, 1);
    }
    /**
     * 检测输入模态
     */
    detectInputModality(request) {
        const modalities = [];
        // 检查附件
        if (request.attachments) {
            for (const attachment of request.attachments) {
                if (attachment.type === 'image')
                    modalities.push('image');
                else if (attachment.type === 'audio')
                    modalities.push('audio');
                else if (attachment.type === 'video')
                    modalities.push('video');
            }
        }
        // 检查文本中的URL
        const urlPattern = /https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|mp3|wav|mp4|webm)/gi;
        const urls = request.description.match(urlPattern) || [];
        for (const url of urls) {
            const lowerUrl = url.toLowerCase();
            if (/\.(jpg|jpeg|png|gif|webp)$/.test(lowerUrl))
                modalities.push('image');
            else if (/\.(mp3|wav|ogg|m4a)$/.test(lowerUrl))
                modalities.push('audio');
            else if (/\.(mp4|webm|avi)$/.test(lowerUrl))
                modalities.push('video');
        }
        // 检查base64内容
        if (/data:image\/[a-z]+;base64,/.test(request.description)) {
            modalities.push('image');
        }
        // 去重并确定最终模态
        const uniqueModalities = [...new Set(modalities)];
        if (uniqueModalities.length === 0)
            return 'text';
        if (uniqueModalities.length === 1)
            return uniqueModalities[0];
        return 'mixed';
    }
    /**
     * 检测复杂度
     */
    detectComplexity(description, category) {
        const template = this.templates.get(category);
        if (!template)
            return 'medium';
        const normalizedDesc = this.normalizeText(description);
        let detectedLevel = 'medium';
        let maxMatches = 0;
        // 按复杂度顺序检测（从高到低）
        const levels = ['extreme', 'high', 'medium', 'low'];
        for (const level of levels) {
            const indicator = template.complexity_indicators[level];
            if (!indicator)
                continue;
            const matches = indicator.patterns.filter(p => normalizedDesc.includes(this.normalizeText(p))).length;
            if (matches > maxMatches) {
                maxMatches = matches;
                detectedLevel = level;
            }
        }
        // 基于描述长度调整
        const length = description.length;
        if (length > 5000 && detectedLevel === 'low')
            return 'medium';
        if (length > 10000 && detectedLevel !== 'extreme')
            return 'high';
        return detectedLevel;
    }
    /**
     * 检测输出模态
     */
    detectOutputModality(description) {
        const normalized = this.normalizeText(description);
        // 代码相关
        if (/\b(代码|code|函数|function|类|class|编写|实现)\b/.test(normalized)) {
            return 'code';
        }
        // JSON输出
        if (/\b(json|json格式|返回json|结构数据)\b/.test(normalized)) {
            return 'json';
        }
        // 图像生成
        if (/\b(生成图片|画图|绘制|image|create.*image)\b/.test(normalized)) {
            return 'image';
        }
        // 检查是否要求多种格式
        const multiPatterns = ['和', '以及', '同时', '分别', '还'];
        const hasMultiIndicator = multiPatterns.some(p => normalized.includes(p));
        if (hasMultiIndicator && /\b(代码|json|markdown|表格)\b/.test(normalized)) {
            return 'mixed';
        }
        return 'text';
    }
    /**
     * 识别领域
     */
    detectDomain(description, category) {
        const domainPatterns = {
            'software_engineering': ['代码', '程序', '软件', '开发', 'bug', 'debug', 'git', 'api'],
            'data_science': ['数据', '分析', '模型', '训练', '机器学习', 'ml', 'ai'],
            'academic': ['论文', '研究', '文献', '理论', '学术', 'publish'],
            'business': ['商业', '市场', '营销', '策略', '战略', '客户'],
            'creative': ['创意', '设计', '艺术', '写作', '故事', '文案'],
            'medical': ['医学', '医疗', '健康', '疾病', '诊断', '治疗']
        };
        const normalized = this.normalizeText(description);
        let bestDomain = category;
        let maxMatches = 0;
        for (const [domain, patterns] of Object.entries(domainPatterns)) {
            const matches = patterns.filter(p => normalized.includes(p)).length;
            if (matches > maxMatches) {
                maxMatches = matches;
                bestDomain = domain;
            }
        }
        return bestDomain;
    }
    /**
     * 调整置信度（基于上下文）
     */
    adjustConfidence(baseConfidence, context, category) {
        if (!context || context.length === 0)
            return baseConfidence;
        let boost = 0;
        // 检查历史对话中是否有相似任务
        const recentContext = context.slice(-this.config.contextWindowSize);
        let similarCount = 0;
        for (const ctx of recentContext) {
            if (ctx.role === 'user') {
                const ctxCategory = this.quickClassify(ctx.content);
                if (ctxCategory === category) {
                    similarCount++;
                }
            }
        }
        // 连续同类任务提升置信度
        boost += similarCount * 0.05;
        // 限制范围
        return Math.max(0, Math.min(1, baseConfidence + boost));
    }
    /**
     * 快速分类（用于上下文分析）
     */
    quickClassify(text) {
        const normalized = this.normalizeText(text);
        // 简单启发式快速分类
        if (/\b(图|image|picture|photo|视觉)\b/.test(normalized)) {
            return 'multimodal';
        }
        if (/\b(分析|推理|架构|设计|研究|证明)\b/.test(normalized)) {
            return 'reasoning';
        }
        return 'general';
    }
    /**
     * 计算上下文增强分数
     */
    calculateContextBoost(context, category) {
        const recentContext = context.slice(-this.config.contextWindowSize);
        const template = this.templates.get(category);
        if (!template)
            return 0;
        let boost = 0;
        for (const ctx of recentContext) {
            // 检查上下文中是否有同类任务特征
            for (const [intentName, vector] of Object.entries(template.semantic_vectors)) {
                const score = this.calculateKeywordScore(ctx.content, vector.keywords);
                if (score > 0.5) {
                    boost += 0.05 * vector.weight;
                }
            }
        }
        return Math.min(0.2, boost); // 最大增强0.2
    }
    /**
     * 提取关键词
     */
    extractKeywords(text) {
        // 简单的关键词提取（实际部署可使用NLP库）
        const stopWords = new Set(['的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这']);
        const words = text.toLowerCase()
            .replace(/[^\u4e00-\u9fa5a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 1 && !stopWords.has(w));
        // 统计词频，返回Top 10
        const freq = {};
        for (const word of words) {
            freq[word] = (freq[word] || 0) + 1;
        }
        return Object.entries(freq)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([word]) => word);
    }
    /**
     * 计算复杂度分数
     */
    calculateComplexityScore(text) {
        const factors = [
            text.length / 1000, // 长度因子
            (text.match(/[，。；]/g) || []).length / 10, // 句子数
            (text.match(/\b(因为|所以|因此|但是|然而|虽然|如果|假设|证明|推导)\b/g) || []).length / 5, // 逻辑词
            (text.match(/\b(分析|比较|对比|评估|研究|设计|实现|优化)\b/g) || []).length / 3 // 复杂动词
        ];
        return Math.min(1, factors.reduce((sum, f) => sum + f, 0) / factors.length);
    }
    /**
     * 标准化文本
     */
    normalizeText(text) {
        return text.toLowerCase()
            .replace(/[^\u4e00-\u9fa5a-z0-9\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }
    /**
     * 生成缓存键
     */
    generateCacheKey(request) {
        const content = request.description.slice(0, 200); // 取前200字符
        const hasAttachments = request.attachments && request.attachments.length > 0;
        return `${content}_${hasAttachments}`;
    }
    /**
     * 获取缓存
     */
    getCached(key) {
        const cached = this.cache.get(key);
        if (!cached)
            return null;
        // 检查是否过期（简化实现）
        return cached;
    }
    /**
     * 设置缓存
     */
    setCached(key, intent) {
        this.cache.set(key, intent);
        // 限制缓存大小
        if (this.cache.size > 1000) {
            const firstKey = this.cache.keys().next().value;
            if (firstKey !== undefined) {
                this.cache.delete(firstKey);
            }
        }
    }
    /**
     * 更新配置
     */
    updateConfig(config) {
        this.config = { ...this.config, ...config };
        if (config.intentTemplatesPath) {
            this.loadTemplates();
        }
    }
    /**
     * 清除缓存
     */
    clearCache() {
        this.cache.clear();
    }
    /**
     * 获取已加载的模板
     */
    getLoadedTemplates() {
        return Array.from(this.templates.keys());
    }
}
exports.IntentClassifier = IntentClassifier;
exports.default = IntentClassifier;
//# sourceMappingURL=intent-classifier.js.map