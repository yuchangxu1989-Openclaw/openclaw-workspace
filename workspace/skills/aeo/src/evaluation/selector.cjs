/**
 * selector.cjs - 轨道自动选择器
 * 根据技能类型和特性自动选择AI效果轨道或功能质量轨道
 */

const fs = require('fs');
const path = require('path');

/**
 * 轨道类型定义
 */
const TRACKS = {
  AI_EFFECT: 'ai-effect',           // AI效果轨道
  FUNCTIONAL_QUALITY: 'functional-quality',  // 功能质量轨道
  HYBRID: 'hybrid'                  // 混合轨道
};

/**
 * 技能类型到轨道的映射
 */
const SKILL_TYPE_MAPPING = {
  // AI效果轨道技能类型
  'llm': { primary: TRACKS.AI_EFFECT, confidence: 0.95 },
  'chat': { primary: TRACKS.AI_EFFECT, confidence: 0.95 },
  'generation': { primary: TRACKS.AI_EFFECT, confidence: 0.95 },
  'conversation': { primary: TRACKS.AI_EFFECT, confidence: 0.9 },
  'creative': { primary: TRACKS.AI_EFFECT, confidence: 0.9 },
  'writing': { primary: TRACKS.AI_EFFECT, confidence: 0.9 },
  
  // 功能质量轨道技能类型
  'tool': { primary: TRACKS.FUNCTIONAL_QUALITY, confidence: 0.95 },
  'workflow': { primary: TRACKS.FUNCTIONAL_QUALITY, confidence: 0.95 },
  'automation': { primary: TRACKS.FUNCTIONAL_QUALITY, confidence: 0.9 },
  'integration': { primary: TRACKS.FUNCTIONAL_QUALITY, confidence: 0.9 },
  'utility': { primary: TRACKS.FUNCTIONAL_QUALITY, confidence: 0.85 },
  
  // 混合轨道技能类型
  'hybrid': { primary: TRACKS.HYBRID, confidence: 0.8 },
  'agent': { primary: TRACKS.HYBRID, confidence: 0.85 },
  'assistant': { primary: TRACKS.HYBRID, confidence: 0.8 }
};

/**
 * 轨道选择器类
 */
class TrackSelector {
  constructor(configPath = null) {
    this.config = this._loadConfig(configPath);
    this.selectionHistory = [];
  }

  /**
   * 加载配置
   */
  _loadConfig(configPath) {
    if (configPath && fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
    
    // 默认配置
    return {
      defaultTrack: TRACKS.AI_EFFECT,
      hybridThreshold: 0.7,
      confidenceThreshold: 0.6,
      autoDetectFromCode: true,
      autoDetectFromDescription: true
    };
  }

  /**
   * 选择轨道 - 主入口
   * @param {Object} skillInfo - 技能信息
   * @param {string} skillInfo.name - 技能名称
   * @param {string} skillInfo.type - 技能类型
   * @param {string} skillInfo.description - 技能描述
   * @param {string} skillInfo.path - 技能路径
   * @returns {Object} 选择结果
   */
  select(skillInfo) {
    const startTime = Date.now();
    
    // 1. 基于类型直接映射
    let selection = this._selectByType(skillInfo.type);
    
    // 2. 如果没有明确类型或置信度低，进行深度分析
    if (selection.confidence < this.config.confidenceThreshold) {
      const codeAnalysis = this._analyzeCode(skillInfo.path);
      const descAnalysis = this._analyzeDescription(skillInfo.description);
      
      selection = this._mergeAnalysis(selection, codeAnalysis, descAnalysis);
    }
    
    // 3. 检查是否需要混合轨道
    if (selection.confidence >= this.config.hybridThreshold && 
        selection.track === TRACKS.HYBRID) {
      selection = this._configureHybridTrack(selection, skillInfo);
    }
    
    // 4. 构建最终结果
    const result = {
      track: selection.track,
      confidence: selection.confidence,
      reason: selection.reason,
      skillName: skillInfo.name,
      skillType: skillInfo.type,
      evaluator: this._getEvaluatorModule(selection.track),
      config: this._getTrackConfig(selection.track),
      selectedAt: new Date().toISOString(),
      processingTimeMs: Date.now() - startTime
    };
    
    // 记录历史
    this.selectionHistory.push(result);
    
    return result;
  }

  /**
   * 基于技能类型选择轨道
   */
  _selectByType(skillType) {
    if (!skillType) {
      return {
        track: this.config.defaultTrack,
        confidence: 0.5,
        reason: '未指定技能类型，使用默认轨道'
      };
    }
    
    const type = skillType.toLowerCase().trim();
    const mapping = SKILL_TYPE_MAPPING[type];
    
    if (mapping) {
      return {
        track: mapping.primary,
        confidence: mapping.confidence,
        reason: `基于技能类型"${skillType}"直接映射`
      };
    }
    
    // 模糊匹配
    for (const [key, value] of Object.entries(SKILL_TYPE_MAPPING)) {
      if (type.includes(key) || key.includes(type)) {
        return {
          track: value.primary,
          confidence: value.confidence * 0.8,
          reason: `基于技能类型模糊匹配"${key}"`
        };
      }
    }
    
    return {
      track: this.config.defaultTrack,
      confidence: 0.5,
      reason: '技能类型未识别，使用默认轨道'
    };
  }

  /**
   * 分析代码特征
   */
  _analyzeCode(skillPath) {
    if (!skillPath || !this.config.autoDetectFromCode || !fs.existsSync(skillPath)) {
      return null;
    }
    
    try {
      const files = this._getCodeFiles(skillPath);
      let aiIndicators = 0;
      let funcIndicators = 0;
      
      const aiPatterns = [
        /llm|ai|gpt|claude|kimi|glm|generate|chat|completion/i,
        /prompt|temperature|max_tokens|embeddings/i,
        /creative|write|compose|draft/i
      ];
      
      const funcPatterns = [
        /api|request|fetch|axios|http/i,
        /database|db|query|sql|mongo/i,
        /file|read|write|fs\./i,
        /schedule|cron|timer|interval/i
      ];
      
      for (const file of files.slice(0, 5)) {  // 最多分析5个文件
        try {
          const content = fs.readFileSync(file, 'utf8');
          aiPatterns.forEach(p => { if (p.test(content)) aiIndicators++; });
          funcPatterns.forEach(p => { if (p.test(content)) funcIndicators++; });
        } catch (e) {}
      }
      
      const total = aiIndicators + funcIndicators;
      if (total === 0) return null;
      
      const aiRatio = aiIndicators / total;
      
      if (aiRatio > 0.7) {
        return { track: TRACKS.AI_EFFECT, confidence: 0.75, indicators: aiIndicators };
      } else if (aiRatio < 0.3) {
        return { track: TRACKS.FUNCTIONAL_QUALITY, confidence: 0.75, indicators: funcIndicators };
      } else {
        return { track: TRACKS.HYBRID, confidence: 0.7, indicators: total };
      }
    } catch (e) {
      return null;
    }
  }

  /**
   * 分析描述文本
   */
  _analyzeDescription(description) {
    if (!description || !this.config.autoDetectFromDescription) {
      return null;
    }
    
    const desc = description.toLowerCase();
    
    const aiKeywords = ['生成', '写作', '对话', '回答', '创意', '文本', '内容', 'ai', 'llm', 'gpt', 'generate', 'write', 'chat', 'creative'];
    const funcKeywords = ['工具', '自动化', '工作流', '集成', 'API', '数据', '文件', '定时', 'tool', 'automation', 'workflow', 'integration', 'schedule'];
    
    let aiScore = 0;
    let funcScore = 0;
    
    aiKeywords.forEach(kw => { if (desc.includes(kw)) aiScore++; });
    funcKeywords.forEach(kw => { if (desc.includes(kw)) funcScore++; });
    
    const total = aiScore + funcScore;
    if (total === 0) return null;
    
    const aiRatio = aiScore / total;
    
    if (aiRatio > 0.6) {
      return { track: TRACKS.AI_EFFECT, confidence: 0.7, score: aiScore };
    } else if (aiRatio < 0.4) {
      return { track: TRACKS.FUNCTIONAL_QUALITY, confidence: 0.7, score: funcScore };
    } else {
      return { track: TRACKS.HYBRID, confidence: 0.65, score: total };
    }
  }

  /**
   * 合并多种分析结果
   */
  _mergeAnalysis(typeAnalysis, codeAnalysis, descAnalysis) {
    const analyses = [typeAnalysis, codeAnalysis, descAnalysis].filter(Boolean);
    
    if (analyses.length === 1) return analyses[0];
    
    // 统计各轨道得票
    const votes = {};
    analyses.forEach(a => {
      votes[a.track] = (votes[a.track] || 0) + a.confidence;
    });
    
    // 找出最高分的轨道
    let bestTrack = typeAnalysis.track;
    let bestScore = 0;
    
    for (const [track, score] of Object.entries(votes)) {
      if (score > bestScore) {
        bestScore = score;
        bestTrack = track;
      }
    }
    
    const avgConfidence = analyses.reduce((sum, a) => sum + a.confidence, 0) / analyses.length;
    
    return {
      track: bestTrack,
      confidence: Math.min(avgConfidence * 1.1, 0.95),
      reason: `综合分析结果：类型分析 + 代码分析 + 描述分析`
    };
  }

  /**
   * 配置混合轨道
   */
  _configureHybridTrack(selection, skillInfo) {
    return {
      ...selection,
      hybridConfig: {
        primaryTrack: this._guessPrimaryTrack(skillInfo),
        secondaryTrack: this._guessSecondaryTrack(skillInfo),
        weightRatio: 0.6  // 主轨道权重60%
      }
    };
  }

  /**
   * 猜测主轨道
   */
  _guessPrimaryTrack(skillInfo) {
    const desc = (skillInfo.description || '').toLowerCase();
    const aiKeywords = ['ai', 'llm', '生成', '对话', '写作'];
    return aiKeywords.some(kw => desc.includes(kw)) ? TRACKS.AI_EFFECT : TRACKS.FUNCTIONAL_QUALITY;
  }

  /**
   * 猜测次轨道
   */
  _guessSecondaryTrack(skillInfo) {
    const primary = this._guessPrimaryTrack(skillInfo);
    return primary === TRACKS.AI_EFFECT ? TRACKS.FUNCTIONAL_QUALITY : TRACKS.AI_EFFECT;
  }

  /**
   * 获取代码文件列表
   */
  _getCodeFiles(dirPath) {
    const files = [];
    const extensions = ['.js', '.cjs', '.ts', '.py', '.java', '.go'];
    
    try {
      const entries = fs.readdirSync(dirPath);
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry);
        const stat = fs.statSync(fullPath);
        
        if (stat.isFile() && extensions.some(ext => entry.endsWith(ext))) {
          files.push(fullPath);
        }
      }
    } catch (e) {}
    
    return files;
  }

  /**
   * 获取评测模块路径
   */
  _getEvaluatorModule(track) {
    switch (track) {
      case TRACKS.AI_EFFECT:
        return './ai-effect-evaluator.cjs';
      case TRACKS.FUNCTIONAL_QUALITY:
        return './function-quality-evaluator.cjs';
      case TRACKS.HYBRID:
        return ['./ai-effect-evaluator.cjs', './function-quality-evaluator.cjs'];
      default:
        return './ai-effect-evaluator.cjs';
    }
  }

  /**
   * 获取轨道配置
   */
  _getTrackConfig(track) {
    const configs = {
      [TRACKS.AI_EFFECT]: {
        name: 'AI效果轨道',
        dimensions: ['relevance', 'coherence', 'helpfulness', 'creativity', 'safety'],
        threshold: 0.75
      },
      [TRACKS.FUNCTIONAL_QUALITY]: {
        name: '功能质量轨道',
        dimensions: ['accuracy', 'responseTime', 'errorRate', 'compatibility', 'stability'],
        threshold: 0.85
      },
      [TRACKS.HYBRID]: {
        name: '混合轨道',
        dimensions: ['relevance', 'helpfulness', 'accuracy', 'stability'],
        threshold: 0.8
      }
    };
    return configs[track] || configs[TRACKS.AI_EFFECT];
  }

  /**
   * 批量选择
   */
  selectBatch(skillInfos) {
    return skillInfos.map(info => this.select(info));
  }

  /**
   * 获取选择历史
   */
  getHistory() {
    return this.selectionHistory;
  }

  /**
   * 导出统计
   */
  getStats() {
    const stats = {
      total: this.selectionHistory.length,
      byTrack: {}
    };
    
    this.selectionHistory.forEach(h => {
      stats.byTrack[h.track] = (stats.byTrack[h.track] || 0) + 1;
    });
    
    return stats;
  }
}

module.exports = { TrackSelector, TRACKS };

// CLI支持
if (require.main === module) {
  const selector = new TrackSelector();
  
  const skillInfo = {
    name: process.argv[2] || 'test-skill',
    type: process.argv[3] || 'llm',
    description: process.argv[4] || '一个AI技能',
    path: process.argv[5] || null
  };
  
  const result = selector.select(skillInfo);
  console.log(JSON.stringify(result, null, 2));
}
