/**
 * @fileoverview EvoMap进化流水线 - 模块统一导出
 * @description 导出所有核心模块，提供统一入口
 * @module index
 * @version 1.0.0
 */

'use strict';

// 状态机模块
const { StateMachine, PipelineState, STATE_TRANSITIONS, STATE_METADATA } = require('./state-machine');

// 触发器模块
const { TriggerManager, TriggerEvent, TriggerType } = require('./trigger');

// 执行器模块
const { PipelineExecutor, PhaseExecutor, ExecutionContext, ExecutionPhase, ExecutionMode } = require('./executor');

// 错误处理模块
const { ErrorHandler, PipelineError, ErrorClassifier, RetryStrategy, ErrorSeverity, ErrorCategory } = require('./error-handler');

/**
 * 进化流水线主类
 * @class EvolutionPipeline
 */
class EvolutionPipeline {
  constructor(options = {}) {
    this.options = options;
    this.stateMachine = null;
    this.triggerManager = null;
    this.executor = null;
    this.errorHandler = null;
    this.initialized = false;
  }

  async initialize() {
    // 初始化各模块
    this.errorHandler = new ErrorHandler(this.options.errorHandler);
    this.triggerManager = new TriggerManager(this.options.trigger);
    this.executor = new PipelineExecutor(this.options.executor);
    
    await this.triggerManager.initialize();
    
    this.initialized = true;
    return this;
  }
}

module.exports = {
  // 主类
  EvolutionPipeline,
  
  // 状态机
  StateMachine,
  PipelineState,
  STATE_TRANSITIONS,
  STATE_METADATA,
  
  // 触发器
  TriggerManager,
  TriggerEvent,
  TriggerType,
  
  // 执行器
  PipelineExecutor,
  PhaseExecutor,
  ExecutionContext,
  ExecutionPhase,
  ExecutionMode,
  
  // 错误处理
  ErrorHandler,
  PipelineError,
  ErrorClassifier,
  RetryStrategy,
  ErrorSeverity,
  ErrorCategory
};
