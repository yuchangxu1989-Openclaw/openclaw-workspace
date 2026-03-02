/**
 * @file decision-engine.js
 * @description 决策引擎 - 根据评估结果决定进化策略并生成执行计划
 * @module EvolutionPipeline/DecisionEngine
 * @version 1.0.0
 * @license ISC
 * @copyright (c) 2026 SEEF (技能生态进化工厂)
 * @author SEEF Core Team
 */

import { EventEmitter } from 'events';

/**
 * 进化策略类型枚举
 * @readonly
 * @enum {string}
 */
export const EvolutionStrategy = {
  AUTO_FIX: 'auto_fix',           // 自动修复
  MANUAL_REVIEW: 'manual_review', // 建议人工
  SKIP: 'skip',                   // 跳过
  ARCHIVE: 'archive'              // 归档
};

/**
 * 操作类型枚举
 * @readonly
 * @enum {string}
 */
export const OperationType = {
  UPDATE_VERSION: 'update_version',     // 更新版本
  GENERATE_DOC: 'generate_doc',         // 生成文档
  FIX_DEPENDENCIES: 'fix_dependencies', // 修复依赖
  REFACTOR_CODE: 'refactor_code',       // 重构代码
  GIT_COMMIT: 'git_commit',             // Git提交
  GIT_TAG: 'git_tag',                   // Git标签
  EVOMAP_UPLOAD: 'evomap_upload',       // EvoMap上传
  NOTIFY: 'notify',                     // 发送通知
  BACKUP: 'backup'                      // 创建备份
};

/**
 * 执行步骤类
 * @class ExecutionStep
 */
export class ExecutionStep {
  /**
   * @constructor
   * @param {Object} data - 步骤数据
   */
  constructor(data = {}) {
    this.id = data.id || `step_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.type = data.type || '';
    this.name = data.name || '';
    this.description = data.description || '';
    this.params = data.params || {};
    this.dependsOn = data.dependsOn || [];
    this.canRollback = data.canRollback !== false;
    this.rollbackAction = data.rollbackAction || null;
    this.timeout = data.timeout || 300000; // 默认5分钟
    this.retryCount = data.retryCount || 0;
    this.maxRetries = data.maxRetries || 3;
    this.condition = data.condition || null; // 执行条件
  }

  /**
   * 转换为JSON
   * @returns {Object}
   */
  toJSON() {
    return {
      id: this.id,
      type: this.type,
      name: this.name,
      description: this.description,
      params: this.params,
      dependsOn: this.dependsOn,
      canRollback: this.canRollback,
      timeout: this.timeout,
      maxRetries: this.maxRetries
    };
  }
}

/**
 * 执行计划类
 * @class ExecutionPlan
 */
export class ExecutionPlan {
  /**
   * @constructor
   * @param {Object} data - 计划数据
   */
  constructor(data = {}) {
    this.id = data.id || `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.skillId = data.skillId || '';
    this.skillPath = data.skillPath || '';
    this.strategy = data.strategy || EvolutionStrategy.SKIP;
    this.createdAt = data.createdAt || new Date().toISOString();
    this.steps = (data.steps || []).map(s => s instanceof ExecutionStep ? s : new ExecutionStep(s));
    this.metadata = data.metadata || {};
    this.estimatedDuration = data.estimatedDuration || 0;
    this.riskLevel = data.riskLevel || 'low';
    this.requiresApproval = data.requiresApproval || false;
  }

  /**
   * 添加步骤
   * @param {ExecutionStep} step - 执行步骤
   * @returns {ExecutionPlan} this
   */
  addStep(step) {
    this.steps.push(step instanceof ExecutionStep ? step : new ExecutionStep(step));
    return this;
  }

  /**
   * 获取可执行步骤（依赖已完成的）
   * @param {Set<string>} completedStepIds - 已完成步骤ID
   * @returns {ExecutionStep[]} 可执行步骤
   */
  getExecutableSteps(completedStepIds = new Set()) {
    return this.steps.filter(step => {
      // 已完成
      if (completedStepIds.has(step.id)) return false;
      // 依赖已满足
      return step.dependsOn.every(depId => completedStepIds.has(depId));
    });
  }

  /**
   * 获取需要回滚的步骤（逆序）
   * @param {Set<string>} completedStepIds - 已完成步骤ID
   * @returns {ExecutionStep[]} 需要回滚的步骤
   */
  getRollbackSteps(completedStepIds = new Set()) {
    const completed = this.steps.filter(s => completedStepIds.has(s.id));
    // 逆序，先执行的最后回滚
    return completed.reverse().filter(s => s.canRollback);
  }

  /**
   * 验证计划完整性
   * @returns {Object} 验证结果
   */
  validate() {
    const errors = [];
    const warnings = [];

    // 检查步骤ID唯一性
    const stepIds = new Set();
    for (const step of this.steps) {
      if (stepIds.has(step.id)) {
        errors.push(`重复步骤ID: ${step.id}`);
      }
      stepIds.add(step.id);
    }

    // 检查依赖是否存在
    for (const step of this.steps) {
      for (const depId of step.dependsOn) {
        if (!stepIds.has(depId)) {
          errors.push(`步骤 ${step.id} 依赖不存在的步骤: ${depId}`);
        }
      }
    }

    // 检查循环依赖
    const visited = new Set();
    const recursionStack = new Set();

    const hasCycle = (stepId, steps) => {
      visited.add(stepId);
      recursionStack.add(stepId);

      const step = steps.find(s => s.id === stepId);
      if (step) {
        for (const depId of step.dependsOn) {
          if (!visited.has(depId)) {
            if (hasCycle(depId, steps)) return true;
          } else if (recursionStack.has(depId)) {
            return true;
          }
        }
      }

      recursionStack.delete(stepId);
      return false;
    };

    for (const step of this.steps) {
      if (!visited.has(step.id)) {
        if (hasCycle(step.id, this.steps)) {
          errors.push('检测到循环依赖');
          break;
        }
      }
    }

    // 警告检查
    if (this.steps.length === 0) {
      warnings.push('计划不包含任何步骤');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * 转换为JSON
   * @returns {Object}
   */
  toJSON() {
    return {
      id: this.id,
      skillId: this.skillId,
      skillPath: this.skillPath,
      strategy: this.strategy,
      createdAt: this.createdAt,
      steps: this.steps.map(s => s.toJSON()),
      metadata: this.metadata,
      estimatedDuration: this.estimatedDuration,
      riskLevel: this.riskLevel,
      requiresApproval: this.requiresApproval
    };
  }
}

/**
 * 决策规则
 * @typedef {Object} DecisionRule
 * @property {Function} condition - 条件函数 (evaluationResult) => boolean
 * @property {EvolutionStrategy} strategy - 决策策略
 * @property {number} priority - 优先级（数字越小优先级越高）
 * @property {string} reason - 决策原因
 */

/**
 * 默认决策规则
 * @type {DecisionRule[]}
 */
export const DEFAULT_DECISION_RULES = [
  {
    name: '严重质量问题-归档',
    condition: (result) => result.overallScore < 30 || result.risks.some(r => r.startsWith('CRITICAL')),
    strategy: EvolutionStrategy.ARCHIVE,
    priority: 1,
    reason: '技能质量严重不达标，建议归档处理'
  },
  {
    name: '优秀技能-自动跳过',
    condition: (result) => result.overallScore >= 90 && result.level.label === '优秀',
    strategy: EvolutionStrategy.SKIP,
    priority: 2,
    reason: '技能质量优秀，无需修改'
  },
  {
    name: '良好技能-小修复',
    condition: (result) => result.overallScore >= 75 && result.overallScore < 90,
    strategy: EvolutionStrategy.AUTO_FIX,
    priority: 3,
    reason: '技能质量良好，可以自动修复小问题'
  },
  {
    name: '及格技能-需审核',
    condition: (result) => result.overallScore >= 60 && result.overallScore < 75,
    strategy: EvolutionStrategy.MANUAL_REVIEW,
    priority: 4,
    reason: '技能质量及格，建议人工审核后处理'
  },
  {
    name: '不及格-人工处理',
    condition: (result) => result.overallScore < 60,
    strategy: EvolutionStrategy.MANUAL_REVIEW,
    priority: 5,
    reason: '技能质量不及格，需要人工介入'
  }
];

/**
 * 决策引擎类
 * @class DecisionEngine
 * @extends EventEmitter
 */
export class DecisionEngine extends EventEmitter {
  /**
   * @constructor
   * @param {Object} options - 配置选项
   * @param {DecisionRule[]} [options.rules] - 自定义决策规则
   * @param {Object} [options.thresholds] - 阈值配置
   */
  constructor(options = {}) {
    super();

    this.rules = options.rules || [...DEFAULT_DECISION_RULES];
    this.thresholds = {
      autoFixMaxScore: 85,
      manualReviewMinScore: 60,
      archiveMaxScore: 30,
      ...options.thresholds
    };

    // 策略处理器映射
    this._strategyHandlers = new Map([
      [EvolutionStrategy.AUTO_FIX, this._handleAutoFix.bind(this)],
      [EvolutionStrategy.MANUAL_REVIEW, this._handleManualReview.bind(this)],
      [EvolutionStrategy.SKIP, this._handleSkip.bind(this)],
      [EvolutionStrategy.ARCHIVE, this._handleArchive.bind(this)]
    ]);
  }

  /**
   * 添加决策规则
   * @param {DecisionRule} rule - 决策规则
   * @returns {DecisionEngine} this
   */
  addRule(rule) {
    this.rules.push(rule);
    // 按优先级排序
    this.rules.sort((a, b) => a.priority - b.priority);
    return this;
  }

  /**
   * 移除决策规则
   * @param {string} ruleName - 规则名称
   * @returns {DecisionEngine} this
   */
  removeRule(ruleName) {
    this.rules = this.rules.filter(r => r.name !== ruleName);
    return this;
  }

  /**
   * 做出决策
   * @param {SkillEvaluationResult} evaluationResult - 评估结果
   * @returns {Object} 决策结果
   */
  decide(evaluationResult) {
    this.emit('decision:started', { skillId: evaluationResult.skillId });

    // 按优先级匹配规则
    for (const rule of this.rules) {
      if (rule.condition(evaluationResult)) {
        const decision = {
          skillId: evaluationResult.skillId,
          strategy: rule.strategy,
          reason: rule.reason,
          ruleName: rule.name,
          score: evaluationResult.overallScore,
          timestamp: new Date().toISOString()
        };

        this.emit('decision:made', decision);
        return decision;
      }
    }

    // 默认决策
    const defaultDecision = {
      skillId: evaluationResult.skillId,
      strategy: EvolutionStrategy.SKIP,
      reason: '未匹配到任何规则，默认跳过',
      ruleName: 'default',
      score: evaluationResult.overallScore,
      timestamp: new Date().toISOString()
    };

    this.emit('decision:made', defaultDecision);
    return defaultDecision;
  }

  /**
   * 生成执行计划
   * @param {SkillEvaluationResult} evaluationResult - 评估结果
   * @param {Object} decision - 决策结果
   * @returns {ExecutionPlan} 执行计划
   */
  generatePlan(evaluationResult, decision) {
    this.emit('plan:generation:started', { 
      skillId: evaluationResult.skillId,
      strategy: decision.strategy 
    });

    const handler = this._strategyHandlers.get(decision.strategy);
    if (!handler) {
      throw new Error(`未知的策略类型: ${decision.strategy}`);
    }

    const plan = handler(evaluationResult, decision);
    
    // 验证计划
    const validation = plan.validate();
    if (!validation.valid) {
      throw new Error(`执行计划验证失败: ${validation.errors.join(', ')}`);
    }

    this.emit('plan:generation:completed', { 
      skillId: evaluationResult.skillId,
      planId: plan.id,
      stepCount: plan.steps.length
    });

    return plan;
  }

  /**
   * 批量决策和生成计划
   * @param {Array<{result: SkillEvaluationResult, decision?: Object}>} items - 评估结果列表
   * @returns {Array<ExecutionPlan>} 执行计划列表
   */
  generateBatchPlans(items) {
    const plans = [];

    for (const item of items) {
      try {
        const decision = item.decision || this.decide(item.result);
        const plan = this.generatePlan(item.result, decision);
        plans.push(plan);
      } catch (error) {
        this.emit('plan:generation:error', {
          skillId: item.result.skillId,
          error: error.message
        });
      }
    }

    return plans;
  }

  /**
   * 处理自动修复策略
   * @private
   * @param {SkillEvaluationResult} result - 评估结果
   * @param {Object} decision - 决策结果
   * @returns {ExecutionPlan} 执行计划
   */
  _handleAutoFix(result, decision) {
    const plan = new ExecutionPlan({
      skillId: result.skillId,
      skillPath: result.skillPath,
      strategy: EvolutionStrategy.AUTO_FIX,
      metadata: {
        decision,
        evaluation: result.toJSON()
      },
      riskLevel: 'medium',
      requiresApproval: false
    });

    const scores = result.scores;
    const recommendations = result.recommendations;

    // 根据评分缺陷生成修复步骤

    // 1. 文档修复
    if (scores.completeness < 80) {
      if (recommendations.some(r => r.includes('SKILL.md'))) {
        const backupStep = new ExecutionStep({
          type: OperationType.BACKUP,
          name: '备份原始文件',
          description: '备份SKILL.md和README.md',
          params: { files: ['SKILL.md', 'README.md'] },
          id: 'step_backup'
        });
        plan.addStep(backupStep);

        const docStep = new ExecutionStep({
          type: OperationType.GENERATE_DOC,
          name: '生成SKILL.md',
          description: '基于package.json生成SKILL.md模板',
          params: { 
            template: 'skill',
            outputPath: 'SKILL.md'
          },
          dependsOn: ['step_backup'],
          id: 'step_gen_skill_md'
        });
        plan.addStep(docStep);
      }

      if (recommendations.some(r => r.includes('README.md'))) {
        const readmeStep = new ExecutionStep({
          type: OperationType.GENERATE_DOC,
          name: '生成README.md',
          description: '基于代码生成README.md',
          params: { 
            template: 'readme',
            outputPath: 'README.md'
          },
          dependsOn: ['step_backup'],
          id: 'step_gen_readme'
        });
        plan.addStep(readmeStep);
      }
    }

    // 2. 依赖修复
    if (scores.dependencyHealth < 70) {
      const depStep = new ExecutionStep({
        type: OperationType.FIX_DEPENDENCIES,
        name: '修复依赖',
        description: '更新过期依赖，移除未使用依赖',
        params: { 
          updateOutdated: true,
          removeUnused: true
        },
        id: 'step_fix_deps'
      });
      plan.addStep(depStep);
    }

    // 3. 版本更新
    const versionStep = new ExecutionStep({
      type: OperationType.UPDATE_VERSION,
      name: '更新版本号',
      description: '递增patch版本号',
      params: { 
        bumpType: 'patch'
      },
      id: 'step_update_version'
    });
    plan.addStep(versionStep);

    // 4. Git提交
    const gitStep = new ExecutionStep({
      type: OperationType.GIT_COMMIT,
      name: 'Git提交',
      description: '提交所有变更',
      params: { 
        message: `fix: 自动修复技能质量问题 [score: ${result.overallScore}]`,
        include: ['SKILL.md', 'README.md', 'package.json', 'package-lock.json']
      },
      dependsOn: ['step_update_version', 'step_fix_deps'],
      id: 'step_git_commit'
    });
    plan.addStep(gitStep);

    // 5. EvoMap上传
    const uploadStep = new ExecutionStep({
      type: OperationType.EVOMAP_UPLOAD,
      name: '上传到EvoMap',
      description: '将更新后的技能同步到EvoMap',
      params: { 
        skillPath: result.skillPath
      },
      dependsOn: ['step_git_commit'],
      id: 'step_evomap_upload'
    });
    plan.addStep(uploadStep);

    // 6. 通知
    const notifyStep = new ExecutionStep({
      type: OperationType.NOTIFY,
      name: '发送通知',
      description: '通知技能修复完成',
      params: { 
        type: 'success',
        message: `技能 ${result.skillId} 自动修复完成`
      },
      dependsOn: ['step_evomap_upload'],
      id: 'step_notify'
    });
    plan.addStep(notifyStep);

    // 估算执行时间 (每个步骤30秒)
    plan.estimatedDuration = plan.steps.length * 30000;

    return plan;
  }

  /**
   * 处理人工审核策略
   * @private
   * @param {SkillEvaluationResult} result - 评估结果
   * @param {Object} decision - 决策结果
   * @returns {ExecutionPlan} 执行计划
   */
  _handleManualReview(result, decision) {
    const plan = new ExecutionPlan({
      skillId: result.skillId,
      skillPath: result.skillPath,
      strategy: EvolutionStrategy.MANUAL_REVIEW,
      metadata: {
        decision,
        evaluation: result.toJSON()
      },
      riskLevel: 'high',
      requiresApproval: true
    });

    // 1. 生成问题报告
    const reportStep = new ExecutionStep({
      type: OperationType.GENERATE_DOC,
      name: '生成问题报告',
      description: '生成详细的质量问题报告',
      params: { 
        template: 'report',
        outputPath: `reports/${result.skillId}_issues.md`,
        data: result.toJSON()
      },
      id: 'step_gen_report'
    });
    plan.addStep(reportStep);

    // 2. 备份
    const backupStep = new ExecutionStep({
      type: OperationType.BACKUP,
      name: '创建备份',
      description: '创建技能完整备份',
      params: { 
        backupPath: `backups/${result.skillId}_${Date.now()}`
      },
      id: 'step_backup'
    });
    plan.addStep(backupStep);

    // 3. 通知
    const notifyStep = new ExecutionStep({
      type: OperationType.NOTIFY,
      name: '发送审核通知',
      description: '通知人工审核',
      params: { 
        type: 'warning',
        message: `技能 ${result.skillId} 需要人工审核`,
        details: result.recommendations
      },
      dependsOn: ['step_gen_report'],
      id: 'step_notify'
    });
    plan.addStep(notifyStep);

    plan.estimatedDuration = 60000; // 1分钟

    return plan;
  }

  /**
   * 处理跳过策略
   * @private
   * @param {SkillEvaluationResult} result - 评估结果
   * @param {Object} decision - 决策结果
   * @returns {ExecutionPlan} 执行计划
   */
  _handleSkip(result, decision) {
    const plan = new ExecutionPlan({
      skillId: result.skillId,
      skillPath: result.skillPath,
      strategy: EvolutionStrategy.SKIP,
      metadata: {
        decision,
        evaluation: result.toJSON()
      },
      riskLevel: 'low',
      requiresApproval: false
    });

    // 仅记录日志
    const logStep = new ExecutionStep({
      type: OperationType.NOTIFY,
      name: '记录跳过',
      description: '记录技能跳过的原因',
      params: { 
        type: 'info',
        message: `技能 ${result.skillId} 跳过: ${decision.reason}`
      },
      id: 'step_log_skip'
    });
    plan.addStep(logStep);

    plan.estimatedDuration = 1000;

    return plan;
  }

  /**
   * 处理归档策略
   * @private
   * @param {SkillEvaluationResult} result - 评估结果
   * @param {Object} decision - 决策结果
   * @returns {ExecutionPlan} 执行计划
   */
  _handleArchive(result, decision) {
    const plan = new ExecutionPlan({
      skillId: result.skillId,
      skillPath: result.skillPath,
      strategy: EvolutionStrategy.ARCHIVE,
      metadata: {
        decision,
        evaluation: result.toJSON()
      },
      riskLevel: 'high',
      requiresApproval: true
    });

    // 1. 备份
    const backupStep = new ExecutionStep({
      type: OperationType.BACKUP,
      name: '归档备份',
      description: '创建技能完整归档备份',
      params: { 
        backupPath: `archive/${result.skillId}_${Date.now()}`,
        includeAll: true
      },
      id: 'step_archive_backup'
    });
    plan.addStep(backupStep);

    // 2. 更新状态
    const statusStep = new ExecutionStep({
      type: OperationType.GENERATE_DOC,
      name: '标记归档',
      description: '在SKILL.md中标记技能已归档',
      params: { 
        action: 'mark_archived',
        reason: decision.reason
      },
      id: 'step_mark_archived'
    });
    plan.addStep(statusStep);

    // 3. Git提交
    const gitStep = new ExecutionStep({
      type: OperationType.GIT_COMMIT,
      name: 'Git提交归档',
      description: '提交归档标记',
      params: { 
        message: `archive: 归档技能 ${result.skillId}`
      },
      dependsOn: ['step_mark_archived'],
      id: 'step_git_archive'
    });
    plan.addStep(gitStep);

    // 4. 通知
    const notifyStep = new ExecutionStep({
      type: OperationType.NOTIFY,
      name: '归档通知',
      description: '通知技能已归档',
      params: { 
        type: 'warning',
        message: `技能 ${result.skillId} 已归档: ${decision.reason}`
      },
      dependsOn: ['step_git_archive'],
      id: 'step_notify_archive'
    });
    plan.addStep(notifyStep);

    plan.estimatedDuration = 120000; // 2分钟

    return plan;
  }

  /**
   * 获取决策统计
   * @param {ExecutionPlan[]} plans - 执行计划列表
   * @returns {Object} 统计信息
   */
  getStatistics(plans) {
    const stats = {
      total: plans.length,
      byStrategy: {},
      byRiskLevel: {},
      requiresApproval: 0,
      totalEstimatedDuration: 0
    };

    for (const plan of plans) {
      // 按策略统计
      stats.byStrategy[plan.strategy] = (stats.byStrategy[plan.strategy] || 0) + 1;
      
      // 按风险等级统计
      stats.byRiskLevel[plan.riskLevel] = (stats.byRiskLevel[plan.riskLevel] || 0) + 1;
      
      // 需要审批的
      if (plan.requiresApproval) {
        stats.requiresApproval++;
      }
      
      // 总预计时间
      stats.totalEstimatedDuration += plan.estimatedDuration;
    }

    return stats;
  }
}

/**
 * 创建决策引擎的工厂函数
 * @param {Object} options - 配置选项
 * @returns {DecisionEngine}
 */
export function createDecisionEngine(options = {}) {
  return new DecisionEngine(options);
}

export default DecisionEngine;
