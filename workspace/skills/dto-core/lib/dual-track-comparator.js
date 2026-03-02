/**
 * DTO v2.0 - 双轨对比器 (P1)
 * 自动对比原 cron 与 DTO 输出一致性
 */

class DualTrackComparator {
  constructor(options = {}) {
    this.tolerance = options.tolerance || 0.95; // 95% 相似度阈值
    this.history = [];
    this.comparisonWindow = options.window || 7; // 7天对比窗口
  }

  /**
   * 对比 cron 与 DTO 输出
   * @param {Object} cronOutput - 原 cron 输出
   * @param {Object} ctoOutput - DTO 输出
   * @param {string} taskId - 任务ID
   */
  async compare(cronOutput, ctoOutput, taskId) {
    console.log(`[DualTrack] 对比任务: ${taskId}`);
    
    const comparison = {
      taskId,
      timestamp: new Date().toISOString(),
      cron: this.normalizeOutput(cronOutput),
      dto: this.normalizeOutput(ctoOutput),
      metrics: {}
    };
    
    // 1. 结构对比
    comparison.metrics.structural = this.compareStructure(
      comparison.cron, 
      comparison.dto
    );
    
    // 2. 内容对比
    comparison.metrics.content = this.compareContent(
      comparison.cron, 
      comparison.dto
    );
    
    // 3. 语义对比（关键字段）
    comparison.metrics.semantic = this.compareSemantic(
      comparison.cron, 
      comparison.dto
    );
    
    // 4. 综合评估
    comparison.overall = this.calculateOverall(comparison.metrics);
    
    // 5. 生成建议
    comparison.recommendation = this.generateRecommendation(comparison);
    
    // 记录历史
    this.history.push(comparison);
    
    console.log(`[DualTrack] 对比结果: ${comparison.overall.match ? '✓ 匹配' : '✗ 不匹配'} (${comparison.overall.confidence.toFixed(2)})`);
    
    return comparison;
  }

  /**
   * 标准化输出
   */
  normalizeOutput(output) {
    if (typeof output === 'string') {
      try {
        return JSON.parse(output);
      } catch {
        return { raw: output };
      }
    }
    return output;
  }

  /**
   * 结构对比
   */
  compareStructure(cron, dto) {
    const cronKeys = this.getAllKeys(cron).sort();
    const ctoKeys = this.getAllKeys(dto).sort();
    
    const common = cronKeys.filter(k => ctoKeys.includes(k));
    const onlyInCron = cronKeys.filter(k => !ctoKeys.includes(k));
    const onlyInCto = ctoKeys.filter(k => !cronKeys.includes(k));
    
    const similarity = common.length / Math.max(cronKeys.length, ctoKeys.length);
    
    return {
      similarity,
      common: common.length,
      onlyInCron: onlyInCron.length,
      onlyInCto: onlyInCto.length,
      details: { onlyInCron, onlyInCto }
    };
  }

  /**
   * 获取所有键
   */
  getAllKeys(obj, prefix = '') {
    const keys = [];
    
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      keys.push(fullKey);
      
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        keys.push(...this.getAllKeys(value, fullKey));
      }
    }
    
    return keys;
  }

  /**
   * 内容对比
   */
  compareContent(cron, dto) {
    const cronStr = JSON.stringify(cron);
    const ctoStr = JSON.stringify(dto);
    
    // 编辑距离相似度
    const distance = this.levenshteinDistance(cronStr, ctoStr);
    const maxLen = Math.max(cronStr.length, ctoStr.length);
    const similarity = 1 - (distance / maxLen);
    
    return {
      similarity,
      distance,
      cronLength: cronStr.length,
      ctoLength: ctoStr.length
    };
  }

  /**
   * 编辑距离
   */
  levenshteinDistance(a, b) {
    const matrix = [];
    
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
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
    
    return matrix[b.length][a.length];
  }

  /**
   * 语义对比（关键字段）
   */
  compareSemantic(cron, dto) {
    const criticalFields = [
      'status',
      'result',
      'error',
      'skills_processed',
      'standards_checked'
    ];
    
    const matches = [];
    const mismatches = [];
    
    for (const field of criticalFields) {
      const cronVal = this.getNestedValue(cron, field);
      const ctoVal = this.getNestedValue(dto, field);
      
      if (cronVal === ctoVal) {
        matches.push(field);
      } else if (cronVal !== undefined || ctoVal !== undefined) {
        mismatches.push({
          field,
          cron: cronVal,
          dto: ctoVal
        });
      }
    }
    
    const similarity = matches.length / (matches.length + mismatches.length);
    
    return {
      similarity,
      matches: matches.length,
      mismatches: mismatches.length,
      details: mismatches
    };
  }

  /**
   * 获取嵌套值
   */
  getNestedValue(obj, path) {
    const keys = path.split('.');
    let current = obj;
    
    for (const key of keys) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[key];
    }
    
    return current;
  }

  /**
   * 计算综合结果
   */
  calculateOverall(metrics) {
    const weights = {
      structural: 0.3,
      content: 0.4,
      semantic: 0.3
    };
    
    const confidence = 
      metrics.structural.similarity * weights.structural +
      metrics.content.similarity * weights.content +
      metrics.semantic.similarity * weights.semantic;
    
    return {
      match: confidence >= this.tolerance,
      confidence,
      tolerance: this.tolerance,
      breakdown: {
        structural: metrics.structural.similarity,
        content: metrics.content.similarity,
        semantic: metrics.semantic.similarity
      }
    };
  }

  /**
   * 生成建议
   */
  generateRecommendation(comparison) {
    const { overall, metrics } = comparison;
    
    if (overall.match && overall.confidence > 0.99) {
      return {
        action: 'switch',
        reason: '高度一致，建议切换',
        confidence: overall.confidence
      };
    }
    
    if (overall.match) {
      return {
        action: 'keep_shadow',
        reason: '基本一致，继续观察',
        confidence: overall.confidence,
        note: '建议延长观察期'
      };
    }
    
    if (metrics.semantic.similarity < 0.8) {
      return {
        action: 'investigate',
        reason: '关键字段不匹配，需要调查',
        issues: metrics.semantic.details,
        confidence: overall.confidence
      };
    }
    
    return {
      action: 'investigate',
      reason: '输出不一致',
      confidence: overall.confidence
    };
  }

  /**
   * 获取切换建议（基于历史）
   */
  getSwitchRecommendation(taskId) {
    const taskHistory = this.history.filter(h => h.taskId === taskId);
    
    if (taskHistory.length === 0) {
      return { ready: false, reason: '无历史数据' };
    }
    
    const recent = taskHistory.slice(-this.comparisonWindow);
    const allMatch = recent.every(h => h.overall.match);
    const avgConfidence = recent.reduce((sum, h) => sum + h.overall.confidence, 0) / recent.length;
    
    return {
      ready: allMatch && recent.length >= this.comparisonWindow,
      days: recent.length,
      avgConfidence,
      allMatch,
      recommendation: allMatch && avgConfidence > 0.95 ? 'switch' : 'keep_shadow'
    };
  }

  /**
   * 获取对比历史
   */
  getHistory(taskId, limit = 100) {
    let history = this.history;
    
    if (taskId) {
      history = history.filter(h => h.taskId === taskId);
    }
    
    return history.slice(-limit);
  }
}

module.exports = DualTrackComparator;
