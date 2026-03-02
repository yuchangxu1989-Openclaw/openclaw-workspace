/**
 * 流水线引擎 (Pipeline Engine)
 * 
 * 功能：执行技能生命周期状态流转，调度ISC校验和EvoMap上传
 * 实现：状态机驱动 + 任务队列 + 错误处理
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { StateManager, PIPELINE_STATES } from './state-manager.js';
import { ISCValidator } from './validators/isc-validator.js';
import { EvoMapUploader } from './uploaders/evomap-uploader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class PipelineEngine {
  constructor(config = {}) {
    this.config = this.loadConfig(config);
    
    // 初始化子模块
    this.stateManager = new StateManager({
      statePath: this.config.storage?.statePath
    });
    
    this.iscValidator = new ISCValidator({
      minScore: this.config.isc?.minScore || 70
    });
    
    this.evomapUploader = new EvoMapUploader({
      hubUrl: this.config.evomap?.hubUrl,
      autoSync: this.config.evomap?.autoSync,
      maxRetries: this.config.evomap?.maxRetries,
      offlineMode: this.config.evomap?.offlineMode
    });
    
    // 任务队列
    this.taskQueue = [];
    this.isProcessing = false;
    
    // 统计
    this.stats = {
      jobsProcessed: 0,
      jobsFailed: 0,
      startTime: new Date().toISOString()
    };
  }

  /**
   * 加载配置
   * @param {Object} overrideConfig - 覆盖配置
   * @returns {Object} 合并后的配置
   */
  loadConfig(overrideConfig = {}) {
    const defaultConfigPath = path.join(__dirname, '../config/pipeline.config.json');
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
   */
  async initialize() {
    console.log('[PipelineEngine] 初始化引擎...');
    
    // 初始化EvoMap上传器
    await this.evomapUploader.initialize();
    
    console.log('[PipelineEngine] 引擎初始化完成');
  }

  /**
   * 处理技能状态变更
   * @param {string} skillPath - 技能路径
   */
  async processSkill(skillPath) {
    const skillId = path.basename(skillPath);
    console.log(`[PipelineEngine] 处理技能: ${skillId}`);
    
    try {
      // 获取或创建技能状态
      let state = this.stateManager.getOrCreateState(skillPath);
      
      // 根据当前状态执行相应处理
      switch (state.currentState) {
        case PIPELINE_STATES.DEVELOP:
          await this.handleDevelopState(state);
          break;
        case PIPELINE_STATES.TEST:
          await this.handleTestState(state);
          break;
        case PIPELINE_STATES.REVIEW:
          await this.handleReviewState(state);
          break;
        case PIPELINE_STATES.RELEASE:
          await this.handleReleaseState(state);
          break;
        case PIPELINE_STATES.SYNC:
          await this.handleSyncState(state);
          break;
        case PIPELINE_STATES.ONLINE:
          await this.handleOnlineState(state);
          break;
        case PIPELINE_STATES.FAILED:
          await this.handleFailedState(state);
          break;
        default:
          console.warn(`[PipelineEngine] 未知状态: ${state.currentState}`);
      }
      
      this.stats.jobsProcessed++;
      
    } catch (e) {
      console.error(`[PipelineEngine] 处理技能失败: ${skillId}`, e.message);
      this.stats.jobsFailed++;
      
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
    }
  }

  /**
   * 处理DEVELOP状态
   * 触发条件：文件变更检测
   * 自动流转：是 -> TEST
   */
  async handleDevelopState(state) {
    console.log(`[PipelineEngine] ${state.skillId}: DEVELOP -> TEST`);
    
    // 自动流转到TEST状态
    this.stateManager.transitionState(
      state.skillId,
      PIPELINE_STATES.TEST,
      '文件变更触发测试',
      'file_watcher'
    );
    
    // 继续处理TEST状态
    await this.handleTestState(this.stateManager.getOrCreateState(state.skillPath));
  }

  /**
   * 处理TEST状态
   * 执行：ISC质量校验
   * 通过：REVIEW | 失败：DEVELOP
   */
  async handleTestState(state) {
    console.log(`[PipelineEngine] ${state.skillId}: 执行ISC校验`);
    
    // 执行ISC校验
    const validationResult = await this.iscValidator.validate(state.skillPath);
    
    // 更新ISC分数到状态
    this.stateManager.updateState(state.skillId, {
      iscScore: validationResult.score,
      iscReport: validationResult.rawReport
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
    } else {
      console.log(`[PipelineEngine] ${state.skillId}: ISC校验失败 (${validationResult.score}分)`);
      
      // 记录失败原因
      const reasons = validationResult.recommendations?.join('; ') || '质量评分未达标';
      
      // 流转回DEVELOP状态
      this.stateManager.transitionState(
        state.skillId,
        PIPELINE_STATES.DEVELOP,
        `ISC校验失败: ${validationResult.score}分 - ${reasons}`,
        'isc_validator'
      );
    }
  }

  /**
   * 处理REVIEW状态
   * 当前：等待人工审批（简化版自动通过）
   * 未来：可接入人工审批系统
   */
  async handleReviewState(state) {
    console.log(`[PipelineEngine] ${state.skillId}: REVIEW 等待审批`);
    
    // 简化版：ISC通过且分数>=80自动进入RELEASE
    // 完整版应接入人工审批系统
    if (state.iscScore >= 80) {
      console.log(`[PipelineEngine] ${state.skillId}: 自动审批通过`);
      
      this.stateManager.transitionState(
        state.skillId,
        PIPELINE_STATES.RELEASE,
        '自动审批通过',
        'auto_review'
      );
      
      // 继续处理RELEASE状态
      await this.handleReleaseState(this.stateManager.getOrCreateState(state.skillPath));
    } else {
      console.log(`[PipelineEngine] ${state.skillId}: 等待人工审批 (ISC评分: ${state.iscScore})`);
    }
  }

  /**
   * 处理RELEASE状态
   * 执行：版本标记，准备发布
   */
  async handleReleaseState(state) {
    console.log(`[PipelineEngine] ${state.skillId}: 准备发布`);
    
    // 更新版本号
    const newVersion = this.incrementVersion(state.version);
    this.stateManager.updateState(state.skillId, {
      version: newVersion,
      targetVersion: newVersion
    });
    
    // 流转到SYNC状态
    this.stateManager.transitionState(
      state.skillId,
      PIPELINE_STATES.SYNC,
      `版本更新: ${state.version} -> ${newVersion}`,
      'release_manager'
    );
    
    // 继续处理SYNC状态
    await this.handleSyncState(this.stateManager.getOrCreateState(state.skillPath));
  }

  /**
   * 处理SYNC状态
   * 执行：上传到EvoMap
   * 成功：ONLINE | 失败：FAILED
   */
  async handleSyncState(state) {
    console.log(`[PipelineEngine] ${state.skillId}: 同步到EvoMap`);
    
    // 更新同步状态
    this.stateManager.updateState(state.skillId, {
      syncStatus: 'syncing'
    });
    
    // 上传到EvoMap
    const uploadResult = await this.evomapUploader.upload(state);
    
    if (uploadResult.success) {
      console.log(`[PipelineEngine] ${state.skillId}: EvoMap同步成功`);
      
      // 更新同步信息
      this.stateManager.updateState(state.skillId, {
        evomapGeneId: uploadResult.geneId,
        syncStatus: 'synced',
        lastSyncAt: new Date().toISOString()
      });
      
      // 流转到ONLINE状态
      this.stateManager.transitionState(
        state.skillId,
        PIPELINE_STATES.ONLINE,
        `EvoMap同步成功: ${uploadResult.geneId}`,
        'evomap_uploader'
      );
    } else if (uploadResult.skipped) {
      console.log(`[PipelineEngine] ${state.skillId}: EvoMap同步跳过`);
      
      // 流转到ONLINE状态（跳过也视为成功）
      this.stateManager.transitionState(
        state.skillId,
        PIPELINE_STATES.ONLINE,
        `EvoMap同步跳过: ${uploadResult.reason}`,
        'evomap_uploader'
      );
    } else {
      console.error(`[PipelineEngine] ${state.skillId}: EvoMap同步失败`);
      
      // 更新同步错误
      this.stateManager.updateState(state.skillId, {
        syncStatus: 'failed',
        syncError: uploadResult.error
      });
      
      // 流转到FAILED状态
      this.stateManager.transitionState(
        state.skillId,
        PIPELINE_STATES.FAILED,
        `EvoMap同步失败: ${uploadResult.error}`,
        'evomap_uploader'
      );
    }
  }

  /**
   * 处理ONLINE状态
   * 技能已上线，等待下一次变更
   */
  async handleOnlineState(state) {
    console.log(`[PipelineEngine] ${state.skillId}: 技能已上线`);
    // ONLINE状态不需要特殊处理，等待文件变更触发新版本
  }

  /**
   * 处理FAILED状态
   * 可选择重试或回滚
   */
  async handleFailedState(state) {
    console.log(`[PipelineEngine] ${state.skillId}: 处理失败状态`);
    
    // 如果有同步错误，可以尝试重试同步
    if (state.syncError && state.previousState === PIPELINE_STATES.SYNC) {
      console.log(`[PipelineEngine] ${state.skillId}: 尝试重试同步`);
      
      // 流转回SYNC状态
      this.stateManager.transitionState(
        state.skillId,
        PIPELINE_STATES.SYNC,
        '重试同步',
        'retry_mechanism'
      );
      
      // 再次尝试同步
      await this.handleSyncState(this.stateManager.getOrCreateState(state.skillPath));
    }
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
    
    parts[2]++; // 递增patch版本
    
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
   * @param {string} targetSkill - 目标技能（可选，不传则处理所有）
   */
  async run(targetSkill = null) {
    console.log('[PipelineEngine] 启动流水线...');
    
    if (targetSkill) {
      // 处理指定技能
      const skillPath = path.join('/root/.openclaw/workspace/skills', targetSkill);
      if (fs.existsSync(skillPath)) {
        await this.processSkill(skillPath);
      } else {
        console.error(`[PipelineEngine] 技能不存在: ${skillPath}`);
      }
    } else {
      // 处理所有待处理技能
      const states = this.stateManager.getAllStates();
      
      for (const state of states) {
        // 只处理非ONLINE和需要流转的状态
        if (state.currentState !== PIPELINE_STATES.ONLINE) {
          await this.processSkill(state.skillPath);
        }
      }
    }
    
    console.log('[PipelineEngine] 流水线执行完成');
    return this.getStats();
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
   */
  async shutdown() {
    console.log('[PipelineEngine] 关闭引擎...');
    this.evomapUploader.disconnect();
    console.log('[PipelineEngine] 引擎已关闭');
  }
}

export { PipelineEngine };
export default PipelineEngine;
