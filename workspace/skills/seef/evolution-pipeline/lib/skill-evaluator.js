/**
 * @file skill-evaluator.js
 * @description 技能评估器 - 扫描技能目录，多维度评估技能质量
 * @module EvolutionPipeline/SkillEvaluator
 * @version 1.0.0
 * @license ISC
 * @copyright (c) 2026 SEEF (技能生态进化工厂)
 * @author SEEF Core Team
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { EventEmitter } from 'events';
import { createRequire } from 'module';
const _require = createRequire(import.meta.url);
const { SKILLS_DIR } = _require('../../../shared/paths');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 评估维度枚举
 * @readonly
 * @enum {string}
 */
export const EvaluationDimension = {
  COMPLETENESS: 'completeness',     // 完整性
  ACTIVITY: 'activity',             // 活跃度
  DEPENDENCY_HEALTH: 'dependencyHealth', // 依赖健康度
  CODE_QUALITY: 'codeQuality'       // 代码质量
};

/**
 * 评分等级枚举
 * @readonly
 * @enum {string}
 */
export const ScoreLevel = {
  EXCELLENT: { min: 90, label: '优秀', color: 'green' },
  GOOD: { min: 75, label: '良好', color: 'blue' },
  PASS: { min: 60, label: '及格', color: 'yellow' },
  FAIL: { min: 0, label: '不及格', color: 'red' }
};

/**
 * 评估结果类
 * @class SkillEvaluationResult
 */
export class SkillEvaluationResult {
  /**
   * @constructor
   * @param {Object} data - 评估数据
   */
  constructor(data = {}) {
    this.skillId = data.skillId || '';
    this.skillPath = data.skillPath || '';
    this.skillName = data.skillName || '';
    this.version = data.version || '0.0.0';
    this.evaluatedAt = data.evaluatedAt || new Date().toISOString();
    
    // 各维度评分 (0-100)
    this.scores = {
      [EvaluationDimension.COMPLETENESS]: data.scores?.completeness || 0,
      [EvaluationDimension.ACTIVITY]: data.scores?.activity || 0,
      [EvaluationDimension.DEPENDENCY_HEALTH]: data.scores?.dependencyHealth || 0,
      [EvaluationDimension.CODE_QUALITY]: data.scores?.codeQuality || 0
    };
    
    // 加权总分
    this.overallScore = data.overallScore || 0;
    this.level = this._determineLevel(this.overallScore);
    
    // 详细指标
    this.metrics = data.metrics || {};
    
    // 改进建议
    this.recommendations = data.recommendations || [];
    
    // 风险提示
    this.risks = data.risks || [];
    
    // 原始数据
    this.rawData = data.rawData || {};
    
    // CRAS 注入状态
    this.crasInjected = data.crasInjected || false;
    this.crasWeights = data.crasWeights || null;
  }

  /**
   * 根据分数确定等级
   * @private
   * @param {number} score - 总分
   * @returns {Object} 等级信息
   */
  _determineLevel(score) {
    if (score >= ScoreLevel.EXCELLENT.min) return ScoreLevel.EXCELLENT;
    if (score >= ScoreLevel.GOOD.min) return ScoreLevel.GOOD;
    if (score >= ScoreLevel.PASS.min) return ScoreLevel.PASS;
    return ScoreLevel.FAIL;
  }

  /**
   * 获取指定维度的评分
   * @param {EvaluationDimension} dimension - 评估维度
   * @returns {number} 评分
   */
  getScore(dimension) {
    return this.scores[dimension] || 0;
  }

  /**
   * 检查是否通过评估
   * @param {number} threshold - 及格线
   * @returns {boolean}
   */
  isPass(threshold = 60) {
    return this.overallScore >= threshold;
  }

  /**
   * 转换为JSON
   * @returns {Object}
   */
  toJSON() {
    return {
      skillId: this.skillId,
      skillPath: this.skillPath,
      skillName: this.skillName,
      version: this.version,
      evaluatedAt: this.evaluatedAt,
      scores: this.scores,
      overallScore: this.overallScore,
      level: this.level,
      metrics: this.metrics,
      recommendations: this.recommendations,
      risks: this.risks,
      crasInjected: this.crasInjected,
      crasWeights: this.crasWeights
    };
  }
}

/**
 * 技能评估器类
 * @class SkillEvaluator
 * @extends EventEmitter
 */
export class SkillEvaluator extends EventEmitter {
  /**
   * @constructor
   * @param {Object} options - 配置选项
   * @param {Object} options.weights - 各维度权重
   * @param {number} [options.weights.completeness=0.3] - 完整性权重
   * @param {number} [options.weights.activity=0.2] - 活跃度权重
   * @param {number} [options.weights.dependencyHealth=0.2] - 依赖健康度权重
   * @param {number} [options.weights.codeQuality=0.3] - 代码质量权重
   * @param {string} [options.skillsBasePath] - 技能基础路径
   */
  constructor(options = {}) {
    super();

    // 默认权重（可被 CRAS 洞察动态覆盖）
    this.defaultWeights = {
      [EvaluationDimension.COMPLETENESS]: options.weights?.completeness || 0.3,
      [EvaluationDimension.ACTIVITY]: options.weights?.activity || 0.2,
      [EvaluationDimension.DEPENDENCY_HEALTH]: options.weights?.dependencyHealth || 0.2,
      [EvaluationDimension.CODE_QUALITY]: options.weights?.codeQuality || 0.3
    };

    this.weights = { ...this.defaultWeights };

    this.skillsBasePath = options.skillsBasePath || SKILLS_DIR;

    // CRAS 洞察缓存（每次 evaluate 会刷新）
    this._crasInsight = null;
    this._crasLoaded = false;
    
    // 评估规则
    this.rules = {
      requiredFiles: ['SKILL.md', 'package.json', 'README.md'],
      requiredCodeFiles: ['index.js', 'index.cjs', 'index.mjs'],
      minReadmeLength: 200,
      maxDependenciesAge: 90 * 24 * 60 * 60 * 1000, // 90天
      maxComplexity: 20
    };

    // 缓存
    this._evaluationCache = new Map();
    this._cacheTTL = 5 * 60 * 1000; // 5分钟
  }

  /**
   * 评估单个技能
   * @async
   * @param {string} skillPath - 技能路径或ID
   * @returns {Promise<SkillEvaluationResult>} 评估结果
   */
  async evaluate(skillPath) {
    const resolvedPath = this._resolveSkillPath(skillPath);
    const skillId = path.basename(resolvedPath);

    // 检查缓存
    const cached = this._getCachedResult(skillId);
    if (cached) {
      this.emit('evaluation:cached', { skillId, result: cached });
      return cached;
    }

    this.emit('evaluation:started', { skillId, skillPath: resolvedPath });

    try {
      // 加载 CRAS 洞察（仅加载一次，后续使用缓存）
      if (!this._crasLoaded) {
        this._crasInsight = this._loadCRASInsight();
        this._crasLoaded = true;
        if (this._crasInsight) {
          this._applyCRASWeights(this._crasInsight);
        }
      }

      // 读取基础信息
      const baseInfo = await this._readBaseInfo(resolvedPath);
      
      // 执行各维度评估
      const completenessScore = await this._evaluateCompleteness(resolvedPath, baseInfo);
      const activityScore = await this._evaluateActivity(resolvedPath, baseInfo);
      const dependencyHealthScore = await this._evaluateDependencyHealth(resolvedPath, baseInfo);
      const codeQualityScore = await this._evaluateCodeQuality(resolvedPath, baseInfo);

      // 计算加权总分
      const overallScore = this._calculateOverallScore({
        [EvaluationDimension.COMPLETENESS]: completenessScore,
        [EvaluationDimension.ACTIVITY]: activityScore,
        [EvaluationDimension.DEPENDENCY_HEALTH]: dependencyHealthScore,
        [EvaluationDimension.CODE_QUALITY]: codeQualityScore
      });

      // 生成改进建议
      const recommendations = this._generateRecommendations({
        [EvaluationDimension.COMPLETENESS]: completenessScore,
        [EvaluationDimension.ACTIVITY]: activityScore,
        [EvaluationDimension.DEPENDENCY_HEALTH]: dependencyHealthScore,
        [EvaluationDimension.CODE_QUALITY]: codeQualityScore
      }, baseInfo);

      // 识别风险
      const risks = this._identifyRisks({
        [EvaluationDimension.COMPLETENESS]: completenessScore,
        [EvaluationDimension.ACTIVITY]: activityScore,
        [EvaluationDimension.DEPENDENCY_HEALTH]: dependencyHealthScore,
        [EvaluationDimension.CODE_QUALITY]: codeQualityScore
      }, baseInfo);

      const result = new SkillEvaluationResult({
        skillId,
        skillPath: resolvedPath,
        skillName: baseInfo.name || skillId,
        version: baseInfo.version || '0.0.0',
        scores: {
          [EvaluationDimension.COMPLETENESS]: completenessScore,
          [EvaluationDimension.ACTIVITY]: activityScore,
          [EvaluationDimension.DEPENDENCY_HEALTH]: dependencyHealthScore,
          [EvaluationDimension.CODE_QUALITY]: codeQualityScore
        },
        overallScore,
        metrics: {
          hasSkillMd: baseInfo.hasSkillMd,
          hasReadme: baseInfo.hasReadme,
          hasPackageJson: baseInfo.hasPackageJson,
          fileCount: baseInfo.fileCount,
          lastModified: baseInfo.lastModified,
          totalLines: baseInfo.totalLines,
          dependencyCount: baseInfo.dependencyCount,
          devDependencyCount: baseInfo.devDependencyCount
        },
        recommendations,
        risks,
        rawData: baseInfo,
        crasInjected: !!this._crasInsight,
        crasWeights: this._crasInsight ? { ...this.weights } : null
      });

      // 缓存结果
      this._cacheResult(skillId, result);

      this.emit('evaluation:completed', { skillId, result });
      return result;

    } catch (error) {
      this.emit('evaluation:error', { skillId, error });
      throw new Error(`评估技能失败 ${skillId}: ${error.message}`);
    }
  }

  /**
   * 批量评估多个技能
   * @async
   * @param {string[]} skillPaths - 技能路径列表
   * @returns {Promise<SkillEvaluationResult[]>} 评估结果列表
   */
  async evaluateBatch(skillPaths) {
    this.emit('batch:started', { count: skillPaths.length });

    const results = [];
    for (const skillPath of skillPaths) {
      try {
        const result = await this.evaluate(skillPath);
        results.push(result);
      } catch (error) {
        this.emit('batch:error', { skillPath, error });
        // 继续处理其他技能
      }
    }

    this.emit('batch:completed', { count: results.length });
    return results;
  }

  /**
   * 扫描技能目录
   * @async
   * @param {string} [basePath] - 基础路径
   * @returns {Promise<string[]>} 技能路径列表
   */
  async scanSkills(basePath = this.skillsBasePath) {
    const skills = [];
    
    try {
      const entries = fs.readdirSync(basePath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillPath = path.join(basePath, entry.name);
          
          // 检查是否为有效技能目录
          if (this._isValidSkill(skillPath)) {
            skills.push(skillPath);
          }
        }
      }
    } catch (error) {
      this.emit('scan:error', { basePath, error });
    }

    return skills;
  }

  /**
   * 解析技能路径
   * @private
   * @param {string} skillPath - 技能路径或ID
   * @returns {string} 完整路径
   */
  _resolveSkillPath(skillPath) {
    if (path.isAbsolute(skillPath)) {
      return skillPath;
    }
    return path.join(this.skillsBasePath, skillPath);
  }

  /**
   * 加载 CRAS 洞察数据
   * 扫描 /skills/cras/insights/user-insight-*.json 取最新一份
   * @private
   * @returns {Object|null} 洞察数据
   */
  _loadCRASInsight() {
    const insightsDir = path.join(this.skillsBasePath, 'cras', 'insights');
    const profilePath = path.join(this.skillsBasePath, 'cras', 'config', 'user-profile.json');

    let insight = null;

    try {
      if (fs.existsSync(insightsDir)) {
        const files = fs.readdirSync(insightsDir)
          .filter(f => f.startsWith('user-insight-') && f.endsWith('.json'))
          .sort()
          .reverse();

        if (files.length > 0) {
          const latestFile = path.join(insightsDir, files[0]);
          insight = JSON.parse(fs.readFileSync(latestFile, 'utf-8'));
          console.log(`[SkillEvaluator] ✅ CRAS洞察已加载: ${files[0]}`);
        }
      }
    } catch (error) {
      console.warn(`[SkillEvaluator] CRAS洞察加载失败: ${error.message}`);
    }

    // 补充用户画像
    try {
      if (fs.existsSync(profilePath)) {
        const profile = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
        if (insight) {
          insight._userProfile = profile;
        } else {
          // 合成最小洞察
          const tags = profile.profile?.tags || [];
          const dist = {};
          for (const t of tags) dist[t] = (dist[t] || 0) + 1;
          const primary = Object.entries(dist).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';
          insight = {
            user_profile: { primary_intent: primary, total_interactions: profile.profile?.interactionCount || 0 },
            intent_distribution: dist,
            capability_gaps: [],
            high_frequency_operations: [],
            _userProfile: profile,
            _syntheticFromProfile: true
          };
          console.log(`[SkillEvaluator] ✅ 从用户画像合成CRAS洞察 (primary=${primary})`);
        }
      }
    } catch (error) {
      console.warn(`[SkillEvaluator] 用户画像加载失败: ${error.message}`);
    }

    if (!insight) {
      console.log(`[SkillEvaluator] ⚠️  无CRAS数据，使用默认权重`);
    }

    return insight;
  }

  /**
   * 根据 CRAS 洞察动态调整评估维度权重
   * @private
   * @param {Object} insight - CRAS 洞察数据
   */
  _applyCRASWeights(insight) {
    const primaryIntent = insight.user_profile?.primary_intent || '';
    const gaps = insight.capability_gaps || [];
    const highFreqOps = insight.high_frequency_operations || [];

    // 重置为默认权重
    this.weights = { ...this.defaultWeights };

    // 按意图类型调整权重
    const intentWeightBoost = {
      command:      { [EvaluationDimension.CODE_QUALITY]: 0.08 },
      execution:    { [EvaluationDimension.CODE_QUALITY]: 0.08 },
      exploration:  { [EvaluationDimension.COMPLETENESS]: 0.06 },
      learning:     { [EvaluationDimension.COMPLETENESS]: 0.06 },
      query:        { [EvaluationDimension.COMPLETENESS]: 0.05, [EvaluationDimension.DEPENDENCY_HEALTH]: 0.03 },
      feedback:     { [EvaluationDimension.ACTIVITY]: 0.06 },
      monitoring:   { [EvaluationDimension.ACTIVITY]: 0.04, [EvaluationDimension.CODE_QUALITY]: 0.04 }
    };

    const boosts = intentWeightBoost[primaryIntent];
    if (boosts) {
      for (const [dim, delta] of Object.entries(boosts)) {
        this.weights[dim] = (this.weights[dim] || 0.25) + delta;
      }
    }

    // 能力缺口 → 提升 completeness 权重
    if (gaps.length > 0) {
      this.weights[EvaluationDimension.COMPLETENESS] += Math.min(0.1, gaps.length * 0.03);
    }

    // 高频操作中含 pipeline/execution → 提升 code quality 权重
    for (const op of highFreqOps) {
      const opName = (op.operation || '').toLowerCase();
      if (opName.includes('pipeline') || opName.includes('execution')) {
        this.weights[EvaluationDimension.CODE_QUALITY] += 0.03;
      }
      if (opName.includes('architecture') || opName.includes('structure')) {
        this.weights[EvaluationDimension.COMPLETENESS] += 0.02;
      }
    }

    // 归一化权重使总和 = 1.0
    const total = Object.values(this.weights).reduce((s, v) => s + v, 0);
    if (total > 0) {
      for (const key of Object.keys(this.weights)) {
        this.weights[key] = this.weights[key] / total;
      }
    }

    console.log(`[SkillEvaluator] ✅ CRAS权重调整完成:`, JSON.stringify(this.weights));
    this.emit('cras:weights-adjusted', { intent: primaryIntent, weights: { ...this.weights } });
  }

  /**
   * 检查是否为有效技能目录
   * @private
   * @param {string} skillPath - 技能路径
   * @returns {boolean}
   */
  _isValidSkill(skillPath) {
    const skillMdPath = path.join(skillPath, 'SKILL.md');
    const packageJsonPath = path.join(skillPath, 'package.json');
    
    return fs.existsSync(skillMdPath) || fs.existsSync(packageJsonPath);
  }

  /**
   * 读取基础信息
   * @private
   * @param {string} skillPath - 技能路径
   * @returns {Promise<Object>} 基础信息
   */
  async _readBaseInfo(skillPath) {
    const info = {
      path: skillPath,
      name: path.basename(skillPath),
      hasSkillMd: false,
      hasReadme: false,
      hasPackageJson: false,
      version: '0.0.0',
      description: '',
      dependencies: {},
      devDependencies: {},
      fileCount: 0,
      totalLines: 0,
      lastModified: null,
      skillMdContent: '',
      readmeContent: ''
    };

    // 检查必要文件
    const skillMdPath = path.join(skillPath, 'SKILL.md');
    const readmePath = path.join(skillPath, 'README.md');
    const packageJsonPath = path.join(skillPath, 'package.json');

    if (fs.existsSync(skillMdPath)) {
      info.hasSkillMd = true;
      info.skillMdContent = fs.readFileSync(skillMdPath, 'utf-8');
      
      // 解析SKILL.md中的元数据
      const metadata = this._parseSkillMetadata(info.skillMdContent);
      info.name = metadata.name || info.name;
      info.version = metadata.version || info.version;
      info.description = metadata.description || info.description;
    }

    if (fs.existsSync(readmePath)) {
      info.hasReadme = true;
      info.readmeContent = fs.readFileSync(readmePath, 'utf-8');
    }

    if (fs.existsSync(packageJsonPath)) {
      info.hasPackageJson = true;
      try {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        info.name = pkg.name || info.name;
        info.version = pkg.version || info.version;
        info.description = pkg.description || info.description;
        info.dependencies = pkg.dependencies || {};
        info.devDependencies = pkg.devDependencies || {};
        info.dependencyCount = Object.keys(info.dependencies).length;
        info.devDependencyCount = Object.keys(info.devDependencies).length;
      } catch (e) {
        // 忽略解析错误
      }
    }

    // 统计文件信息
    const stats = this._scanDirectory(skillPath);
    info.fileCount = stats.fileCount;
    info.totalLines = stats.totalLines;
    info.lastModified = stats.lastModified;

    return info;
  }

  /**
   * 解析SKILL.md元数据
   * @private
   * @param {string} content - SKILL.md内容
   * @returns {Object} 元数据
   */
  _parseSkillMetadata(content) {
    const metadata = {};
    
    // 解析YAML frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (frontmatterMatch) {
      const frontmatter = frontmatterMatch[1];
      const lines = frontmatter.split('\n');
      
      for (const line of lines) {
        const match = line.match(/^(\w+):\s*(.+)$/);
        if (match) {
          metadata[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
        }
      }
    }

    return metadata;
  }

  /**
   * 扫描目录统计信息
   * @private
   * @param {string} dirPath - 目录路径
   * @returns {Object} 统计信息
   */
  _scanDirectory(dirPath) {
    const stats = {
      fileCount: 0,
      totalLines: 0,
      lastModified: null
    };

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const entryPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          // 跳过node_modules和隐藏目录
          if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
            continue;
          }
          
          const subStats = this._scanDirectory(entryPath);
          stats.fileCount += subStats.fileCount;
          stats.totalLines += subStats.totalLines;
          
          if (subStats.lastModified && (!stats.lastModified || subStats.lastModified > stats.lastModified)) {
            stats.lastModified = subStats.lastModified;
          }
        } else if (entry.isFile()) {
          stats.fileCount++;
          
          try {
            const fileStat = fs.statSync(entryPath);
            const content = fs.readFileSync(entryPath, 'utf-8');
            stats.totalLines += content.split('\n').length;
            
            if (!stats.lastModified || fileStat.mtime > stats.lastModified) {
              stats.lastModified = fileStat.mtime;
            }
          } catch (e) {
            // 忽略文件读取错误
          }
        }
      }
    } catch (e) {
      // 忽略目录读取错误
    }

    return stats;
  }

  /**
   * 评估完整性
   * @private
   * @param {string} skillPath - 技能路径
   * @param {Object} baseInfo - 基础信息
   * @returns {number} 评分 (0-100)
   */
  _evaluateCompleteness(skillPath, baseInfo) {
    let score = 0;
    const checks = {
      hasSkillMd: baseInfo.hasSkillMd ? 30 : 0,
      hasPackageJson: baseInfo.hasPackageJson ? 25 : 0,
      hasReadme: baseInfo.hasReadme ? 20 : 0,
      readmeLength: 0,
      hasImplementation: 0,
      hasTests: 0
    };

    // README长度加分
    if (baseInfo.hasReadme) {
      const readmeLength = baseInfo.readmeContent.length;
      checks.readmeLength = Math.min(10, Math.floor(readmeLength / this.rules.minReadmeLength) * 5);
    }

    // 检查实现文件
    for (const codeFile of this.rules.requiredCodeFiles) {
      const codePath = path.join(skillPath, codeFile);
      if (fs.existsSync(codePath)) {
        checks.hasImplementation = 15;
        break;
      }
    }

    // 检查测试文件
    const testPaths = [
      path.join(skillPath, '__tests__'),
      path.join(skillPath, 'test'),
      path.join(skillPath, 'tests')
    ];
    for (const testPath of testPaths) {
      if (fs.existsSync(testPath)) {
        checks.hasTests = 5;
        break;
      }
    }

    // 计算总分
    score = Object.values(checks).reduce((sum, val) => sum + val, 0);
    return Math.min(100, score);
  }

  /**
   * 评估活跃度
   * @private
   * @param {string} skillPath - 技能路径
   * @param {Object} baseInfo - 基础信息
   * @returns {number} 评分 (0-100)
   */
  _evaluateActivity(skillPath, baseInfo) {
    let score = 0;

    if (!baseInfo.lastModified) {
      return 0;
    }

    const now = Date.now();
    const lastModified = new Date(baseInfo.lastModified).getTime();
    const daysSinceModified = (now - lastModified) / (1000 * 60 * 60 * 24);

    // 根据最近修改时间评分
    if (daysSinceModified <= 7) {
      score = 100;
    } else if (daysSinceModified <= 30) {
      score = 90;
    } else if (daysSinceModified <= 60) {
      score = 75;
    } else if (daysSinceModified <= 90) {
      score = 60;
    } else if (daysSinceModified <= 180) {
      score = 40;
    } else if (daysSinceModified <= 365) {
      score = 20;
    } else {
      score = 10;
    }

    // 文件数量作为活跃度的辅助指标
    if (baseInfo.fileCount > 10) {
      score += 5;
    }

    return Math.min(100, score);
  }

  /**
   * 评估依赖健康度
   * @private
   * @param {string} skillPath - 技能路径
   * @param {Object} baseInfo - 基础信息
   * @returns {number} 评分 (0-100)
   */
  _evaluateDependencyHealth(skillPath, baseInfo) {
    let score = 100;
    
    const depCount = baseInfo.dependencyCount || 0;
    const devDepCount = baseInfo.devDependencyCount || 0;

    // 依赖数量检查
    if (depCount === 0) {
      // 无依赖是最佳状态
      score = 100;
    } else if (depCount <= 5) {
      score -= 5;
    } else if (depCount <= 10) {
      score -= 10;
    } else if (depCount <= 20) {
      score -= 20;
    } else {
      score -= 30;
    }

    // 开发依赖检查
    if (devDepCount > 20) {
      score -= 10;
    }

    // 检查是否有已知风险依赖（简化版）
    const riskyPatterns = ['^0.0.', 'alpha', 'beta', 'rc', 'dev'];
    const deps = { ...baseInfo.dependencies, ...baseInfo.devDependencies };
    
    for (const [name, version] of Object.entries(deps)) {
      for (const pattern of riskyPatterns) {
        if (version.includes(pattern)) {
          score -= 5;
          break;
        }
      }
    }

    return Math.max(0, score);
  }

  /**
   * 评估代码质量
   * @private
   * @param {string} skillPath - 技能路径
   * @param {Object} baseInfo - 基础信息
   * @returns {number} 评分 (0-100)
   */
  _evaluateCodeQuality(skillPath, baseInfo) {
    let score = 70; // 基础分

    // 查找代码文件
    const codeFiles = this._findCodeFiles(skillPath);
    
    if (codeFiles.length === 0) {
      return 0;
    }

    let totalComplexity = 0;
    let hasComments = false;
    let hasErrorHandling = false;
    let hasDocumentation = false;

    for (const filePath of codeFiles) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        
        // 检查注释
        if (content.includes('/**') || content.includes('//')) {
          hasComments = true;
        }

        // 检查错误处理
        if (content.includes('try') && content.includes('catch')) {
          hasErrorHandling = true;
        }

        // 检查JSDoc
        if (content.includes('@param') || content.includes('@returns')) {
          hasDocumentation = true;
        }

        // 简单的圈复杂度估计（函数数量）
        const functionMatches = content.match(/(function|=>)\s*\(/g) || [];
        totalComplexity += functionMatches.length;

      } catch (e) {
        // 忽略读取错误
      }
    }

    // 根据检查项加分
    if (hasComments) score += 10;
    if (hasErrorHandling) score += 10;
    if (hasDocumentation) score += 10;

    // 圈复杂度扣分
    const avgComplexity = totalComplexity / codeFiles.length;
    if (avgComplexity > this.rules.maxComplexity) {
      score -= 10;
    }

    // 文件大小检查
    if (baseInfo.totalLines > 0 && baseInfo.totalLines < 5000) {
      score += 5;
    } else if (baseInfo.totalLines > 10000) {
      score -= 10;
    }

    return Math.min(100, Math.max(0, score));
  }

  /**
   * 查找代码文件
   * @private
   * @param {string} dirPath - 目录路径
   * @returns {string[]} 代码文件列表
   */
  _findCodeFiles(dirPath) {
    const codeFiles = [];
    const codeExtensions = ['.js', '.mjs', '.cjs', '.ts'];

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const entryPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
            continue;
          }
          codeFiles.push(...this._findCodeFiles(entryPath));
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          if (codeExtensions.includes(ext)) {
            codeFiles.push(entryPath);
          }
        }
      }
    } catch (e) {
      // 忽略错误
    }

    return codeFiles;
  }

  /**
   * 计算加权总分
   * @private
   * @param {Object} scores - 各维度评分
   * @returns {number} 加权总分
   */
  _calculateOverallScore(scores) {
    let totalScore = 0;
    let totalWeight = 0;

    for (const [dimension, score] of Object.entries(scores)) {
      const weight = this.weights[dimension] || 0.25;
      totalScore += score * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? Math.round(totalScore / totalWeight) : 0;
  }

  /**
   * 生成改进建议
   * @private
   * @param {Object} scores - 各维度评分
   * @param {Object} baseInfo - 基础信息
   * @returns {string[]} 建议列表
   */
  _generateRecommendations(scores, baseInfo) {
    const recommendations = [];

    // 完整性建议
    if (scores[EvaluationDimension.COMPLETENESS] < 80) {
      if (!baseInfo.hasSkillMd) {
        recommendations.push('创建SKILL.md文件，包含技能元数据和描述');
      }
      if (!baseInfo.hasReadme) {
        recommendations.push('创建README.md文件，提供使用说明');
      }
      if (baseInfo.hasReadme && baseInfo.readmeContent.length < this.rules.minReadmeLength) {
        recommendations.push('扩展README.md内容，增加详细的使用示例');
      }
    }

    // 活跃度建议
    if (scores[EvaluationDimension.ACTIVITY] < 60) {
      recommendations.push('技能超过3个月未更新，建议检查是否有需要修复的问题');
    }

    // 依赖健康度建议
    if (scores[EvaluationDimension.DEPENDENCY_HEALTH] < 80) {
      if (baseInfo.dependencyCount > 10) {
        recommendations.push('依赖数量较多，考虑精简不必要的依赖');
      }
      recommendations.push('检查依赖版本，避免使用预发布版本');
    }

    // 代码质量建议
    if (scores[EvaluationDimension.CODE_QUALITY] < 80) {
      recommendations.push('增加代码注释和JSDoc文档');
      recommendations.push('添加错误处理机制（try-catch）');
    }

    return recommendations;
  }

  /**
   * 识别风险
   * @private
   * @param {Object} scores - 各维度评分
   * @param {Object} baseInfo - 基础信息
   * @returns {string[]} 风险列表
   */
  _identifyRisks(scores, baseInfo) {
    const risks = [];

    if (scores[EvaluationDimension.COMPLETENESS] < 40) {
      risks.push('CRITICAL: 技能文档严重缺失，可能影响用户使用');
    }

    if (scores[EvaluationDimension.ACTIVITY] < 20) {
      risks.push('WARNING: 技能超过一年未更新，可能存在兼容性问题');
    }

    if (scores[EvaluationDimension.DEPENDENCY_HEALTH] < 50) {
      risks.push('WARNING: 依赖健康状况不佳，可能存在安全风险');
    }

    if (scores[EvaluationDimension.CODE_QUALITY] < 40) {
      risks.push('WARNING: 代码质量评分较低，建议重构');
    }

    return risks;
  }

  /**
   * 获取缓存结果
   * @private
   * @param {string} skillId - 技能ID
   * @returns {SkillEvaluationResult|null} 缓存结果
   */
  _getCachedResult(skillId) {
    const cached = this._evaluationCache.get(skillId);
    if (!cached) return null;

    // 检查是否过期
    if (Date.now() - cached.timestamp > this._cacheTTL) {
      this._evaluationCache.delete(skillId);
      return null;
    }

    return cached.result;
  }

  /**
   * 缓存结果
   * @private
   * @param {string} skillId - 技能ID
   * @param {SkillEvaluationResult} result - 评估结果
   */
  _cacheResult(skillId, result) {
    this._evaluationCache.set(skillId, {
      result,
      timestamp: Date.now()
    });
  }

  /**
   * 清除缓存
   * @param {string} [skillId] - 特定技能ID，不传则清除全部
   */
  clearCache(skillId) {
    if (skillId) {
      this._evaluationCache.delete(skillId);
    } else {
      this._evaluationCache.clear();
    }
  }
}

/**
 * 创建技能评估器的工厂函数
 * @param {Object} options - 配置选项
 * @returns {SkillEvaluator}
 */
export function createSkillEvaluator(options = {}) {
  return new SkillEvaluator(options);
}

export default SkillEvaluator;
