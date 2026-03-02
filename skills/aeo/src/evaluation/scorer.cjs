/**
 * AEO 评分计算器 (Evaluation Scorer)
 * 计算各维度得分，生成评测报告
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');

/**
 * 评分维度定义
 */
const Dimensions = {
  // AI效果维度
  RELEVANCE: 'relevance',      // 相关性
  COHERENCE: 'coherence',      // 连贯性
  HELPFULNESS: 'helpfulness',  // 有用性
  CREATIVITY: 'creativity',    // 创造性
  SAFETY: 'safety',            // 安全性
  
  // 功能质量维度
  ACCURACY: 'accuracy',        // 准确性
  RESPONSE_TIME: 'responseTime', // 响应时间
  ERROR_RATE: 'errorRate',     // 错误率
  COMPATIBILITY: 'compatibility', // 兼容性
  STABILITY: 'stability'       // 稳定性
};

/**
 * 评分权重配置
 */
const DefaultWeights = {
  aiEffect: {
    relevance: 0.25,
    coherence: 0.20,
    helpfulness: 0.30,
    creativity: 0.15,
    safety: 0.10
  },
  functionalQuality: {
    accuracy: 0.35,
    responseTime: 0.20,
    errorRate: 0.25,
    compatibility: 0.10,
    stability: 0.10
  }
};

/**
 * 评分等级
 */
const GradeLevels = {
  EXCELLENT: { min: 0.9, label: '优秀', grade: 'A' },
  GOOD: { min: 0.8, label: '良好', grade: 'B' },
  ACCEPTABLE: { min: 0.7, label: '合格', grade: 'C' },
  NEEDS_IMPROVEMENT: { min: 0.6, label: '需改进', grade: 'D' },
  POOR: { min: 0, label: '不合格', grade: 'F' }
};

/**
 * 评分计算器
 */
class EvaluationScorer {
  constructor(options = {}) {
    this.options = {
      weights: options.weights || DefaultWeights,
      thresholds: options.thresholds || {
        aiEffect: 0.75,
        functionalQuality: 0.85
      },
      ...options
    };
  }
  
  /**
   * 计算单维度得分
   * @param {Array} results - 测试结果列表
   * @param {string} dimension - 维度名称
   * @returns {Object} 维度得分详情
   */
  calculateDimensionScore(results, dimension) {
    if (!results || results.length === 0) {
      return { score: 0, passed: 0, total: 0, details: [] };
    }
    
    const relevant = results.filter(r => 
      r.evaluation?.dimension === dimension || 
      r.testCase?.dimensions?.includes(dimension)
    );
    
    if (relevant.length === 0) {
      // 如果没有特定维度的标记，使用所有结果
      const allScores = results.map(r => ({
        passed: r.status === 'passed',
        score: r.evaluation?.score || (r.status === 'passed' ? 1 : 0),
        duration: r.duration,
        testCaseId: r.testCaseId
      }));
      
      const passedCount = allScores.filter(s => s.passed).length;
      const avgScore = allScores.reduce((sum, s) => sum + s.score, 0) / allScores.length;
      
      return {
        score: avgScore,
        passed: passedCount,
        total: allScores.length,
        passRate: passedCount / allScores.length,
        details: allScores
      };
    }
    
    const scores = relevant.map(r => ({
      passed: r.status === 'passed',
      score: r.evaluation?.score || (r.status === 'passed' ? 1 : 0),
      duration: r.duration,
      testCaseId: r.testCaseId
    }));
    
    const passedCount = scores.filter(s => s.passed).length;
    const avgScore = scores.reduce((sum, s) => sum + s.score, 0) / scores.length;
    
    return {
      score: avgScore,
      passed: passedCount,
      total: scores.length,
      passRate: passedCount / scores.length,
      details: scores
    };
  }
  
  /**
   * 计算所有维度得分
   * @param {Array} results - 测试结果
   * @param {Array} dimensions - 维度列表
   * @returns {Object} 各维度得分
   */
  calculateAllDimensions(results, dimensions = Object.values(Dimensions)) {
    const scores = {};
    
    for (const dimension of dimensions) {
      scores[dimension] = this.calculateDimensionScore(results, dimension);
    }
    
    return scores;
  }
  
  /**
   * 计算轨道得分
   * @param {Object} dimensionScores - 各维度得分
   * @param {string} track - 轨道类型 (aiEffect | functionalQuality)
   * @returns {Object} 轨道得分
   */
  calculateTrackScore(dimensionScores, track) {
    const weights = this.options.weights[track];
    if (!weights) {
      throw new Error(`Unknown track: ${track}`);
    }
    
    let totalWeight = 0;
    let weightedScore = 0;
    const breakdown = {};
    
    for (const [dimension, weight] of Object.entries(weights)) {
      const dimScore = dimensionScores[dimension]?.score || 0;
      weightedScore += dimScore * weight;
      totalWeight += weight;
      breakdown[dimension] = {
        score: dimScore,
        weight,
        weighted: dimScore * weight
      };
    }
    
    const finalScore = totalWeight > 0 ? weightedScore / totalWeight : 0;
    const threshold = this.options.thresholds[track];
    
    return {
      track,
      score: finalScore,
      threshold,
      passed: finalScore >= threshold,
      breakdown,
      grade: this.getGrade(finalScore)
    };
  }
  
  /**
   * 计算综合得分
   * @param {Object} trackScores - 各轨道得分
   * @returns {Object} 综合得分
   */
  calculateOverallScore(trackScores) {
    const tracks = Object.values(trackScores);
    
    if (tracks.length === 0) {
      return { score: 0, passed: false };
    }
    
    const avgScore = tracks.reduce((sum, t) => sum + t.score, 0) / tracks.length;
    const allPassed = tracks.every(t => t.passed);
    
    return {
      score: avgScore,
      passed: allPassed,
      grade: this.getGrade(avgScore),
      tracks: tracks.length
    };
  }
  
  /**
   * 生成完整评分报告
   * @param {Object} evaluationData - 评测数据
   * @returns {Object} 评分报告
   */
  generateReport(evaluationData) {
    const {
      taskId,
      taskName,
      target,
      results,
      dimensions,
      tracks,
      metadata = {}
    } = evaluationData;
    
    const timestamp = new Date().toISOString();
    
    // 1. 计算各维度得分
    const dimensionScores = this.calculateAllDimensions(results, dimensions);
    
    // 2. 计算各轨道得分
    const trackScores = {};
    for (const track of tracks || ['aiEffect', 'functionalQuality']) {
      trackScores[track] = this.calculateTrackScore(dimensionScores, track);
    }
    
    // 3. 计算综合得分
    const overallScore = this.calculateOverallScore(trackScores);
    
    // 4. 统计信息
    const statistics = this._calculateStatistics(results);
    
    // 5. 问题汇总
    const issues = this._extractIssues(results);
    
    // 6. 建议
    const recommendations = this._generateRecommendations(dimensionScores, trackScores);
    
    return {
      reportId: `rpt_${Date.now()}`,
      taskId,
      taskName,
      target,
      timestamp,
      summary: {
        overallScore,
        trackScores,
        statistics
      },
      details: {
        dimensionScores,
        testResults: results.map(r => ({
          testCaseId: r.testCaseId,
          status: r.status,
          score: r.evaluation?.score,
          duration: r.duration,
          error: r.error
        }))
      },
      issues,
      recommendations,
      metadata
    };
  }
  
  /**
   * 生成文本报告
   * @param {Object} report - 评分报告
   * @returns {string} 文本格式报告
   */
  generateTextReport(report) {
    const lines = [];
    
    lines.push('╔══════════════════════════════════════════════════════════════╗');
    lines.push('║                  AEO 评测报告                                 ║');
    lines.push('╚══════════════════════════════════════════════════════════════╝');
    lines.push('');
    
    // 基本信息
    lines.push(`📋 任务: ${report.taskName}`);
    lines.push(`🎯 目标: ${report.target}`);
    lines.push(`⏰ 时间: ${new Date(report.timestamp).toLocaleString()}`);
    lines.push('');
    
    // 综合得分
    const overall = report.summary.overallScore;
    const gradeIcon = overall.passed ? '✅' : '❌';
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push(`📊 综合评分: ${(overall.score * 100).toFixed(1)}% ${gradeIcon}`);
    lines.push(`   等级: ${overall.grade.label} (${overall.grade.grade})`);
    lines.push('');
    
    // 轨道得分
    lines.push('🎯 轨道得分:');
    for (const [track, score] of Object.entries(report.summary.trackScores)) {
      const icon = score.passed ? '✅' : '❌';
      lines.push(`   ${icon} ${track}: ${(score.score * 100).toFixed(1)}% (阈值: ${(score.threshold * 100).toFixed(0)}%)`);
      
      // 维度细分
      for (const [dim, data] of Object.entries(score.breakdown)) {
        lines.push(`      • ${dim}: ${(data.score * 100).toFixed(1)}% (权重: ${(data.weight * 100).toFixed(0)}%)`);
      }
    }
    lines.push('');
    
    // 统计
    lines.push('📈 统计信息:');
    const stats = report.summary.statistics;
    lines.push(`   • 总测试数: ${stats.total}`);
    lines.push(`   • 通过: ${stats.passed} (${(stats.passRate * 100).toFixed(1)}%)`);
    lines.push(`   • 失败: ${stats.failed}`);
    lines.push(`   • 错误: ${stats.errors}`);
    lines.push(`   • 平均耗时: ${stats.avgDuration.toFixed(0)}ms`);
    lines.push('');
    
    // 问题
    if (report.issues.length > 0) {
      lines.push('⚠️  发现的问题:');
      report.issues.forEach((issue, i) => {
        lines.push(`   ${i + 1}. [${issue.severity}] ${issue.description}`);
      });
      lines.push('');
    }
    
    // 建议
    if (report.recommendations.length > 0) {
      lines.push('💡 改进建议:');
      report.recommendations.forEach((rec, i) => {
        lines.push(`   ${i + 1}. ${rec}`);
      });
      lines.push('');
    }
    
    // 结论
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    if (overall.passed) {
      lines.push('✅ 评测结论: 通过 - 达到质量标准');
    } else {
      lines.push('❌ 评测结论: 未通过 - 需要改进');
    }
    lines.push('');
    
    return lines.join('\n');
  }
  
  /**
   * 保存报告到文件
   * @param {Object} report - 报告对象
   * @param {string} outputPath - 输出路径
   */
  saveReport(report, outputPath) {
    const fullPath = outputPath || path.join(
      __dirname, 
      '../../reports', 
      `report_${report.taskId}_${Date.now()}.json`
    );
    
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, JSON.stringify(report, null, 2));
    
    // 同时保存文本报告
    const textPath = fullPath.replace('.json', '.txt');
    fs.writeFileSync(textPath, this.generateTextReport(report));
    
    return { jsonPath: fullPath, textPath };
  }
  
  /**
   * 获取评分等级
   * @param {number} score - 分数 (0-1)
   * @returns {Object} 等级信息
   */
  getGrade(score) {
    for (const [level, config] of Object.entries(GradeLevels)) {
      if (score >= config.min) {
        return { level, ...config };
      }
    }
    return GradeLevels.POOR;
  }
  
  // ==================== 私有方法 ====================
  
  _calculateStatistics(results) {
    if (!results || results.length === 0) {
      return { total: 0, passed: 0, failed: 0, errors: 0, passRate: 0, avgDuration: 0 };
    }
    
    const total = results.length;
    const passed = results.filter(r => r.status === 'passed').length;
    const failed = results.filter(r => r.status === 'failed').length;
    const errors = results.filter(r => r.status === 'error').length;
    const avgDuration = results.reduce((sum, r) => sum + (r.duration || 0), 0) / total;
    
    return {
      total,
      passed,
      failed,
      errors,
      passRate: passed / total,
      avgDuration
    };
  }
  
  _extractIssues(results) {
    const issues = [];
    
    for (const result of results) {
      if (result.status === 'failed' || result.status === 'error') {
        issues.push({
          testCaseId: result.testCaseId,
          severity: result.status === 'error' ? 'high' : 'medium',
          description: result.error || 'Test case failed',
          dimension: result.testCase?.dimension || 'unknown'
        });
      }
    }
    
    return issues;
  }
  
  _generateRecommendations(dimensionScores, trackScores) {
    const recommendations = [];
    
    for (const [dimension, score] of Object.entries(dimensionScores)) {
      if (score.score < 0.7) {
        recommendations.push(`${dimension}得分较低(${ (score.score * 100).toFixed(0)}%)，建议优化该维度的测试用例`);
      }
    }
    
    for (const [track, score] of Object.entries(trackScores)) {
      if (!score.passed) {
        recommendations.push(`${track}轨道未通过阈值(${ (score.threshold * 100).toFixed(0)}%)，需要整体改进`);
        
        // 找出低分维度
        const lowDims = Object.entries(score.breakdown)
          .filter(([_, d]) => d.score < 0.7)
          .map(([name, _]) => name);
        
        if (lowDims.length > 0) {
          recommendations.push(`重点关注以下维度: ${lowDims.join(', ')}`);
        }
      }
    }
    
    return recommendations;
  }
}

module.exports = { 
  EvaluationScorer, 
  Dimensions, 
  DefaultWeights, 
  GradeLevels 
};
