/**
 * @fileoverview ISC校验器 (ISC Validator) - EvoMap进化流水线核心
 * @description 集成ISC规则，对技能进行质量评估和标准检查
 * @module ISCValidator
 * @version 1.0.0
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 评分维度枚举
 * @readonly
 * @enum {string}
 */
export const Dimension = {
  BASIC_COMPLETENESS: 'basicCompleteness',
  STANDARD_COMPLIANCE: 'standardCompliance',
  CONTENT_ACCURACY: 'contentAccuracy',
  EXTENSION_COMPLETENESS: 'extensionCompleteness'
};

/**
 * 评分权重配置
 * @constant {Object<string, number>}
 */
export const DIMENSION_WEIGHTS = {
  [Dimension.BASIC_COMPLETENESS]: 0.4,      // 40分
  [Dimension.STANDARD_COMPLIANCE]: 0.3,     // 30分
  [Dimension.CONTENT_ACCURACY]: 0.2,        // 20分
  [Dimension.EXTENSION_COMPLETENESS]: 0.1   // 10分
};

/**
 * 必需字段列表
 * @constant {string[]}
 */
export const REQUIRED_FIELDS = [
  'name',
  'description', 
  'version',
  'status',
  'author'
];

/**
 * ISC校验器类
 * @class ISCValidator
 * @description 对技能进行四维度质量评分（总分100分）
 */
class ISCValidator {
  /**
   * @constructor
   * @param {Object} config - 配置选项
   * @param {number} [config.minScore=70] - 通过最低分数
   * @param {number} [config.maxScore=100] - 最高分
   * @param {string} [config.iscQualityPath] - isc-document-quality路径
   * @param {Object} [config.logger] - 日志记录器
   */
  constructor(config = {}) {
    this.config = {
      minScore: config.minScore || 70,
      maxScore: config.maxScore || 100,
      iscQualityPath: config.iscQualityPath || 
        '/root/.openclaw/workspace/skills/isc-document-quality/index.js',
      ...config
    };
    
    this.logger = config.logger || console;
    
    // 统计
    this.stats = {
      validationsRun: 0,
      validationsPassed: 0,
      validationsFailed: 0,
      totalScoreSum: 0
    };
  }

  /**
   * 验证技能是否符合ISC标准
   * @async
   * @param {string} skillPath - 技能路径
   * @returns {Promise<Object>} 验证结果
   */
  async validate(skillPath) {
    this.logger.info(`[ISCValidator] 开始验证: ${path.basename(skillPath)}`);
    
    this.stats.validationsRun++;
    
    try {
      // 检查isc-document-quality是否存在
      if (fs.existsSync(this.config.iscQualityPath)) {
        try {
          const iscModule = await import(this.config.iscQualityPath);
          const report = iscModule.generateAssessmentReport?.(skillPath) || 
                        iscModule.default?.generateAssessmentReport?.(skillPath);
          
          if (report) {
            const result = this.parseISCReport(report);
            this.updateStats(result);
            return result;
          }
        } catch (e) {
          this.logger.warn(`[ISCValidator] 调用isc-document-quality失败: ${e.message}`);
        }
      }
      
      // 降级使用基础验证
      this.logger.info(`[ISCValidator] 使用基础验证模式`);
      const result = this.basicValidation(skillPath);
      this.updateStats(result);
      return result;
      
    } catch (e) {
      this.logger.error(`[ISCValidator] 验证失败: ${e.message}`);
      this.stats.validationsFailed++;
      
      return {
        passed: false,
        score: 0,
        maxScore: this.config.maxScore,
        error: e.message,
        details: {},
        recommendations: ['验证过程发生错误，请检查技能文件完整性'],
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
    const maxScore = report.maxScore || this.config.maxScore;
    const passed = score >= this.config.minScore;
    
    const dimensions = report.dimensions || {};
    
    return {
      passed,
      score,
      maxScore,
      grade: report.grade || this.getGradeLabel(score),
      details: {
        basicCompleteness: {
          score: dimensions.basicCompleteness?.score || 0,
          maxScore: dimensions.basicCompleteness?.maxScore || 40,
          subDimensions: dimensions.basicCompleteness?.subDimensions || {},
          checks: dimensions.basicCompleteness?.checks || []
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
    this.logger.info(`[ISCValidator] 执行基础验证: ${path.basename(skillPath)}`);
    
    let score = 0;
    const maxScore = this.config.maxScore;
    const details = {
      basicCompleteness: { score: 0, maxScore: 40, checks: [] },
      standardCompliance: { score: 0, maxScore: 30, checks: [] },
      contentAccuracy: { score: 0, maxScore: 20, checks: [] },
      extensionCompleteness: { score: 0, maxScore: 10, checks: [] }
    };
    
    const skillId = path.basename(skillPath);
    
    // === 1. 基础完整性检查 (40分) ===
    const skillMdPath = path.join(skillPath, 'SKILL.md');
    let skillContent = '';
    
    if (fs.existsSync(skillMdPath)) {
      try {
        skillContent = fs.readFileSync(skillMdPath, 'utf-8');
        
        // 检查必需字段
        let fieldScore = 0;
        for (const field of REQUIRED_FIELDS) {
          if (skillContent.includes(`${field}:`)) {
            fieldScore += 8;
            details.basicCompleteness.checks.push(`[✓] ${field} 存在 (+8分)`);
          } else {
            details.basicCompleteness.checks.push(`[✗] ${field} 缺失`);
          }
        }
        
        // 内容长度检查
        if (skillContent.length > 500) {
          fieldScore += 5;
          details.basicCompleteness.checks.push(`[✓] 内容长度充足 (+5分)`);
        }
        
        details.basicCompleteness.score = Math.min(fieldScore, 40);
        
      } catch (e) {
        details.basicCompleteness.checks.push(`[✗] 读取SKILL.md失败`);
      }
    } else {
      details.basicCompleteness.checks.push('[✗] SKILL.md 不存在');
    }
    
    score += details.basicCompleteness.score;
    
    // 检查README.md
    const readmePath = path.join(skillPath, 'README.md');
    if (fs.existsSync(readmePath)) {
      details.basicCompleteness.score += 5;
      details.basicCompleteness.checks.push('[✓] README.md 存在 (+5分)');
      score += 5;
    } else {
      details.basicCompleteness.checks.push('[✗] README.md 不存在');
    }
    
    // === 2. 规范符合度检查 (30分) ===
    // 目录命名规范（kebab-case）
    const isKebabCase = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(skillId);
    if (isKebabCase) {
      details.standardCompliance.score += 10;
      details.standardCompliance.checks.push('[✓] 目录命名符合kebab-case (+10分)');
    } else {
      details.standardCompliance.checks.push('[✗] 目录命名不符合规范');
    }
    
    // 检查YAML frontmatter格式
    if (skillContent.includes('---')) {
      details.standardCompliance.score += 10;
      details.standardCompliance.checks.push('[✓] YAML frontmatter存在 (+10分)');
    }
    
    // 检查版本号格式
    const versionMatch = skillContent.match(/version:\s*["']?(\d+\.\d+\.\d+)["']?/);
    if (versionMatch) {
      details.standardCompliance.score += 10;
      details.standardCompliance.checks.push('[✓] 版本号格式正确 (+10分)');
    }
    
    score += details.standardCompliance.score;
    
    // === 3. 内容准确性检查 (20分) ===
    const indexPath = path.join(skillPath, 'index.js');
    if (fs.existsSync(indexPath)) {
      details.contentAccuracy.score += 10;
      details.contentAccuracy.checks.push('[✓] index.js 存在 (+10分)');
      
      // 检查index.js是否有内容
      try {
        const indexContent = fs.readFileSync(indexPath, 'utf-8');
        if (indexContent.length > 100) {
          details.contentAccuracy.score += 5;
          details.contentAccuracy.checks.push('[✓] index.js内容充实 (+5分)');
        }
        if (indexContent.includes('export')) {
          details.contentAccuracy.score += 5;
          details.contentAccuracy.checks.push('[✓] 使用ESM导出 (+5分)');
        }
      } catch (e) {
        // 忽略
      }
    } else {
      details.contentAccuracy.checks.push('[✗] index.js 缺失');
    }
    
    score += details.contentAccuracy.score;
    
    // === 4. 扩展完整性检查 (10分) ===
    if (skillContent.length > 0) {
      details.extensionCompleteness.score += 3;
      details.extensionCompleteness.checks.push('[✓] SKILL.md 存在 (+3分)');
    }
    
    // 检查是否有依赖声明
    const packagePath = path.join(skillPath, 'package.json');
    if (fs.existsSync(packagePath)) {
      details.extensionCompleteness.score += 4;
      details.extensionCompleteness.checks.push('[✓] package.json 存在 (+4分)');
    }
    
    // 检查是否有注释
    if (skillContent.includes('#') || skillContent.includes('//')) {
      details.extensionCompleteness.score += 3;
      details.extensionCompleteness.checks.push('[✓] 包含注释 (+3分)');
    }
    
    score += details.extensionCompleteness.score;
    
    // 计算最终结果
    const passed = score >= this.config.minScore;
    
    if (passed) {
      this.stats.validationsPassed++;
    } else {
      this.stats.validationsFailed++;
    }
    
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
    if (score >= 90) return { label: '优秀', level: 'A', color: 'green' };
    if (score >= 80) return { label: '良好', level: 'B', color: 'blue' };
    if (score >= 70) return { label: '合格', level: 'C', color: 'yellow' };
    if (score >= 60) return { label: '待改进', level: 'D', color: 'orange' };
    return { label: '不合格', level: 'F', color: 'red' };
  }

  /**
   * 生成改进建议
   * @param {Object} dimensions - 各维度详情
   * @param {number} totalScore - 总分
   * @returns {string[]} 建议列表
   */
  generateRecommendations(dimensions, totalScore) {
    const recommendations = [];
    
    if (totalScore >= 90) {
      recommendations.push('🎉 文档质量优秀，符合ISC标准规范');
      return recommendations;
    }
    
    // 基础完整性建议
    const basicScore = dimensions.basicCompleteness?.score || dimensions[Dimension.BASIC_COMPLETENESS]?.score || 0;
    if (basicScore < 30) {
      recommendations.push('📋 基础完整性不足：请完善SKILL.md必需字段（name, description, version, status, author）和README.md');
    }
    
    // 规范符合度建议
    const standardScore = dimensions.standardCompliance?.score || dimensions[Dimension.STANDARD_COMPLIANCE]?.score || 0;
    if (standardScore < 20) {
      recommendations.push('📐 规范符合度不足：请检查目录命名（kebab-case）和YAML frontmatter格式');
    }
    
    // 内容准确性建议
    const contentScore = dimensions.contentAccuracy?.score || dimensions[Dimension.CONTENT_ACCURACY]?.score || 0;
    if (contentScore < 15) {
      recommendations.push('✅ 内容准确性不足：请确保index.js存在且包含有效代码');
    }
    
    // 扩展完整性建议
    const extensionScore = dimensions.extensionCompleteness?.score || dimensions[Dimension.EXTENSION_COMPLETENESS]?.score || 0;
    if (extensionScore < 5) {
      recommendations.push('🔧 扩展完整性不足：建议添加代码注释和依赖声明（package.json）');
    }
    
    if (recommendations.length === 0) {
      recommendations.push('👍 整体质量良好，可进一步优化细节以提升评分');
    }
    
    return recommendations;
  }

  /**
   * 批量验证多个技能
   * @async
   * @param {string[]} skillPaths - 技能路径列表
   * @returns {Promise<Array>} 验证结果列表
   */
  async validateBatch(skillPaths) {
    const results = [];
    
    for (const skillPath of skillPaths) {
      const result = await this.validate(skillPath);
      results.push({
        skillId: path.basename(skillPath),
        skillPath,
        ...result
      });
    }
    
    return results;
  }

  /**
   * 获取验证统计
   * @param {Array} [results=null] - 验证结果列表（不传则使用内部统计）
   * @returns {Object} 统计信息
   */
  getValidationStats(results = null) {
    if (results) {
      const total = results.length;
      const passed = results.filter(r => r.passed).length;
      const failed = total - passed;
      const avgScore = total > 0 
        ? (results.reduce((sum, r) => sum + r.score, 0) / total).toFixed(2)
        : 0;
      
      return {
        total,
        passed,
        failed,
        passRate: total > 0 ? ((passed / total) * 100).toFixed(2) : 0,
        avgScore,
        minScore: total > 0 ? Math.min(...results.map(r => r.score)) : 0,
        maxScore: total > 0 ? Math.max(...results.map(r => r.score)) : 0
      };
    }
    
    return {
      total: this.stats.validationsRun,
      passed: this.stats.validationsPassed,
      failed: this.stats.validationsFailed,
      passRate: this.stats.validationsRun > 0 
        ? ((this.stats.validationsPassed / this.stats.validationsRun) * 100).toFixed(2)
        : 0,
      avgScore: this.stats.validationsRun > 0
        ? (this.stats.totalScoreSum / this.stats.validationsRun).toFixed(2)
        : 0
    };
  }

  /**
   * 更新统计
   * @private
   * @param {Object} result - 验证结果
   */
  updateStats(result) {
    this.stats.totalScoreSum += result.score;
    if (result.passed) {
      this.stats.validationsPassed++;
    } else {
      this.stats.validationsFailed++;
    }
  }

  /**
   * 重置统计
   */
  resetStats() {
    this.stats = {
      validationsRun: 0,
      validationsPassed: 0,
      validationsFailed: 0,
      totalScoreSum: 0
    };
  }
}

/**
 * 创建ISC校验器的工厂函数
 * @param {Object} config - 配置选项
 * @returns {ISCValidator} ISC校验器实例
 */
export function createISCValidator(config = {}) {
  return new ISCValidator(config);
}

export { ISCValidator };
export default ISCValidator;
