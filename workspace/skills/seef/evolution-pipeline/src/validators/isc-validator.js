/**
 * ISC校验器 (ISC Validator)
 * 
 * 功能：集成ISC规则，对技能进行质量评估和标准检查
 * 调用：isc-document-quality技能
 */

import fs from 'fs';
import path from 'path';

class ISCValidator {
  constructor(config = {}) {
    this.config = config;
    this.minScore = config.minScore || 70;
    this.iscQualityPath = config.iscQualityPath || 
      path.join(require('../../../../_shared/paths').SKILLS_DIR, 'isc-document-quality/index.js');
  }

  /**
   * 验证技能是否符合ISC标准
   * @param {string} skillPath - 技能路径
   * @returns {Object} 验证结果
   */
  async validate(skillPath) {
    console.log(`[ISCValidator] 开始验证: ${skillPath}`);
    
    try {
      // 检查isc-document-quality是否存在
      if (!fs.existsSync(this.iscQualityPath)) {
        console.warn('[ISCValidator] isc-document-quality未找到，使用基础验证');
        return this.basicValidation(skillPath);
      }
      
      // 调用isc-document-quality进行评估
      const iscModule = require(this.iscQualityPath);
      const report = iscModule.generateAssessmentReport(skillPath);
      
      // 解析验证结果
      const result = this.parseISCReport(report);
      
      console.log(`[ISCValidator] 验证完成: 得分 ${result.score}/${result.maxScore}`);
      
      return result;
      
    } catch (e) {
      console.error(`[ISCValidator] 验证失败: ${e.message}`);
      return {
        passed: false,
        score: 0,
        maxScore: 100,
        error: e.message,
        details: {},
        rawReport: null
      };
    }
  }

  /**
   * 解析ISC评估报告
   * @param {Object} report - ISC评估报告
   * @returns {Object} 验证结果
   */
  parseISCReport(report) {
    const score = report.totalScore || 0;
    const maxScore = report.maxScore || 100;
    const passed = score >= this.minScore;
    
    // 提取各维度详情
    const dimensions = report.dimensions || {};
    
    return {
      passed,
      score,
      maxScore,
      grade: report.grade || { label: '未知', level: '?' },
      details: {
        basicCompleteness: {
          score: dimensions.basicCompleteness?.score || 0,
          maxScore: dimensions.basicCompleteness?.maxScore || 40,
          subDimensions: dimensions.basicCompleteness?.subDimensions || {}
        },
        standardCompliance: {
          score: dimensions.standardCompliance?.score || 0,
          maxScore: dimensions.standardCompliance?.maxScore || 30,
          details: dimensions.standardCompliance?.details?.details || []
        },
        contentAccuracy: {
          score: dimensions.contentAccuracy?.score || 0,
          maxScore: dimensions.contentAccuracy?.maxScore || 20,
          details: dimensions.contentAccuracy?.details?.details || []
        },
        extensionCompleteness: {
          score: dimensions.extensionCompleteness?.score || 0,
          maxScore: dimensions.extensionCompleteness?.maxScore || 10,
          details: dimensions.extensionCompleteness?.details?.details || []
        }
      },
      recommendations: this.generateRecommendations(dimensions, score),
      rawReport: report
    };
  }

  /**
   * 基础验证（当isc-document-quality不可用时降级使用）
   * @param {string} skillPath - 技能路径
   * @returns {Object} 验证结果
   */
  basicValidation(skillPath) {
    console.log(`[ISCValidator] 执行基础验证: ${skillPath}`);
    
    let score = 0;
    const maxScore = 100;
    const details = {
      basicCompleteness: { score: 0, maxScore: 40, checks: [] },
      standardCompliance: { score: 0, maxScore: 30, checks: [] },
      contentAccuracy: { score: 0, maxScore: 20, checks: [] },
      extensionCompleteness: { score: 0, maxScore: 10, checks: [] }
    };
    
    // 检查SKILL.md
    const skillMdPath = path.join(skillPath, 'SKILL.md');
    if (fs.existsSync(skillMdPath)) {
      const content = fs.readFileSync(skillMdPath, 'utf-8');
      
      // 检查必需字段
      const requiredFields = ['name', 'description', 'version', 'status'];
      let fieldScore = 0;
      for (const field of requiredFields) {
        if (content.includes(`${field}:`)) {
          fieldScore += 5;
          details.basicCompleteness.checks.push(`[V] ${field} 存在 (+5分)`);
        } else {
          details.basicCompleteness.checks.push(`[X] ${field} 缺失 (-5分)`);
        }
      }
      details.basicCompleteness.score = fieldScore;
      score += fieldScore;
      
      // 检查标准合规
      const dirName = path.basename(skillPath);
      const isKebabCase = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(dirName);
      if (isKebabCase) {
        details.standardCompliance.score += 10;
        details.standardCompliance.checks.push(`[V] 目录命名符合kebab-case (+10分)`);
      } else {
        details.standardCompliance.checks.push(`[X] 目录命名不符合规范 (-10分)`);
      }
      score += details.standardCompliance.score;
      
      // 检查内容准确性
      const indexPath = path.join(skillPath, 'index.js');
      if (fs.existsSync(indexPath)) {
        details.contentAccuracy.score += 10;
        details.contentAccuracy.checks.push(`[V] index.js 存在 (+10分)`);
      } else {
        details.contentAccuracy.checks.push(`[X] index.js 缺失 (-10分)`);
      }
      score += details.contentAccuracy.score;
      
      // 检查扩展完整性
      details.extensionCompleteness.score += 5;
      details.extensionCompleteness.checks.push(`[V] SKILL.md 存在 (+5分)`);
      score += details.extensionCompleteness.score;
      
    } else {
      details.basicCompleteness.checks.push('[X] SKILL.md 不存在 (-20分)');
      details.standardCompliance.checks.push('[X] SKILL.md 不存在，无法检查命名规范');
      details.contentAccuracy.checks.push('[X] SKILL.md 不存在，无法检查代码');
      details.extensionCompleteness.checks.push('[X] SKILL.md 不存在 (-5分)');
    }
    
    // 检查README.md
    const readmePath = path.join(skillPath, 'README.md');
    if (fs.existsSync(readmePath)) {
      details.basicCompleteness.score += 10;
      details.basicCompleteness.checks.push('[V] README.md 存在 (+10分)');
      score += 10;
    } else {
      details.basicCompleteness.checks.push('[X] README.md 不存在 (-10分)');
    }
    
    const passed = score >= this.minScore;
    
    return {
      passed,
      score,
      maxScore,
      grade: this.getGradeLabel(score),
      details,
      recommendations: this.generateRecommendations(details, score),
      rawReport: null
    };
  }

  /**
   * 获取评级标签
   * @param {number} score - 分数
   * @returns {Object} 评级信息
   */
  getGradeLabel(score) {
    if (score >= 90) return { label: '优秀', level: 'A' };
    if (score >= 80) return { label: '良好', level: 'B' };
    if (score >= 70) return { label: '合格', level: 'C' };
    return { label: '需改进', level: 'D' };
  }

  /**
   * 生成改进建议
   * @param {Object} dimensions - 各维度详情
   * @param {number} totalScore - 总分
   * @returns {Array} 建议列表
   */
  generateRecommendations(dimensions, totalScore) {
    const recommendations = [];
    
    if (totalScore >= 90) {
      recommendations.push('文档质量优秀，符合ISC标准规范');
      return recommendations;
    }
    
    // 基础完整性建议
    const basicScore = dimensions.basicCompleteness?.score || 0;
    if (basicScore < 30) {
      recommendations.push('基础完整性不足，建议完善SKILL.md必需字段和README.md');
    }
    
    // 规范符合度建议
    const standardScore = dimensions.standardCompliance?.score || 0;
    if (standardScore < 20) {
      recommendations.push('规范符合度不足，建议检查命名规范和格式规范');
    }
    
    // 内容准确性建议
    const contentScore = dimensions.contentAccuracy?.score || 0;
    if (contentScore < 15) {
      recommendations.push('内容准确性不足，建议确保示例代码可运行');
    }
    
    // 扩展完整性建议
    const extensionScore = dimensions.extensionCompleteness?.score || 0;
    if (extensionScore < 5) {
      recommendations.push('扩展完整性不足，建议添加代码注释和元数据');
    }
    
    if (recommendations.length === 0) {
      recommendations.push('整体质量良好，可进一步优化细节');
    }
    
    return recommendations;
  }

  /**
   * 批量验证多个技能
   * @param {Array} skillPaths - 技能路径列表
   * @returns {Array} 验证结果列表
   */
  async validateBatch(skillPaths) {
    const results = [];
    
    for (const skillPath of skillPaths) {
      const result = await this.validate(skillPath);
      results.push({
        skillPath,
        ...result
      });
    }
    
    return results;
  }

  /**
   * 获取验证统计
   * @param {Array} results - 验证结果列表
   * @returns {Object} 统计信息
   */
  getValidationStats(results) {
    const total = results.length;
    const passed = results.filter(r => r.passed).length;
    const failed = total - passed;
    const avgScore = results.reduce((sum, r) => sum + r.score, 0) / total;
    
    return {
      total,
      passed,
      failed,
      passRate: total > 0 ? (passed / total * 100).toFixed(2) : 0,
      avgScore: avgScore.toFixed(2),
      minScore: Math.min(...results.map(r => r.score)),
      maxScore: Math.max(...results.map(r => r.score))
    };
  }
}

export { ISCValidator };
export default ISCValidator;
