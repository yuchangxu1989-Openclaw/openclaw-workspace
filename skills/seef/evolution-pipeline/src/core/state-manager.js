/**
 * @fileoverview 状态管理器 (State Manager) - EvoMap进化流水线核心
 * @description 管理技能生命周期状态的CRUD操作、状态流转、历史记录
 * @module StateManager
 * @version 1.0.0
 * @see ISC规则 N036 - 记忆丢失自恢复
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 流水线状态枚举
 * @readonly
 * @enum {string}
 */
export const PIPELINE_STATES = {
  /** 开发中 */
  DEVELOP: 'DEVELOP',
  /** 测试中 */
  TEST: 'TEST',
  /** 审核中 */
  REVIEW: 'REVIEW',
  /** 已发布 */
  RELEASE: 'RELEASE',
  /** 同步中 */
  SYNC: 'SYNC',
  /** 已上线 */
  ONLINE: 'ONLINE',
  /** 失败 */
  FAILED: 'FAILED'
};

/**
 * 状态流转规则
 * @constant {Object<string, string[]>}
 */
export const STATE_TRANSITIONS = {
  [PIPELINE_STATES.DEVELOP]: [PIPELINE_STATES.TEST],
  [PIPELINE_STATES.TEST]: [PIPELINE_STATES.REVIEW, PIPELINE_STATES.DEVELOP],
  [PIPELINE_STATES.REVIEW]: [PIPELINE_STATES.RELEASE, PIPELINE_STATES.DEVELOP],
  [PIPELINE_STATES.RELEASE]: [PIPELINE_STATES.SYNC],
  [PIPELINE_STATES.SYNC]: [PIPELINE_STATES.ONLINE, PIPELINE_STATES.FAILED],
  [PIPELINE_STATES.ONLINE]: [PIPELINE_STATES.DEVELOP],
  [PIPELINE_STATES.FAILED]: [PIPELINE_STATES.SYNC, PIPELINE_STATES.DEVELOP]
};

/**
 * 状态超时配置（分钟）
 * @constant {Object<string, number|null>}
 */
export const STATE_TIMEOUTS = {
  [PIPELINE_STATES.DEVELOP]: null,
  [PIPELINE_STATES.TEST]: 30,
  [PIPELINE_STATES.REVIEW]: 1440, // 24小时
  [PIPELINE_STATES.RELEASE]: 10,
  [PIPELINE_STATES.SYNC]: 30,
  [PIPELINE_STATES.ONLINE]: null,
  [PIPELINE_STATES.FAILED]: null
};

/**
 * 状态管理器类
 * @class StateManager
 * @description 管理技能生命周期状态，支持文件持久化和重启自恢复
 */
class StateManager {
  /**
   * @constructor
   * @param {Object} config - 配置选项
   * @param {string} [config.statePath] - 状态文件存储目录
   * @param {string} [config.skillsBasePath] - 技能基础路径
   * @param {Object} [config.logger] - 日志记录器
   */
  constructor(config = {}) {
    this.config = {
      statePath: config.statePath || path.join(__dirname, '../../.pipeline/state'),
      skillsBasePath: config.skillsBasePath || '/root/.openclaw/workspace/skills',
      ...config
    };
    
    this.logger = config.logger || console;
    this._cache = new Map();
    
    // 确保状态目录存在
    this.ensureStateDirectory();
  }

  /**
   * 确保状态目录存在
   * @returns {void}
   */
  ensureStateDirectory() {
    if (!fs.existsSync(this.config.statePath)) {
      fs.mkdirSync(this.config.statePath, { recursive: true });
      this.logger.info(`[StateManager] 创建状态目录: ${this.config.statePath}`);
    }
  }

  /**
   * 获取技能状态文件路径
   * @param {string} skillId - 技能ID
   * @returns {string} 状态文件路径
   */
  getStateFilePath(skillId) {
    return path.join(this.config.statePath, `${skillId}.json`);
  }

  /**
   * 检查状态文件是否存在
   * @param {string} skillId - 技能ID
   * @returns {boolean} 是否存在
   */
  stateExists(skillId) {
    return fs.existsSync(this.getStateFilePath(skillId));
  }

  /**
   * 从文件系统重建技能状态
   * 遵循ISC规则N036：不依赖MEMORY.md，从文件系统重建
   * @param {string} skillPath - 技能路径
   * @returns {Object} 技能状态
   */
  rebuildStateFromFilesystem(skillPath) {
    const skillId = path.basename(skillPath);
    const skillMdPath = path.join(skillPath, 'SKILL.md');
    
    let skillName = skillId;
    let version = '0.0.1';
    let description = '';
    let tags = [];
    let layer = 'application';
    
    // 从SKILL.md解析元数据
    if (fs.existsSync(skillMdPath)) {
      try {
        const content = fs.readFileSync(skillMdPath, 'utf-8');
        const metadata = this.parseSkillMetadata(content);
        skillName = metadata.name || skillId;
        version = metadata.version || '0.0.1';
        description = metadata.description || '';
        tags = metadata.tags ? metadata.tags.split(',').map(t => t.trim()) : [];
        layer = metadata.layer || 'application';
      } catch (e) {
        this.logger.warn(`[StateManager] 解析SKILL.md失败: ${skillId}`, e.message);
      }
    }
    
    // 获取文件统计信息
    let stats;
    try {
      stats = fs.statSync(skillPath);
    } catch (e) {
      stats = { birthtime: new Date() };
    }
    
    const now = new Date().toISOString();
    
    return {
      skillId,
      skillName,
      skillPath,
      description,
      currentState: PIPELINE_STATES.DEVELOP,
      previousState: null,
      stateHistory: [],
      version,
      targetVersion: version,
      tags,
      layer,
      createdAt: stats.birthtime.toISOString ? stats.birthtime.toISOString() : now,
      updatedAt: now,
      lastSyncAt: null,
      iscScore: null,
      iscReport: null,
      evomapGeneId: null,
      syncStatus: 'pending',
      syncError: null,
      retryCount: 0,
      metadata: {}
    };
  }

  /**
   * 解析SKILL.md元数据（YAML frontmatter）
   * @param {string} content - SKILL.md内容
   * @returns {Object} 元数据
   */
  parseSkillMetadata(content) {
    const metadata = {};
    const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
    
    if (match) {
      const yamlContent = match[1];
      const lines = yamlContent.split('\n');
      
      for (const line of lines) {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
          const key = line.substring(0, colonIndex).trim();
          const value = line.substring(colonIndex + 1).trim();
          // 移除引号
          metadata[key] = value.replace(/^["']|["']$/g, '');
        }
      }
    }
    
    return metadata;
  }

  /**
   * 获取或创建技能状态
   * @param {string} skillPath - 技能路径
   * @returns {Object} 技能状态
   */
  getOrCreateState(skillPath) {
    const skillId = path.basename(skillPath);
    
    // 先检查缓存
    if (this._cache.has(skillId)) {
      return this._cache.get(skillId);
    }
    
    const stateFilePath = this.getStateFilePath(skillId);
    
    // 如果状态文件存在，读取并返回
    if (fs.existsSync(stateFilePath)) {
      try {
        const content = fs.readFileSync(stateFilePath, 'utf-8');
        const state = JSON.parse(content);
        
        // 更新skillPath（可能移动过）
        state.skillPath = skillPath;
        
        // 缓存
        this._cache.set(skillId, state);
        return state;
      } catch (e) {
        this.logger.error(`[StateManager] 读取状态文件失败: ${stateFilePath}`, e.message);
        // 重建状态
        const state = this.rebuildStateFromFilesystem(skillPath);
        this.saveState(state);
        return state;
      }
    }
    
    // 创建新状态
    const state = this.rebuildStateFromFilesystem(skillPath);
    this.saveState(state);
    this.logger.info(`[StateManager] 创建新状态: ${skillId}`);
    return state;
  }

  /**
   * 从缓存或文件获取状态（不创建）
   * @param {string} skillId - 技能ID
   * @returns {Object|null} 技能状态或null
   */
  getState(skillId) {
    // 先检查缓存
    if (this._cache.has(skillId)) {
      return this._cache.get(skillId);
    }
    
    const stateFilePath = this.getStateFilePath(skillId);
    
    if (fs.existsSync(stateFilePath)) {
      try {
        const content = fs.readFileSync(stateFilePath, 'utf-8');
        const state = JSON.parse(content);
        this._cache.set(skillId, state);
        return state;
      } catch (e) {
        this.logger.error(`[StateManager] 解析状态文件失败: ${stateFilePath}`, e.message);
        return null;
      }
    }
    
    return null;
  }

  /**
   * 保存技能状态
   * @param {Object} state - 技能状态
   * @returns {void}
   */
  saveState(state) {
    const stateFilePath = this.getStateFilePath(state.skillId);
    state.updatedAt = new Date().toISOString();
    
    try {
      fs.writeFileSync(stateFilePath, JSON.stringify(state, null, 2), 'utf-8');
      this._cache.set(state.skillId, state);
    } catch (e) {
      this.logger.error(`[StateManager] 保存状态失败: ${stateFilePath}`, e.message);
      throw e;
    }
  }

  /**
   * 更新技能状态
   * @param {string} skillId - 技能ID
   * @param {Object} updates - 更新内容
   * @returns {Object} 更新后的状态
   * @throws {Error} 状态不存在时抛出
   */
  updateState(skillId, updates) {
    const state = this.getState(skillId);
    
    if (!state) {
      throw new Error(`状态不存在: ${skillId}`);
    }
    
    // 应用更新
    Object.assign(state, updates);
    state.updatedAt = new Date().toISOString();
    
    this.saveState(state);
    return state;
  }

  /**
   * 执行状态流转
   * @param {string} skillId - 技能ID
   * @param {string} targetState - 目标状态
   * @param {string} [reason=''] - 流转原因
   * @param {string} [triggeredBy='system'] - 触发者
   * @returns {Object} 更新后的状态
   * @throws {Error} 非法状态流转时抛出
   */
  transitionState(skillId, targetState, reason = '', triggeredBy = 'system') {
    const state = this.getState(skillId);
    
    if (!state) {
      throw new Error(`状态不存在: ${skillId}`);
    }
    
    const currentState = state.currentState;
    
    // 检查流转是否合法
    const allowedTransitions = STATE_TRANSITIONS[currentState] || [];
    if (!allowedTransitions.includes(targetState)) {
      throw new Error(
        `非法状态流转: ${currentState} -> ${targetState}. ` +
        `允许的流转: ${allowedTransitions.join(', ')}`
      );
    }
    
    // 记录历史
    const transition = {
      from: currentState,
      to: targetState,
      timestamp: new Date().toISOString(),
      reason,
      triggeredBy
    };
    
    state.previousState = currentState;
    state.currentState = targetState;
    state.stateHistory.push(transition);
    
    // 限制历史记录长度（保留最近100条）
    if (state.stateHistory.length > 100) {
      state.stateHistory = state.stateHistory.slice(-100);
    }
    
    this.saveState(state);
    
    this.logger.info(`[StateManager] 状态流转: ${skillId} ${currentState} -> ${targetState}`);
    
    return state;
  }

  /**
   * 获取技能路径
   * @param {string} skillId - 技能ID
   * @returns {string} 技能路径
   */
  getSkillPath(skillId) {
    return path.join(this.config.skillsBasePath, skillId);
  }

  /**
   * 获取所有技能状态
   * @returns {Array<Object>} 技能状态列表
   */
  getAllStates() {
    if (!fs.existsSync(this.config.statePath)) {
      return [];
    }
    
    const files = fs.readdirSync(this.config.statePath);
    const states = [];
    
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const skillId = path.basename(file, '.json');
          const state = this.getState(skillId);
          if (state) {
            states.push(state);
          }
        } catch (e) {
          this.logger.error(`[StateManager] 解析状态文件失败: ${file}`, e.message);
        }
      }
    }
    
    return states;
  }

  /**
   * 按状态筛选技能
   * @param {string} state - 目标状态
   * @returns {Array<Object>} 符合条件的技能状态列表
   */
  getStatesByStatus(state) {
    const allStates = this.getAllStates();
    return allStates.filter(s => s.currentState === state);
  }

  /**
   * 获取超时状态列表
   * @returns {Array<Object>} 超时的技能状态列表
   */
  getTimeoutStates() {
    const allStates = this.getAllStates();
    const now = Date.now();
    
    return allStates.filter(state => {
      const timeoutMinutes = STATE_TIMEOUTS[state.currentState];
      if (!timeoutMinutes) return false;
      
      const lastUpdate = new Date(state.updatedAt).getTime();
      const timeoutMs = timeoutMinutes * 60 * 1000;
      
      return (now - lastUpdate) > timeoutMs;
    });
  }

  /**
   * 删除技能状态
   * @param {string} skillId - 技能ID
   * @returns {void}
   */
  deleteState(skillId) {
    const stateFilePath = this.getStateFilePath(skillId);
    if (fs.existsSync(stateFilePath)) {
      fs.unlinkSync(stateFilePath);
      this._cache.delete(skillId);
      this.logger.info(`[StateManager] 删除状态: ${skillId}`);
    }
  }

  /**
   * 检查状态流转是否合法
   * @param {string} fromState - 当前状态
   * @param {string} toState - 目标状态
   * @returns {boolean} 是否合法
   */
  isValidTransition(fromState, toState) {
    const allowedTransitions = STATE_TRANSITIONS[fromState] || [];
    return allowedTransitions.includes(toState);
  }

  /**
   * 获取状态统计
   * @returns {Object} 状态统计
   */
  getStateStatistics() {
    const allStates = this.getAllStates();
    const stats = {};
    
    for (const state of Object.values(PIPELINE_STATES)) {
      stats[state] = allStates.filter(s => s.currentState === state).length;
    }
    
    return {
      total: allStates.length,
      byState: stats,
      timeoutCount: this.getTimeoutStates().length
    };
  }

  /**
   * 清空缓存
   * @returns {void}
   */
  clearCache() {
    this._cache.clear();
  }

  /**
   * 批量扫描并初始化状态
   * @param {string} [skillsPath] - 技能目录路径
   * @returns {Array<Object>} 初始化的状态列表
   */
  batchInitialize(skillsPath = null) {
    const basePath = skillsPath || this.config.skillsBasePath;
    
    if (!fs.existsSync(basePath)) {
      this.logger.warn(`[StateManager] 技能目录不存在: ${basePath}`);
      return [];
    }
    
    const entries = fs.readdirSync(basePath, { withFileTypes: true });
    const initialized = [];
    
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      
      const skillPath = path.join(basePath, entry.name);
      const skillMdPath = path.join(skillPath, 'SKILL.md');
      
      // 只处理包含SKILL.md的目录
      if (fs.existsSync(skillMdPath)) {
        const state = this.getOrCreateState(skillPath);
        initialized.push(state);
      }
    }
    
    this.logger.info(`[StateManager] 批量初始化完成: ${initialized.length} 个技能`);
    return initialized;
  }
}

/**
 * 创建状态管理器的工厂函数
 * @param {Object} config - 配置选项
 * @returns {StateManager} 状态管理器实例
 */
export function createStateManager(config = {}) {
  return new StateManager(config);
}

export { StateManager };
export default StateManager;
