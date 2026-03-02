/**
 * @fileoverview 状态机引擎 - EvoMap进化流水线核心组件
 * @description 管理技能生命周期状态流转，支持状态持久化和转换校验
 * @module state-machine
 * @version 1.0.0
 */

'use strict';

import { promises as fs } from 'fs';
import path from 'path';
import { EventEmitter } from 'events';

/**
 * 技能生命周期状态枚举
 * @readonly
 * @enum {string}
 */
export const PipelineState = {
  // 初始状态
  IDLE: 'idle',
  
  // 分析阶段
  ANALYZING: 'analyzing',
  
  // 编码阶段
  CODING: 'coding',
  
  // 测试阶段
  TESTING: 'testing',
  
  // 打包阶段
  PACKAGING: 'packaging',
  
  // 发布阶段
  PUBLISHING: 'publishing',
  
  // 完成状态
  COMPLETED: 'completed',
  
  // 失败状态
  FAILED: 'failed',
  
  // 取消状态
  CANCELLED: 'cancelled'
};

/**
 * 状态转换规则定义
 * @constant {Object.<string, string[]>}
 */
export const STATE_TRANSITIONS = {
  [PipelineState.IDLE]: [PipelineState.ANALYZING],
  [PipelineState.ANALYZING]: [PipelineState.CODING, PipelineState.FAILED, PipelineState.CANCELLED],
  [PipelineState.CODING]: [PipelineState.TESTING, PipelineState.FAILED, PipelineState.CANCELLED],
  [PipelineState.TESTING]: [PipelineState.PACKAGING, PipelineState.FAILED, PipelineState.CANCELLED],
  [PipelineState.PACKAGING]: [PipelineState.PUBLISHING, PipelineState.FAILED, PipelineState.CANCELLED],
  [PipelineState.PUBLISHING]: [PipelineState.COMPLETED, PipelineState.FAILED, PipelineState.CANCELLED],
  [PipelineState.COMPLETED]: [PipelineState.IDLE], // 可以重新开始
  [PipelineState.FAILED]: [PipelineState.IDLE, PipelineState.ANALYZING], // 重试
  [PipelineState.CANCELLED]: [PipelineState.IDLE] // 重置
};

/**
 * 状态元数据配置
 * @constant {Object.<string, Object>}
 */
export const STATE_METADATA = {
  [PipelineState.IDLE]: {
    description: '等待触发',
    isTerminal: false,
    timeoutMs: null,
    allowRetry: false
  },
  [PipelineState.ANALYZING]: {
    description: '分析技能变更',
    isTerminal: false,
    timeoutMs: 5 * 60 * 1000, // 5分钟
    allowRetry: true
  },
  [PipelineState.CODING]: {
    description: '执行代码生成/重构',
    isTerminal: false,
    timeoutMs: 30 * 60 * 1000, // 30分钟
    allowRetry: true
  },
  [PipelineState.TESTING]: {
    description: '运行测试验证',
    isTerminal: false,
    timeoutMs: 20 * 60 * 1000, // 20分钟
    allowRetry: true
  },
  [PipelineState.PACKAGING]: {
    description: '打包技能产物',
    isTerminal: false,
    timeoutMs: 10 * 60 * 1000, // 10分钟
    allowRetry: true
  },
  [PipelineState.PUBLISHING]: {
    description: '发布到EvoMap',
    isTerminal: false,
    timeoutMs: 15 * 60 * 1000, // 15分钟
    allowRetry: true
  },
  [PipelineState.COMPLETED]: {
    description: '流水线完成',
    isTerminal: true,
    timeoutMs: null,
    allowRetry: false
  },
  [PipelineState.FAILED]: {
    description: '流水线失败',
    isTerminal: true,
    timeoutMs: null,
    allowRetry: true
  },
  [PipelineState.CANCELLED]: {
    description: '流水线取消',
    isTerminal: true,
    timeoutMs: null,
    allowRetry: false
  }
};

/**
 * 状态机引擎类
 * @class StateMachine
 * @extends EventEmitter
 */
export class StateMachine extends EventEmitter {
  /**
   * 创建状态机实例
   * @param {Object} options - 配置选项
   * @param {string} options.skillId - 技能唯一标识
   * @param {string} options.stateDir - 状态文件存储目录
   * @param {Object} [options.logger=console] - 日志记录器
   */
  constructor(options = {}) {
    super();
    
    this.skillId = options.skillId || 'unknown';
    this.stateDir = options.stateDir || './.pipeline/state';
    this.logger = options.logger || console;
    
    // 当前状态
    this._currentState = PipelineState.IDLE;
    
    // 状态历史
    this._stateHistory = [];
    
    // 状态开始时间
    this._stateStartTime = null;
    
    // 是否已初始化
    this._initialized = false;
    
    // 状态上下文数据
    this._context = {};
  }

  /**
   * 初始化状态机
   * @async
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this._initialized) {
      return;
    }

    try {
      // 确保状态目录存在
      await fs.mkdir(this.stateDir, { recursive: true });
      
      // 尝试恢复之前的状态
      await this._loadState();
      
      this._initialized = true;
      this.emit('initialized', { skillId: this.skillId, state: this._currentState });
      this.logger.info(`[StateMachine] 状态机初始化完成: ${this.skillId}, 当前状态: ${this._currentState}`);
    } catch (error) {
      this.logger.error(`[StateMachine] 状态机初始化失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取当前状态
   * @returns {string} 当前状态
   */
  getCurrentState() {
    return this._currentState;
  }

  /**
   * 获取状态元数据
   * @param {string} [state] - 状态名称，不传则返回当前状态
   * @returns {Object} 状态元数据
   */
  getStateMetadata(state) {
    const targetState = state || this._currentState;
    return STATE_METADATA[targetState] || null;
  }

  /**
   * 检查是否可以转换到目标状态
   * @param {string} targetState - 目标状态
   * @returns {boolean} 是否可以转换
   */
  canTransitionTo(targetState) {
    const allowedTransitions = STATE_TRANSITIONS[this._currentState] || [];
    return allowedTransitions.includes(targetState);
  }

  /**
   * 获取允许的下一个状态列表
   * @returns {string[]} 允许的状态列表
   */
  getAllowedTransitions() {
    return STATE_TRANSITIONS[this._currentState] || [];
  }

  /**
   * 执行状态转换
   * @async
   * @param {string} targetState - 目标状态
   * @param {Object} [context={}] - 状态上下文数据
   * @param {string} [reason=''] - 转换原因
   * @returns {Promise<boolean>} 转换是否成功
   * @throws {Error} 非法状态转换时抛出
   */
  async transitionTo(targetState, context = {}, reason = '') {
    // 验证目标状态有效性
    if (!Object.values(PipelineState).includes(targetState)) {
      throw new Error(`无效的目标状态: ${targetState}`);
    }

    // 验证状态转换合法性
    if (!this.canTransitionTo(targetState)) {
      throw new Error(
        `非法状态转换: ${this._currentState} -> ${targetState}. ` +
        `允许的转换: ${this.getAllowedTransitions().join(', ')}`
      );
    }

    const previousState = this._currentState;
    const timestamp = new Date().toISOString();

    // 更新上下文
    this._context = { ...this._context, ...context };

    // 记录状态历史
    const historyEntry = {
      from: previousState,
      to: targetState,
      timestamp,
      reason,
      context: { ...this._context }
    };
    this._stateHistory.push(historyEntry);

    // 限制历史记录长度
    if (this._stateHistory.length > 100) {
      this._stateHistory = this._stateHistory.slice(-100);
    }

    // 执行状态转换
    this._currentState = targetState;
    this._stateStartTime = Date.now();

    // 持久化状态
    await this._saveState();

    // 触发事件
    this.emit('stateChanged', {
      skillId: this.skillId,
      previousState,
      currentState: targetState,
      timestamp,
      reason,
      context: this._context
    });

    this.logger.info(
      `[StateMachine] 状态转换: ${previousState} -> ${targetState}` +
      (reason ? ` (${reason})` : '')
    );

    // 如果进入终止状态，触发完成事件
    const metadata = STATE_METADATA[targetState];
    if (metadata && metadata.isTerminal) {
      this.emit('terminalState', {
        skillId: this.skillId,
        state: targetState,
        success: targetState === PipelineState.COMPLETED
      });
    }

    return true;
  }

  /**
   * 重置状态机到初始状态
   * @async
   * @param {string} [reason=''] - 重置原因
   * @returns {Promise<boolean>}
   */
  async reset(reason = '') {
    const previousState = this._currentState;
    
    this._currentState = PipelineState.IDLE;
    this._stateHistory = [];
    this._stateStartTime = null;
    this._context = {};

    await this._saveState();

    this.emit('reset', {
      skillId: this.skillId,
      previousState,
      reason
    });

    this.logger.info(`[StateMachine] 状态机重置: ${this.skillId}${reason ? ` (${reason})` : ''}`);
    return true;
  }

  /**
   * 获取当前状态持续时间（毫秒）
   * @returns {number|null} 持续时间或null
   */
  getStateDuration() {
    if (!this._stateStartTime) {
      return null;
    }
    return Date.now() - this._stateStartTime;
  }

  /**
   * 检查当前状态是否超时
   * @returns {boolean} 是否超时
   */
  isStateTimeout() {
    const metadata = this.getStateMetadata();
    if (!metadata || !metadata.timeoutMs) {
      return false;
    }
    const duration = this.getStateDuration();
    return duration !== null && duration > metadata.timeoutMs;
  }

  /**
   * 获取状态历史
   * @param {number} [limit=50] - 返回的最大记录数
   * @returns {Object[]} 状态历史记录
   */
  getStateHistory(limit = 50) {
    return this._stateHistory.slice(-limit);
  }

  /**
   * 获取完整状态快照
   * @returns {Object} 状态快照
   */
  getSnapshot() {
    return {
      skillId: this.skillId,
      currentState: this._currentState,
      stateStartTime: this._stateStartTime,
      stateDuration: this.getStateDuration(),
      isTimeout: this.isStateTimeout(),
      metadata: this.getStateMetadata(),
      context: { ...this._context },
      historyLength: this._stateHistory.length,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 从文件加载状态
   * @async
   * @private
   */
  async _loadState() {
    const stateFile = path.join(this.stateDir, `${this.skillId}.json`);
    
    try {
      const data = await fs.readFile(stateFile, 'utf-8');
      const saved = JSON.parse(data);
      
      if (saved.currentState && Object.values(PipelineState).includes(saved.currentState)) {
        this._currentState = saved.currentState;
      }
      if (saved.history && Array.isArray(saved.history)) {
        this._stateHistory = saved.history;
      }
      if (saved.context && typeof saved.context === 'object') {
        this._context = saved.context;
      }
      if (saved.stateStartTime) {
        this._stateStartTime = saved.stateStartTime;
      }
      
      this.logger.info(`[StateMachine] 状态恢复: ${this.skillId} -> ${this._currentState}`);
    } catch (error) {
      // 文件不存在或解析错误，使用默认状态
      this.logger.debug?.(`[StateMachine] 无历史状态，使用默认: ${this.skillId}`);
    }
  }

  /**
   * 保存状态到文件
   * @async
   * @private
   */
  async _saveState() {
    const stateFile = path.join(this.stateDir, `${this.skillId}.json`);
    
    const data = {
      skillId: this.skillId,
      currentState: this._currentState,
      stateStartTime: this._stateStartTime,
      history: this._stateHistory,
      context: this._context,
      savedAt: new Date().toISOString()
    };

    try {
      await fs.writeFile(stateFile, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      this.logger.error(`[StateMachine] 状态保存失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 销毁状态机实例
   * @async
   */
  async destroy() {
    this.removeAllListeners();
    this._initialized = false;
    this.logger.info(`[StateMachine] 状态机销毁: ${this.skillId}`);
  }
}

export default StateMachine;
