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
/**
 * 任务意图 - 5维向量
 */
export interface TaskIntent {
    /** 任务类别 */
    taskCategory: 'reasoning' | 'multimodal' | 'general';
    /** 复杂度等级 */
    complexity: 'low' | 'medium' | 'high' | 'extreme';
    /** 输入模态 */
    inputModality: 'text' | 'image' | 'video' | 'audio' | 'mixed';
    /** 输出模态 */
    outputModality: 'text' | 'image' | 'code' | 'json' | 'mixed';
    /** 领域标签 */
    domain: string;
    /** 置信度 0.0-1.0 */
    confidence: number;
    /** 识别的原始特征 */
    features?: IntentFeatures;
}
/**
 * 意图特征
 */
export interface IntentFeatures {
    /** 检测到的关键词 */
    keywords: string[];
    /** 模态检测结果 */
    modalities: string[];
    /** 复杂度指标 */
    complexityScore: number;
    /** 语义相似度分数 */
    semanticScores: Record<string, number>;
}
/**
 * 意图分类器配置
 */
export interface IntentClassifierConfig {
    /** 嵌入模型占位符 */
    embeddingModel: string;
    /** 相似度阈值 */
    similarityThreshold: number;
    /** 上下文窗口大小 */
    contextWindowSize: number;
    /** 意图模板路径 */
    intentTemplatesPath: string;
    /** 是否使用缓存 */
    enableCache: boolean;
}
/**
 * 分类请求
 */
export interface ClassificationRequest {
    /** 任务描述 */
    description: string;
    /** 历史上下文 */
    context?: TaskContext[];
    /** 输入附件 */
    attachments?: Attachment[];
}
/**
 * 任务上下文
 */
export interface TaskContext {
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
}
/**
 * 附件
 */
export interface Attachment {
    type: 'image' | 'audio' | 'video' | 'file';
    mimeType: string;
    content?: string;
    url?: string;
}
export declare class IntentClassifier {
    private config;
    private templates;
    private cache;
    private cacheTTL;
    constructor(config?: Partial<IntentClassifierConfig>);
    /**
     * 加载意图模板
     * 适配新的JSON格式（包含_meta和intents数组）
     */
    private loadTemplates;
    /**
     * 将新JSON格式转换为内部格式
     */
    private convertToInternalFormat;
    /**
     * 解析复杂度范围字符串
     */
    private parseComplexityRange;
    /**
     * 分类任务意图
     * @param request 分类请求
     * @returns TaskIntent 5维意图向量
     */
    classify(request: ClassificationRequest): Promise<TaskIntent>;
    /**
     * 基于语义相似度分类
     * 使用简化的余弦相似度计算（实际部署可使用embedding模型）
     */
    private classifyBySemantics;
    /**
     * 计算关键词匹配分数
     */
    private calculateKeywordScore;
    /**
     * 检测输入模态
     */
    private detectInputModality;
    /**
     * 检测复杂度
     */
    private detectComplexity;
    /**
     * 检测输出模态
     */
    private detectOutputModality;
    /**
     * 识别领域
     */
    private detectDomain;
    /**
     * 调整置信度（基于上下文）
     */
    private adjustConfidence;
    /**
     * 快速分类（用于上下文分析）
     */
    private quickClassify;
    /**
     * 计算上下文增强分数
     */
    private calculateContextBoost;
    /**
     * 提取关键词
     */
    private extractKeywords;
    /**
     * 计算复杂度分数
     */
    private calculateComplexityScore;
    /**
     * 标准化文本
     */
    private normalizeText;
    /**
     * 生成缓存键
     */
    private generateCacheKey;
    /**
     * 获取缓存
     */
    private getCached;
    /**
     * 设置缓存
     */
    private setCached;
    /**
     * 更新配置
     */
    updateConfig(config: Partial<IntentClassifierConfig>): void;
    /**
     * 清除缓存
     */
    clearCache(): void;
    /**
     * 获取已加载的模板
     */
    getLoadedTemplates(): string[];
}
export default IntentClassifier;
//# sourceMappingURL=intent-classifier.d.ts.map