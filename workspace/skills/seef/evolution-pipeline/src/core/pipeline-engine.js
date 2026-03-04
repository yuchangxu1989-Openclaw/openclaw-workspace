/**
 * @fileoverview 流水线引擎 (Pipeline Engine) - EvoMap进化流水线核心
 * @description 执行技能生命周期状态流转，调度ISC校验和EvoMap上传
 * @module PipelineEngine
 * @version 1.0.0
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const _require = createRequire(import.meta.url);
const { SKILLS_DIR } = _require('../../../../_shared/paths');
import { StateManager, PIPELINE_STATES } from './state-manager.js';
import { ISCValidator } from './isc-validator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 流水线引擎类
 * @class PipelineEngine
 * @description 管理技能从DEVELOP到ONLINE的完整生命周期
 */
class PipelineEngine {
  /**
   * @constructor
   * @param {Object} config - 配置选项
   * @param {string} [config.configPath] - 配置文件路径
   * @param {Object} [config.stateManager] - 状态管理器配置
   * @param {Object} [config.iscValidator] - ISC校验器配置
   * @param {Object} [config.evomapUploader] - EvoMap上传器配置
   */
  constructor(config = {}) {
    this.config = this.loadConfig(config);
    this.initialized = false;
    
    // 初始化子模块
    this.stateManager = new StateManager({
      statePath: this.config.storage?.statePath,
      ...config.stateManager
    });
    
    this.iscValidator = new ISCValidator({
      minScore: this.config.isc?.minScore || 70,
      ...config.iscValidator
    });
    
    // 延迟初始化上传器（避免循环依赖）
    this.evomapUploader = null;
    
    // 任务队列
    this.taskQueue = [];
    this.isProcessing = false;
    
    // 统计
    this.stats = {
      jobsProcessed: 0,
      jobsFailed: 0,
      jobsSkipped: 0,
      startTime: new Date().toISOString()
    };
    
    // 事件处理器
    this.eventHandlers = new Map();
  }

  /**
   * 加载配置
   * @private
   * @param {Object} overrideConfig - 覆盖配置
   * @returns {Object} 合并后的配置
   */
  loadConfig(overrideConfig = {}) {
    const defaultConfigPath = path.join(__dirname, '../../config/pipeline.config.json');
    let defaultConfig = {};
    
    if (fs.existsSync(defaultConfigPath)) {
      try {
        defaultConfig = JSON.parse(fs.readFileSync(defaultConfigPath, 'utf-8'));
      } catch (e) {
        console.warn(`[PipelineEngine] 加载默认配置失败: ${e.message}`);
      }
    }
    
    return { ...defaultConfig, ...overrideConfig };
  }

  /**
   * 初始化引擎
   * @async
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    console.log('[PipelineEngine] 初始化引擎...');
    
    // 动态导入EvoMap上传器（避免循环依赖）
    try {
      const { EvoMapUploader } = await import('../uploaders/evomap-uploader.js');
      this.evomapUploader = new EvoMapUploader({
        hubUrl: this.config.evomap?.hubUrl,
        autoSync: this.config.evomap?.autoSync,
        maxRetries: this.config.evomap?.maxRetries,
        offlineMode: this.config.evomap?.offlineMode !== false,
        ...this.config.evomapUploader
      });
      await this.evomapUploader.initialize();
    } catch (e) {
      console.warn(`[PipelineEngine] EvoMap上传器初始化失败: ${e.message}`);
    }
    
    this.initialized = true;
    console.log('[PipelineEngine] 引擎初始化完成');
  }

  /**
   * 处理技能状态变更
   * @async
   * @param {string} skillPath - 技能路径
   * @param {Object} [context={}] - 执行上下文
   * @returns {Promise<Object>} 处理结果
   */
  async processSkill(skillPath, context = {}) {
    const skillId = path.basename(skillPath);
    console.log(`[PipelineEngine] 处理技能: ${skillId}`);
    
    try {
      // 获取或创建技能状态
      let state = this.stateManager.getOrCreateState(skillPath);
      
      // 触发beforeProcess事件
      await this.emit('beforeProcess', { skillId, state, context });
      
      // 根据当前状态执行相应处理
      const result = await this.handleState(state, context);
      
      // 触发afterProcess事件
      await this.emit('afterProcess', { skillId, state: result, context });
      
      this.stats.jobsProcessed++;
      return result;
      
    } catch (e) {
      console.error(`[PipelineEngine] 处理技能失败: ${skillId}`, e.message);
      this.stats.jobsFailed++;
      
      // 触发error事件
      await this.emit('error', { skillId, error: e, context });
      
      // 标记为失败状态
      try {
        this.stateManager.transitionState(
          skillId,
          PIPELINE_STATES.FAILED,
          `处理异常: ${e.message}`,
          'pipeline_engine'
        );
      } catch (transitionError) {
        console.error(`[PipelineEngine] 状态流转失败: ${transitionError.message}`);
      }
      
      throw e;
    }
  }

  /**
   * 处理特定状态
   * @async
   * @param {Object} state - 技能状态
   * @param {Object} context - 执行上下文
   * @returns {Promise<Object>} 处理后的状态
   */
  async handleState(state, context = {}) {
    const { currentState } = state;
    
    switch (currentState) {
      case PIPELINE_STATES.DEVELOP:
        return await this.handleDevelopState(state, context);
      case PIPELINE_STATES.TEST:
        return await this.handleTestState(state, context);
      case PIPELINE_STATES.REVIEW:
        return await this.handleReviewState(state, context);
      case PIPELINE_STATES.RELEASE:
        return await this.handleReleaseState(state, context);
      case PIPELINE_STATES.SYNC:
        return await this.handleSyncState(state, context);
      case PIPELINE_STATES.ONLINE:
        return await this.handleOnlineState(state, context);
      case PIPELINE_STATES.FAILED:
        return await this.handleFailedState(state, context);
      default:
        console.warn(`[PipelineEngine] 未知状态: ${currentState}`);
        return state;
    }
  }

  /**
   * 处理DEVELOP状态
   * @async
   * @param {Object} state - 技能状态
   * @param {Object} context - 执行上下文
   * @returns {Promise<Object>} 更新后的状态
   */
  async handleDevelopState(state, context = {}) {
    console.log(`[PipelineEngine] ${state.skillId}: DEVELOP -> TEST`);
    
    // 自动流转到TEST状态
    this.stateManager.transitionState(
      state.skillId,
      PIPELINE_STATES.TEST,
      context.triggerReason || '文件变更触发测试',
      context.triggeredBy || 'file_watcher'
    );
    
    // 触发状态变更事件
    await this.emit('stateTransition', { 
      skillId: state.skillId, 
      from: PIPELINE_STATES.DEVELOP, 
      to: PIPELINE_STATES.TEST 
    });
    
    // 继续处理TEST状态（如果配置为自动流转）
    const newState = this.stateManager.getOrCreateState(state.skillPath);
    if (this.config.pipeline?.states?.TEST?.autoTransition !== false) {
      return await this.handleTestState(newState, context);
    }
    return newState;
  }

  /**
   * 处理TEST状态
   * @async
   * @param {Object} state - 技能状态
   * @param {Object} context - 执行上下文
   * @returns {Promise<Object>} 更新后的状态
   */
  async handleTestState(state, context = {}) {
    console.log(`[PipelineEngine] ${state.skillId}: 执行ISC校验`);
    
    // 触发beforeValidate事件
    await this.emit('beforeValidate', { skillId: state.skillId, state });
    
    // 执行ISC校验
    const validationResult = await this.iscValidator.validate(state.skillPath);
    
    // 更新ISC分数到状态
    this.stateManager.updateState(state.skillId, {
      iscScore: validationResult.score,
      iscReport: validationResult.rawReport,
      lastValidationAt: new Date().toISOString()
    });
    
    // 触发afterValidate事件
    await this.emit('afterValidate', { 
      skillId: state.skillId, 
      result: validationResult 
    });
    
    if (validationResult.passed) {
      console.log(`[PipelineEngine] ${state.skillId}: ISC校验通过 (${validationResult.score}分)`);
      
      // 流转到REVIEW状态
      this.stateManager.transitionState(
        state.skillId,
        PIPELINE_STATES.REVIEW,
        `ISC校验通过: ${validationResult.score}分`,
        'isc_validator'
      );
      
      const newState = this.stateManager.getOrCreateState(state.skillPath);
      
      // 自动流转到RELEASE（如果分数>=80且配置允许）
      if (validationResult.score >= 80 && 
          this.config.pipeline?.states?.REVIEW?.autoTransition !== false) {
        return await this.handleReviewState(newState, context);
      }
      
      return newState;
    } else {
      console.log(`[PipelineEngine] ${state.skillId}: ISC校验失败 (${validationResult.score}分)`);
      
      const reasons = validationResult.recommendations?.join('; ') || '质量评分未达标';
      
      // 流转回DEVELOP状态
      this.stateManager.transitionState(
        state.skillId,
        PIPELINE_STATES.DEVELOP,
        `ISC校验失败: ${validationResult.score}分 - ${reasons}`,
        'isc_validator'
      );
      
      return this.stateManager.getOrCreateState(state.skillPath);
    }
  }

  /**
   * 处理REVIEW状态
   * @async
   * @param {Object} state - 技能状态
   * @param {Object} context - 执行上下文
   * @returns {Promise<Object>} 更新后的状态
   */
  async handleReviewState(state, context = {}) {
    console.log(`[PipelineEngine] ${state.skillId}: REVIEW 审核中`);
    
    // 触发beforeReview事件
    await this.emit('beforeReview', { skillId: state.skillId, state });
    
    // ISC通过且分数>=80自动进入RELEASE
    if (state.iscScore >= 80) {
      console.log(`[PipelineEngine] ${state.skillId}: 自动审批通过`);
      
      this.stateManager.transitionState(
        state.skillId,
        PIPELINE_STATES.RELEASE,
        '自动审批通过（ISC>=80）',
        'auto_review'
      );
      
      const newState = this.stateManager.getOrCreateState(state.skillPath);
      
      // 自动流转
      if (this.config.pipeline?.states?.RELEASE?.autoTransition !== false) {
        return await this.handleReleaseState(newState, context);
      }
      
      return newState;
    } else {
      console.log(`[PipelineEngine] ${state.skillId}: 等待人工审批 (ISC评分: ${state.iscScore})`);
      return state;
    }
  }

  /**
   * 处理RELEASE状态
   * @async
   * @param {Object} state - 技能状态
   * @param {Object} context - 执行上下文
   * @returns {Promise<Object>} 更新后的状态
   */
  async handleReleaseState(state, context = {}) {
    console.log(`[PipelineEngine] ${state.skillId}: 准备发布`);
    
    // 更新版本号
    const newVersion = this.incrementVersion(state.version);
    this.stateManager.updateState(state.skillId, {
      version: newVersion,
      targetVersion: newVersion,
      releasedAt: new Date().toISOString()
    });
    
    // 触发beforeRelease事件
    await this.emit('beforeRelease', { skillId: state.skillId, version: newVersion });
    
    // 流转到SYNC状态
    this.stateManager.transitionState(
      state.skillId,
      PIPELINE_STATES.SYNC,
      `版本更新: ${state.version} -> ${newVersion}`,
      'release_manager'
    );
    
    const newState = this.stateManager.getOrCreateState(state.skillPath);
    
    // 自动流转
    if (this.config.pipeline?.states?.SYNC?.autoTransition !== false) {
      return await this.handleSyncState(newState, context);
    }
    
    return newState;
  }

  /**
   * 处理SYNC状态
   * @async
   * @param {Object} state - 技能状态
   * @param {Object} context - 执行上下文
   * @returns {Promise<Object>} 更新后的状态
   */
  async handleSyncState(state, context = {}) {
    console.log(`[PipelineEngine] ${state.skillId}: 同步到EvoMap`);
    
    if (!this.evomapUploader) {
      console.warn(`[PipelineEngine] EvoMap上传器未初始化，跳过同步`);
      this.stateManager.transitionState(
        state.skillId,
        PIPELINE_STATES.ONLINE,
        'EvoMap上传器未初始化，跳过同步',
        'pipeline_engine'
      );
      return this.stateManager.getOrCreateState(state.skillPath);
    }
    
    // 更新同步状态
    this.stateManager.updateState(state.skillId, {
      syncStatus: 'syncing',
      syncStartedAt: new Date().toISOString()
    });
    
    // 触发beforeSync事件
    await this.emit('beforeSync', { skillId: state.skillId, state });
    
    // 上传到EvoMap
    const uploadResult = await this.evomapUploader.upload(state);
    
    // 触发afterSync事件
    await this.emit('afterSync', { skillId: state.skillId, result: uploadResult });
    
    if (uploadResult.success) {
      console.log(`[PipelineEngine] ${state.skillId}: EvoMap同步成功`);
      
      this.stateManager.updateState(state.skillId, {
        evomapGeneId: uploadResult.geneId,
        syncStatus: 'synced',
        lastSyncAt: new Date().toISOString(),
        syncError: null
      });
      
      this.stateManager.transitionState(
        state.skillId,
        PIPELINE_STATES.ONLINE,
        `EvoMap同步成功: ${uploadResult.geneId}`,
        'evomap_uploader'
      );
    } else if (uploadResult.skipped) {
      console.log(`[PipelineEngine] ${state.skillId}: EvoMap同步跳过`);
      
      this.stateManager.transitionState(
        state.skillId,
        PIPELINE_STATES.ONLINE,
        `EvoMap同步跳过: ${uploadResult.reason}`,
        'evomap_uploader'
      );
    } else {
      console.error(`[PipelineEngine] ${state.skillId}: EvoMap同步失败`);
      
      this.stateManager.updateState(state.skillId, {
        syncStatus: 'failed',
        syncError: uploadResult.error
      });
      
      this.stateManager.transitionState(
        state.skillId,
        PIPELINE_STATES.FAILED,
        `EvoMap同步失败: ${uploadResult.error}`,
        'evomap_uploader'
      );
    }
    
    return this.stateManager.getOrCreateState(state.skillPath);
  }

  /**
   * 处理ONLINE状态
   * @async
   * @param {Object} state - 技能状态
   * @returns {Promise<Object>} 状态
   */
  async handleOnlineState(state) {
    console.log(`[PipelineEngine] ${state.skillId}: 技能已上线`);
    await this.emit('online', { skillId: state.skillId, state });
    return state;
  }

  /**
   * 处理FAILED状态
   * @async
   * @param {Object} state - 技能状态
   * @param {Object} context - 执行上下文
   * @returns {Promise<Object>} 更新后的状态
   */
  async handleFailedState(state, context = {}) {
    console.log(`[PipelineEngine] ${state.skillId}: 处理失败状态`);
    
    // 触发onFailed事件
    await this.emit('onFailed', { skillId: state.skillId, state });
    
    // 自动重试逻辑
    const retryCount = state.retryCount || 0;
    const maxRetries = this.config.pipeline?.maxRetries || 3;
    
    if (retryCount < maxRetries && state.syncError) {
      console.log(`[PipelineEngine] ${state.skillId}: 尝试重试同步 (${retryCount + 1}/${maxRetries})`);
      
      this.stateManager.updateState(state.skillId, {
        retryCount: retryCount + 1
      });
      
      this.stateManager.transitionState(
        state.skillId,
        PIPELINE_STATES.SYNC,
        `自动重试同步 (${retryCount + 1}/${maxRetries})`,
        'retry_mechanism'
      );
      
      return await this.handleSyncState(this.stateManager.getOrCreateState(state.skillPath), context);
    }
    
    return state;
  }

  /**
   * 版本号递增
   * @param {string} version - 当前版本
   * @returns {string} 新版本
   */
  incrementVersion(version) {
    const parts = version.split('.').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) {
      return '0.0.1';
    }
    
    parts[2]++;
    
    if (parts[2] > 99) {
      parts[2] = 0;
      parts[1]++;
    }
    
    if (parts[1] > 99) {
      parts[1] = 0;
      parts[0]++;
    }
    
    return parts.join('.');
  }

  /**
   * 运行完整流水线
   * @async
   * @param {string} [targetSkill=null] - 目标技能（可选，不传则处理所有待处理）
   * @returns {Promise<Object>} 统计信息
   */
  async run(targetSkill = null) {
    console.log('[PipelineEngine] 启动流水线...');
    
    await this.initialize();
    
    if (targetSkill) {
      const skillPath = path.join(SKILLS_DIR, targetSkill);
      if (fs.existsSync(skillPath)) {
        await this.processSkill(skillPath);
      } else {
        console.error(`[PipelineEngine] 技能不存在: ${skillPath}`);
      }
    } else {
      // 处理所有非ONLINE状态技能
      const states = this.stateManager.getAllStates();
      
      for (const state of states) {
        if (state.currentState !== PIPELINE_STATES.ONLINE) {
          await this.processSkill(state.skillPath);
        }
      }
    }
    
    console.log('[PipelineEngine] 流水线执行完成');
    return this.getStats();
  }

  /**
   * 注册事件处理器
   * @param {string} event - 事件名称
   * @param {Function} handler - 处理器函数
   */
  on(event, handler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event).push(handler);
  }

  /**
   * 触发事件
   * @async
   * @param {string} event - 事件名称
   * @param {Object} data - 事件数据
   */
  async emit(event, data) {
    const handlers = this.eventHandlers.get(event) || [];
    for (const handler of handlers) {
      try {
        await handler(data);
      } catch (e) {
        console.error(`[PipelineEngine] 事件处理器错误: ${event}`, e.message);
      }
    }
  }

  /**
   * 获取统计信息
   * @returns {Object} 统计
   */
  getStats() {
    const stateStats = this.stateManager.getStateStatistics();
    
    return {
      ...this.stats,
      stateDistribution: stateStats,
      uptime: Date.now() - new Date(this.stats.startTime).getTime()
    };
  }

  /**
   * 关闭引擎
   * @async
   */
  async shutdown() {
    console.log('[PipelineEngine] 关闭引擎...');
    if (this.evomapUploader) {
      this.evomapUploader.disconnect();
    }
    this.initialized = false;
    console.log('[PipelineEngine] 引擎已关闭');
  }
}

/**
 * 创建流水线引擎的工厂函数
 * @param {Object} config - 配置选项
 * @returns {PipelineEngine} 流水线引擎实例
 */
export function createPipelineEngine(config = {}) {
  return new PipelineEngine(config);
}

export { PipelineEngine, PIPELINE_STATES };
export default PipelineEngine;
