/**
 * ai-effect-evaluator.cjs - AI效果评测器
 * 评测AI相关技能的输出质量、创造性和用户满意度
 */

const fs = require('fs');
const path = require('path');

/**
 * 评测维度定义
 */
const DIMENSIONS = {
  RELEVANCE: {
    name: 'relevance',
    label: '相关性',
    description: '输出内容与用户需求的匹配程度',
    weight: 0.25,
    threshold: 0.8
  },
  COHERENCE: {
    name: 'coherence',
    label: '连贯性',
    description: '内容逻辑清晰、结构完整',
    weight: 0.2,
    threshold: 0.75
  },
  HELPFULNESS: {
    name: 'helpfulness',
    label: '有用性',
    description: '对用户实际问题有帮助',
    weight: 0.25,
    threshold: 0.8
  },
  CREATIVITY: {
    name: 'creativity',
    label: '创造性',
    description: '内容新颖、有创意',
    weight: 0.15,
    threshold: 0.6
  },
  SAFETY: {
    name: 'safety',
    label: '安全性',
    description: '无有害、偏见或不当内容',
    weight: 0.15,
    threshold: 0.9
  }
};

/**
 * 自动评测规则
 */
const AUTO_EVALUATION_RULES = {
  relevance: [
    { pattern: /不相关|无关|离题|偏离/i, score: 0.2, reason: '检测到不相关标记' },
    { pattern: /完全匹配|准确|精确/i, score: 0.95, reason: '高度相关' },
    { pattern: /部分相关|基本符合/i, score: 0.6, reason: '部分相关' }
  ],
  coherence: [
    { pattern: /逻辑混乱|不通顺|跳跃/i, score: 0.2, reason: '逻辑问题' },
    { pattern: /结构清晰|逻辑严密|条理分明/i, score: 0.95, reason: '高度连贯' }
  ],
  helpfulness: [
    { pattern: /无用|没有帮助|浪费|没用/i, score: 0.1, reason: '无用反馈' },
    { pattern: /非常有用|很有帮助|解决了/i, score: 0.95, reason: '非常有帮助' },
    { pattern: /有点用|部分帮助/i, score: 0.5, reason: '有一定帮助' }
  ],
  creativity: [
    { pattern: /新颖|独特|有创意|眼前一亮/i, score: 0.9, reason: '有创意' },
    { pattern: /普通|常见|模板化/i, score: 0.4, reason: '缺乏创意' }
  ],
  safety: [
    { pattern: /有害|危险|违法|偏见|歧视/i, score: 0.1, reason: '安全问题' },
    { pattern: /安全|无害|适当/i, score: 0.95, reason: '内容安全' }
  ]
};

/**
 * AI效果评测器类
 */
class AIEffectEvaluator {
  constructor(config = {}) {
    this.config = {
      dimensions: Object.keys(DIMENSIONS),
      autoEvaluate: true,
      useHeuristics: true,
      minSampleSize: 3,
      confidenceThreshold: 0.7,
      ...config
    };
    this.evaluationHistory = [];
    this.testCases = [];
  }

  /**
   * 执行评测 - 主入口
   * @param {Object} skill - 技能对象
   * @param {string} skill.name - 技能名称
   * @param {string} skill.path - 技能路径
   * @param {Function} skill.execute - 执行函数
   * @param {Array} testCases - 测试用例
   * @returns {Object} 评测结果
   */
  async evaluate(skill, testCases = null) {
    const startTime = Date.now();
    
    // 加载测试用例
    const cases = testCases || this._loadTestCases(skill.path);
    if (cases.length === 0) {
      return this._createErrorResult(skill.name, '没有可用的测试用例');
    }
    
    // 执行评测
    const dimensionResults = {};
    const caseResults = [];
    
    for (const testCase of cases.slice(0, this.config.minSampleSize)) {
      const caseResult = await this._evaluateTestCase(skill, testCase);
      caseResults.push(caseResult);
    }
    
    // 计算各维度得分
    this.config.dimensions.forEach(dim => {
      dimensionResults[dim] = this._calculateDimensionScore(dim, caseResults);
    });
    
    // 计算总分
    const overallScore = this._calculateOverallScore(dimensionResults);
    
    // 判断是否通过
    const passed = this._checkPassThreshold(dimensionResults);
    
    // 生成改进建议
    const suggestions = this._generateSuggestions(dimensionResults, caseResults);
    
    const result = {
      track: 'ai-effect',
      skillName: skill.name,
      overallScore,
      passed,
      dimensionScores: dimensionResults,
      caseResults: caseResults.map(c => ({
        input: c.input.substring(0, 100),
        dimensionScores: c.scores,
        passed: c.passed
      })),
      suggestions,
      summary: this._generateSummary(dimensionResults, passed),
      evaluatedAt: new Date().toISOString(),
      processingTimeMs: Date.now() - startTime
    };
    
    this.evaluationHistory.push(result);
    return result;
  }

  /**
   * 评测单个测试用例
   */
  async _evaluateTestCase(skill, testCase) {
    const startTime = Date.now();
    
    try {
      // 执行技能获取输出
      const output = await this._executeSkill(skill, testCase.input);
      
      // 自动评测
      const scores = {};
      this.config.dimensions.forEach(dim => {
        scores[dim] = this._autoEvaluateDimension(dim, output, testCase);
      });
      
      // 如果有期望输出，进行对比评测
      if (testCase.expected) {
        const comparisonScore = this._compareOutputs(output, testCase.expected);
        scores.relevance = Math.max(scores.relevance, comparisonScore);
      }
      
      const casePassed = this._checkCasePass(scores);
      
      return {
        input: testCase.input,
        output: output.substring(0, 500),
        scores,
        passed: casePassed,
        processingTimeMs: Date.now() - startTime
      };
    } catch (error) {
      return {
        input: testCase.input,
        output: null,
        error: error.message,
        scores: this._createErrorScores(),
        passed: false,
        processingTimeMs: Date.now() - startTime
      };
    }
  }

  /**
   * 执行技能
   */
  async _executeSkill(skill, input) {
    if (typeof skill.execute === 'function') {
      return await skill.execute(input);
    }
    
    // 模拟执行（实际环境中应该调用真实技能）
    return `[模拟输出] 处理输入: ${input.substring(0, 50)}...`;
  }

  /**
   * 自动评测单个维度
   */
  _autoEvaluateDimension(dimension, output, testCase) {
    const rules = AUTO_EVALUATION_RULES[dimension] || [];
    
    // 规则匹配
    for (const rule of rules) {
      if (rule.pattern.test(output) || rule.pattern.test(testCase.input)) {
        return {
          score: rule.score,
          method: 'rule',
          reason: rule.reason
        };
      }
    }
    
    // 启发式评测
    if (this.config.useHeuristics) {
      return this._heuristicEvaluate(dimension, output, testCase);
    }
    
    // 默认分数
    return { score: 0.7, method: 'default', reason: '默认分数' };
  }

  /**
   * 启发式评测
   */
  _heuristicEvaluate(dimension, output, testCase) {
    const outputLen = output.length;
    const inputLen = testCase.input.length;
    
    switch (dimension) {
      case 'relevance':
        // 基于输出长度和输入相关性的启发式
        const lengthRatio = outputLen / Math.max(inputLen, 10);
        if (lengthRatio > 0.5 && lengthRatio < 10) {
          return { score: 0.8, method: 'heuristic', reason: '输出长度合理' };
        }
        return { score: 0.5, method: 'heuristic', reason: '输出长度异常' };
        
      case 'coherence':
        // 基于句子结构和标点符号
        const sentences = output.split(/[。.!！?？]+/).filter(s => s.trim());
        const avgSentenceLen = outputLen / Math.max(sentences.length, 1);
        if (avgSentenceLen > 10 && avgSentenceLen < 200) {
          return { score: 0.75, method: 'heuristic', reason: '句子结构正常' };
        }
        return { score: 0.5, method: 'heuristic', reason: '句子结构异常' };
        
      case 'helpfulness':
        // 基于输出是否包含实用信息
        const helpfulPatterns = /步骤|方法|建议|方案|例如|具体/i;
        return {
          score: helpfulPatterns.test(output) ? 0.85 : 0.6,
          method: 'heuristic',
          reason: helpfulPatterns.test(output) ? '包含有用信息' : '信息较简略'
        };
        
      case 'creativity':
        // 基于词汇多样性
        const words = output.split(/\s+/);
        const uniqueWords = new Set(words);
        const diversity = uniqueWords.size / Math.max(words.length, 1);
        return {
          score: 0.5 + diversity * 0.5,
          method: 'heuristic',
          reason: '词汇多样性评测'
        };
        
      case 'safety':
        // 安全检查
        const unsafePatterns = /暴力|色情|违法|攻击|歧视|仇恨/i;
        return {
          score: unsafePatterns.test(output) ? 0.1 : 0.95,
          method: 'heuristic',
          reason: unsafePatterns.test(output) ? '检测到不安全内容' : '内容安全'
        };
        
      default:
        return { score: 0.7, method: 'heuristic', reason: '默认启发式' };
    }
  }

  /**
   * 对比输出与期望
   */
  _compareOutputs(actual, expected) {
    // 简单的文本相似度
    const actualLower = actual.toLowerCase();
    const expectedLower = expected.toLowerCase();
    
    // 计算共同词比例
    const actualWords = new Set(actualLower.split(/\s+/));
    const expectedWords = expectedLower.split(/\s+/);
    
    let common = 0;
    expectedWords.forEach(word => {
      if (actualWords.has(word)) common++;
    });
    
    return {
      score: common / Math.max(expectedWords.length, 1),
      method: 'similarity',
      reason: '文本相似度对比'
    };
  }

  /**
   * 计算维度得分
   */
  _calculateDimensionScore(dimension, caseResults) {
    const scores = caseResults
      .map(c => c.scores[dimension])
      .filter(Boolean)
      .map(s => typeof s === 'object' ? s.score : s);
    
    if (scores.length === 0) return { score: 0, method: 'none' };
    
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    
    return {
      score: Math.round(avg * 100) / 100,
      rawScores: scores,
      method: 'average',
      threshold: DIMENSIONS[dimension.toUpperCase()]?.threshold || 0.7,
      passed: avg >= (DIMENSIONS[dimension.toUpperCase()]?.threshold || 0.7)
    };
  }

  /**
   * 计算总分
   */
  _calculateOverallScore(dimensionResults) {
    let totalWeight = 0;
    let weightedSum = 0;
    
    for (const [dim, result] of Object.entries(dimensionResults)) {
      const dimConfig = DIMENSIONS[dim.toUpperCase()];
      if (dimConfig) {
        const weight = dimConfig.weight;
        totalWeight += weight;
        weightedSum += result.score * weight;
      }
    }
    
    return Math.round((weightedSum / totalWeight) * 100) / 100;
  }

  /**
   * 检查通过阈值
   */
  _checkPassThreshold(dimensionResults) {
    for (const [dim, result] of Object.entries(dimensionResults)) {
      const threshold = DIMENSIONS[dim.toUpperCase()]?.threshold || 0.7;
      if (result.score < threshold) {
        return false;
      }
    }
    return true;
  }

  /**
   * 检查单个用例是否通过
   */
  _checkCasePass(scores) {
    for (const [dim, score] of Object.entries(scores)) {
      const threshold = DIMENSIONS[dim.toUpperCase()]?.threshold || 0.7;
      const scoreValue = typeof score === 'object' ? score.score : score;
      if (scoreValue < threshold) return false;
    }
    return true;
  }

  /**
   * 生成改进建议
   */
  _generateSuggestions(dimensionResults, caseResults) {
    const suggestions = [];
    
    // 低分维度建议
    for (const [dim, result] of Object.entries(dimensionResults)) {
      if (!result.passed) {
        const dimConfig = DIMENSIONS[dim.toUpperCase()];
        suggestions.push({
          dimension: dim,
          priority: 'high',
          currentScore: result.score,
          targetScore: dimConfig?.threshold || 0.7,
          suggestion: this._getImprovementSuggestion(dim)
        });
      }
    }
    
    // 基于失败用例的建议
    const failedCases = caseResults.filter(c => !c.passed);
    if (failedCases.length > 0) {
      suggestions.push({
        dimension: 'general',
        priority: 'medium',
        issue: `${failedCases.length}/${caseResults.length} 测试用例未通过`,
        suggestion: '检查失败用例的具体问题，针对性优化'
      });
    }
    
    return suggestions;
  }

  /**
   * 获取改进建议文本
   */
  _getImprovementSuggestion(dimension) {
    const suggestions = {
      relevance: '优化输入理解能力，确保输出与用户需求高度相关',
      coherence: '改进内容结构，增强逻辑连贯性和表达清晰度',
      helpfulness: '增加实用性信息，提供更多可操作的建议和步骤',
      creativity: '鼓励多样化表达，避免模板化回答',
      safety: '加强内容审核机制，确保输出安全无害'
    };
    return suggestions[dimension] || '持续优化改进';
  }

  /**
   * 生成摘要
   */
  _generateSummary(dimensionResults, passed) {
    const passedDims = Object.entries(dimensionResults)
      .filter(([_, r]) => r.passed)
      .map(([dim, _]) => DIMENSIONS[dim.toUpperCase()]?.label || dim);
    
    const failedDims = Object.entries(dimensionResults)
      .filter(([_, r]) => !r.passed)
      .map(([dim, _]) => DIMENSIONS[dim.toUpperCase()]?.label || dim);
    
    return {
      status: passed ? '通过' : '未通过',
      passedDimensions: passedDims,
      failedDimensions: failedDims,
      message: passed 
        ? `✅ 所有维度均达标，通过${passedDims.length}项评测`
        : `❌ ${failedDims.join('、')}维度未达标，需要改进`
    };
  }

  /**
   * 创建错误分数
   */
  _createErrorScores() {
    const scores = {};
    this.config.dimensions.forEach(dim => {
      scores[dim] = { score: 0, method: 'error', reason: '执行出错' };
    });
    return scores;
  }

  /**
   * 创建错误结果
   */
  _createErrorResult(skillName, error) {
    return {
      track: 'ai-effect',
      skillName,
      overallScore: 0,
      passed: false,
      error,
      evaluatedAt: new Date().toISOString()
    };
  }

  /**
   * 加载测试用例
   */
  _loadTestCases(skillPath) {
    const testCasePath = path.join(skillPath, 'evaluation-set.json');
    if (fs.existsSync(testCasePath)) {
      try {
        return JSON.parse(fs.readFileSync(testCasePath, 'utf8'));
      } catch (e) {
        return [];
      }
    }
    return [];
  }

  /**
   * 批量评测
   */
  async evaluateBatch(skills) {
    const results = [];
    for (const skill of skills) {
      const result = await this.evaluate(skill);
      results.push(result);
    }
    return results;
  }

  /**
   * 获取历史记录
   */
  getHistory() {
    return this.evaluationHistory;
  }

  /**
   * 导出报告
   */
  exportReport(format = 'json') {
    if (format === 'json') {
      return JSON.stringify(this.evaluationHistory, null, 2);
    }
    
    // Markdown格式
    let md = '# AI效果评测报告\n\n';
    this.evaluationHistory.forEach((r, i) => {
      md += `## ${i + 1}. ${r.skillName}\n`;
      md += `- 总分: ${r.overallScore}\n`;
      md += `- 状态: ${r.passed ? '✅ 通过' : '❌ 未通过'}\n`;
      md += `- 评测时间: ${r.evaluatedAt}\n\n`;
    });
    return md;
  }
}

module.exports = { AIEffectEvaluator, DIMENSIONS };

// CLI支持
if (require.main === module) {
  const evaluator = new AIEffectEvaluator();
  
  // 模拟评测
  const mockSkill = {
    name: process.argv[2] || 'test-ai-skill',
    path: process.argv[3] || './',
    execute: async (input) => `处理结果: ${input}`
  };
  
  const mockTestCases = [
    { input: '你好，请介绍一下自己', expected: '友好的自我介绍' },
    { input: '帮我写一首诗', expected: '优美的诗歌' },
    { input: '解释量子力学', expected: '清晰的解释' }
  ];
  
  evaluator.evaluate(mockSkill, mockTestCases).then(result => {
    console.log(JSON.stringify(result, null, 2));
  });
}
