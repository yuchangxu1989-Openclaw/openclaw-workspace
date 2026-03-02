/**
 * function-quality-evaluator.cjs - 功能质量评测器
 * 评测工具/工作流技能的准确性、性能和可靠性
 */

const fs = require('fs');
const path = require('path');

/**
 * 评测维度定义
 */
const DIMENSIONS = {
  ACCURACY: {
    name: 'accuracy',
    label: '准确性',
    description: '输出结果与预期的一致程度',
    weight: 0.3,
    threshold: 0.95
  },
  RESPONSE_TIME: {
    name: 'responseTime',
    label: '响应时间',
    description: '执行速度是否满足要求',
    weight: 0.2,
    threshold: 0.9
  },
  ERROR_RATE: {
    name: 'errorRate',
    label: '错误率',
    description: '执行过程中的错误发生频率',
    weight: 0.25,
    threshold: 0.95
  },
  COMPATIBILITY: {
    name: 'compatibility',
    label: '兼容性',
    description: '在不同环境下的适配能力',
    weight: 0.15,
    threshold: 0.85
  },
  STABILITY: {
    name: 'stability',
    label: '稳定性',
    description: '长时间运行的可靠性',
    weight: 0.1,
    threshold: 0.9
  }
};

/**
 * 响应时间阈值（毫秒）
 */
const RESPONSE_TIME_THRESHOLDS = {
  excellent: 100,   // <100ms 优秀
  good: 500,        // <500ms 良好
  acceptable: 2000, // <2s 可接受
  poor: 5000        // <5s 较差
};

/**
 * 功能质量评测器类
 */
class FunctionQualityEvaluator {
  constructor(config = {}) {
    this.config = {
      dimensions: Object.keys(DIMENSIONS),
      iterations: 5,              // 每个测试用例执行次数
      warmupIterations: 1,        // 预热次数
      timeout: 30000,             // 单次执行超时（毫秒）
      memoryCheck: true,          // 检查内存使用
      errorThreshold: 0.05,       // 错误率阈值（5%）
      ...config
    };
    this.evaluationHistory = [];
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
    
    // 预热
    await this._warmup(skill, cases[0]);
    
    // 执行评测
    const caseResults = [];
    const allExecutions = [];
    
    for (const testCase of cases) {
      const caseResult = await this._evaluateTestCase(skill, testCase);
      caseResults.push(caseResult);
      allExecutions.push(...caseResult.executions);
    }
    
    // 计算各维度得分
    const dimensionResults = this._calculateDimensionScores(caseResults, allExecutions);
    
    // 计算总分
    const overallScore = this._calculateOverallScore(dimensionResults);
    
    // 判断是否通过
    const passed = this._checkPassThreshold(dimensionResults);
    
    // 生成性能报告
    const performanceReport = this._generatePerformanceReport(allExecutions);
    
    // 生成改进建议
    const suggestions = this._generateSuggestions(dimensionResults, caseResults);
    
    const result = {
      track: 'functional-quality',
      skillName: skill.name,
      overallScore,
      passed,
      dimensionScores: dimensionResults,
      caseResults: caseResults.map(c => ({
        input: c.input,
        successRate: c.successRate,
        avgResponseTime: c.avgResponseTime,
        passed: c.passed
      })),
      performanceReport,
      suggestions,
      summary: this._generateSummary(dimensionResults, passed, performanceReport),
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
    const executions = [];
    let successCount = 0;
    
    for (let i = 0; i < this.config.iterations; i++) {
      const execution = await this._executeWithMetrics(skill, testCase);
      executions.push(execution);
      if (execution.success) successCount++;
    }
    
    const successRate = successCount / this.config.iterations;
    const responseTimes = executions.map(e => e.responseTime).filter(Boolean);
    const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    const minResponseTime = Math.min(...responseTimes);
    const maxResponseTime = Math.max(...responseTimes);
    
    // 计算准确性（与期望结果对比）
    const accuracy = this._calculateAccuracy(executions, testCase.expected);
    
    return {
      input: testCase.input,
      expected: testCase.expected,
      executions: executions.map(e => ({
        success: e.success,
        responseTime: e.responseTime,
        output: e.output?.substring(0, 200),
        error: e.error
      })),
      successRate,
      accuracy,
      avgResponseTime,
      minResponseTime,
      maxResponseTime,
      passed: successRate >= (1 - this.config.errorThreshold)
    };
  }

  /**
   * 带指标收集的执行
   */
  async _executeWithMetrics(skill, testCase) {
    const startTime = process.hrtime.bigint();
    const startMemory = this.config.memoryCheck ? process.memoryUsage() : null;
    
    try {
      // 设置超时
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('执行超时')), this.config.timeout);
      });
      
      const result = await Promise.race([
        this._executeSkill(skill, testCase.input),
        timeoutPromise
      ]);
      
      const endTime = process.hrtime.bigint();
      const endMemory = this.config.memoryCheck ? process.memoryUsage() : null;
      
      return {
        success: true,
        output: typeof result === 'string' ? result : JSON.stringify(result),
        responseTime: Number(endTime - startTime) / 1000000, // 转换为毫秒
        memoryDelta: startMemory && endMemory ? {
          heapUsed: endMemory.heapUsed - startMemory.heapUsed,
          external: endMemory.external - startMemory.external
        } : null,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      const endTime = process.hrtime.bigint();
      return {
        success: false,
        error: error.message,
        responseTime: Number(endTime - startTime) / 1000000,
        timestamp: new Date().toISOString()
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
    
    // 模拟执行
    await this._simulateDelay(10, 50);
    return `[执行结果] 输入: ${input}`;
  }

  /**
   * 模拟延迟
   */
  _simulateDelay(min, max) {
    const delay = Math.random() * (max - min) + min;
    return new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * 预热
   */
  async _warmup(skill, testCase) {
    for (let i = 0; i < this.config.warmupIterations; i++) {
      try {
        await this._executeSkill(skill, testCase.input);
      } catch (e) {}
    }
  }

  /**
   * 计算准确性
   */
  _calculateAccuracy(executions, expected) {
    if (!expected) return { score: 1, method: 'no-expectation' };
    
    const successfulExecutions = executions.filter(e => e.success);
    if (successfulExecutions.length === 0) return { score: 0, method: 'all-failed' };
    
    let matchCount = 0;
    
    for (const exec of successfulExecutions) {
      if (this._compareOutput(exec.output, expected)) {
        matchCount++;
      }
    }
    
    return {
      score: matchCount / successfulExecutions.length,
      method: 'exact-match',
      matched: matchCount,
      total: successfulExecutions.length
    };
  }

  /**
   * 对比输出
   */
  _compareOutput(actual, expected) {
    if (!actual || !expected) return false;
    
    const actualStr = actual.toString().toLowerCase().trim();
    const expectedStr = expected.toString().toLowerCase().trim();
    
    // 完全匹配
    if (actualStr === expectedStr) return true;
    
    // 包含匹配
    if (actualStr.includes(expectedStr) || expectedStr.includes(actualStr)) return true;
    
    // 相似度计算（简单版本）
    const similarity = this._calculateSimilarity(actualStr, expectedStr);
    return similarity >= 0.8;
  }

  /**
   * 计算字符串相似度
   */
  _calculateSimilarity(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const distance = this._levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  /**
   * Levenshtein距离
   */
  _levenshteinDistance(str1, str2) {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  /**
   * 计算各维度得分
   */
  _calculateDimensionScores(caseResults, allExecutions) {
    const results = {};
    
    // 准确性
    const accuracies = caseResults.map(c => c.accuracy?.score || 0);
    const avgAccuracy = accuracies.reduce((a, b) => a + b, 0) / accuracies.length;
    results.accuracy = {
      score: Math.round(avgAccuracy * 100) / 100,
      threshold: DIMENSIONS.ACCURACY.threshold,
      passed: avgAccuracy >= DIMENSIONS.ACCURACY.threshold
    };
    
    // 响应时间
    const responseTimes = allExecutions
      .filter(e => e.success)
      .map(e => e.responseTime);
    const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    results.responseTime = {
      score: this._calculateResponseTimeScore(avgResponseTime),
      avgMs: Math.round(avgResponseTime * 100) / 100,
      threshold: DIMENSIONS.RESPONSE_TIME.threshold,
      passed: this._calculateResponseTimeScore(avgResponseTime) >= DIMENSIONS.RESPONSE_TIME.threshold
    };
    
    // 错误率
    const totalExecutions = allExecutions.length;
    const failedExecutions = allExecutions.filter(e => !e.success).length;
    const errorRate = failedExecutions / totalExecutions;
    results.errorRate = {
      score: 1 - errorRate,
      errorRate: Math.round(errorRate * 10000) / 10000,
      failedCount: failedExecutions,
      totalCount: totalExecutions,
      threshold: DIMENSIONS.ERROR_RATE.threshold,
      passed: errorRate <= (1 - DIMENSIONS.ERROR_RATE.threshold)
    };
    
    // 兼容性（基于不同用例的成功率差异）
    const successRates = caseResults.map(c => c.successRate);
    const minSuccessRate = Math.min(...successRates);
    results.compatibility = {
      score: minSuccessRate,
      minSuccessRate: Math.round(minSuccessRate * 100) / 100,
      threshold: DIMENSIONS.COMPATIBILITY.threshold,
      passed: minSuccessRate >= DIMENSIONS.COMPATIBILITY.threshold
    };
    
    // 稳定性（基于响应时间方差）
    const variance = this._calculateVariance(responseTimes);
    const stabilityScore = Math.max(0, 1 - (variance / 1000)); // 方差越大稳定性越低
    results.stability = {
      score: Math.round(stabilityScore * 100) / 100,
      variance: Math.round(variance * 100) / 100,
      threshold: DIMENSIONS.STABILITY.threshold,
      passed: stabilityScore >= DIMENSIONS.STABILITY.threshold
    };
    
    return results;
  }

  /**
   * 计算响应时间得分
   */
  _calculateResponseTimeScore(avgMs) {
    if (avgMs <= RESPONSE_TIME_THRESHOLDS.excellent) return 1.0;
    if (avgMs <= RESPONSE_TIME_THRESHOLDS.good) return 0.95;
    if (avgMs <= RESPONSE_TIME_THRESHOLDS.acceptable) return 0.8;
    if (avgMs <= RESPONSE_TIME_THRESHOLDS.poor) return 0.6;
    return 0.3;
  }

  /**
   * 计算方差
   */
  _calculateVariance(values) {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
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
        totalWeight += dimConfig.weight;
        weightedSum += result.score * dimConfig.weight;
      }
    }
    
    return Math.round((weightedSum / totalWeight) * 100) / 100;
  }

  /**
   * 检查通过阈值
   */
  _checkPassThreshold(dimensionResults) {
    for (const [dim, result] of Object.entries(dimensionResults)) {
      const threshold = DIMENSIONS[dim.toUpperCase()]?.threshold || 0.85;
      if (result.score < threshold) {
        return false;
      }
    }
    return true;
  }

  /**
   * 生成性能报告
   */
  _generatePerformanceReport(allExecutions) {
    const successful = allExecutions.filter(e => e.success);
    const responseTimes = successful.map(e => e.responseTime);
    
    return {
      totalExecutions: allExecutions.length,
      successfulExecutions: successful.length,
      failedExecutions: allExecutions.length - successful.length,
      responseTimeStats: {
        min: Math.min(...responseTimes),
        max: Math.max(...responseTimes),
        avg: Math.round((responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length) * 100) / 100,
        p50: this._percentile(responseTimes, 0.5),
        p95: this._percentile(responseTimes, 0.95),
        p99: this._percentile(responseTimes, 0.99)
      },
      memoryStats: this._calculateMemoryStats(allExecutions)
    };
  }

  /**
   * 计算百分位数
   */
  _percentile(sortedValues, p) {
    const values = [...sortedValues].sort((a, b) => a - b);
    const index = Math.ceil(values.length * p) - 1;
    return values[Math.max(0, index)];
  }

  /**
   * 计算内存统计
   */
  _calculateMemoryStats(executions) {
    const memoryDeltas = executions
      .map(e => e.memoryDelta)
      .filter(Boolean);
    
    if (memoryDeltas.length === 0) return null;
    
    const heapUsed = memoryDeltas.map(m => m.heapUsed);
    return {
      avgHeapUsed: Math.round(heapUsed.reduce((a, b) => a + b, 0) / heapUsed.length / 1024), // KB
      maxHeapUsed: Math.round(Math.max(...heapUsed) / 1024)
    };
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
          targetScore: dimConfig?.threshold || 0.85,
          suggestion: this._getImprovementSuggestion(dim, result)
        });
      }
    }
    
    // 响应时间优化建议
    if (dimensionResults.responseTime?.avgMs > RESPONSE_TIME_THRESHOLDS.acceptable) {
      suggestions.push({
        dimension: 'responseTime',
        priority: 'medium',
        issue: `平均响应时间 ${dimensionResults.responseTime.avgMs}ms 较长`,
        suggestion: '优化算法复杂度，考虑添加缓存机制或异步处理'
      });
    }
    
    // 失败案例分析
    const failedCases = caseResults.filter(c => c.successRate < 1);
    if (failedCases.length > 0) {
      suggestions.push({
        dimension: 'errorRate',
        priority: 'high',
        issue: `${failedCases.length} 个测试用例存在失败`,
        suggestion: '检查失败用例的错误日志，处理边界情况和异常'
      });
    }
    
    return suggestions;
  }

  /**
   * 获取改进建议
   */
  _getImprovementSuggestion(dimension, result) {
    const suggestions = {
      accuracy: '检查输出格式和内容的正确性，确保与预期结果一致',
      responseTime: '优化代码性能，减少阻塞操作，使用缓存或异步处理',
      errorRate: '增加错误处理机制，完善边界条件检查',
      compatibility: '测试更多边界情况和输入类型，增强鲁棒性',
      stability: '优化资源使用，减少内存泄漏，处理并发情况'
    };
    return suggestions[dimension] || '需要进一步分析和优化';
  }

  /**
   * 生成摘要
   */
  _generateSummary(dimensionResults, passed, performanceReport) {
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
      performance: {
        avgResponseTime: `${performanceReport.responseTimeStats.avg}ms`,
        successRate: `${Math.round((performanceReport.successfulExecutions / performanceReport.totalExecutions) * 100)}%`
      },
      message: passed
        ? `✅ 功能质量达标，平均响应 ${performanceReport.responseTimeStats.avg}ms`
        : `❌ ${failedDims.join('、')}维度未达标，需要优化`
    };
  }

  /**
   * 创建错误结果
   */
  _createErrorResult(skillName, error) {
    return {
      track: 'functional-quality',
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
    
    let md = '# 功能质量评测报告\n\n';
    this.evaluationHistory.forEach((r, i) => {
      md += `## ${i + 1}. ${r.skillName}\n`;
      md += `- 总分: ${r.overallScore}\n`;
      md += `- 状态: ${r.passed ? '✅ 通过' : '❌ 未通过'}\n`;
      md += `- 平均响应: ${r.performanceReport?.responseTimeStats?.avg}ms\n`;
      md += `- 成功率: ${r.summary?.performance?.successRate}\n\n`;
    });
    return md;
  }
}

module.exports = { FunctionQualityEvaluator, DIMENSIONS };

// CLI支持
if (require.main === module) {
  const evaluator = new FunctionQualityEvaluator();
  
  const mockSkill = {
    name: process.argv[2] || 'test-function-skill',
    path: process.argv[3] || './',
    execute: async (input) => {
      await new Promise(r => setTimeout(r, Math.random() * 50));
      return `执行成功: ${input}`;
    }
  };
  
  const mockTestCases = [
    { input: 'test1', expected: 'success' },
    { input: 'test2', expected: 'success' },
    { input: 'test3', expected: 'success' }
  ];
  
  evaluator.evaluate(mockSkill, mockTestCases).then(result => {
    console.log(JSON.stringify(result, null, 2));
  });
}
