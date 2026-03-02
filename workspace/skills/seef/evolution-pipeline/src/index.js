/**
 * @file index.js
 * @description EvoMap进化流水线主入口
 * @module EvolutionPipeline
 * @version 1.0.0
 * @license ISC
 * @copyright (c) 2026 SEEF (技能生态进化工厂)
 * @author SEEF Core Team
 */

// 状态机引擎
export { 
  StateMachine, 
  PipelineState, 
  STATE_TRANSITIONS,
  STATE_METADATA
} from './state-machine.js';

// 触发器模块
export { 
  TriggerManager, 
  TriggerType,
  createTriggerManager,
  parseCron
} from './trigger.js';

// 执行器模块
export { 
  Executor, 
  ExecutionMode,
  ExecutorStage,
  ExecutionTimeoutError,
  ExecutionCancelledError,
  createExecutor,
  createStage,
  BuiltinStages
} from './executor.js';

// 错误处理模块
export { 
  ErrorHandler, 
  ErrorSeverity,
  ErrorCategory,
  RetryExhaustedError,
  RecoverableError,
  DEFAULT_RETRY_CONFIG,
  createErrorHandler,
  createProductionErrorHandler,
  createDevelopmentErrorHandler
} from './error-handler.js';

// 任务调度模块
export {
  TaskScheduler,
  Task,
  createTaskScheduler
} from './scheduler/index.js';

// 通知系统模块
export {
  NotificationManager,
  Notification,
  createNotificationManager
} from './notification/index.js';

// 类型定义
export {
  TaskPriority,
  TaskStatus,
  NotificationType,
  NotificationChannel,
  SkillLifecycleState,
  PDCAState,
  EventType
} from './types/index.js';

// EvoMap上传器
export {
  EvoMapUploader
} from './uploaders/evomap-uploader.js';

// 流水线引擎
export {
  PipelineEngine
} from './engine.js';

/**
 * EvolutionPipeline 主类
 * @class
 * @description 整合状态机、触发器、执行器、错误处理、任务调度和通知系统的完整流水线
 */
export class EvolutionPipeline {
  /**
   * @constructor
   * @param {Object} options - 配置选项
   * @param {string} [options.pipelineId] - 流水线ID
   * @param {Object} [options.stateMachine] - 状态机配置
   * @param {Object} [options.trigger] - 触发器配置
   * @param {Object} [options.executor] - 执行器配置
   * @param {Object} [options.errorHandler] - 错误处理器配置
   * @param {Object} [options.scheduler] - 任务调度器配置
   * @param {Object} [options.notification] - 通知系统配置
   */
  constructor(options = {}) {
    this._pipelineId = options.pipelineId || `ep_${Date.now()}`;
    this._options = options;
    
    this._stateMachine = null;
    this._triggerManager = null;
    this._executor = null;
    this._errorHandler = null;
    this._scheduler = null;
    this._notification = null;
    
    this._initialized = false;
    this._running = false;
  }

  /**
   * 获取流水线ID
   * @returns {string}
   */
  get pipelineId() {
    return this._pipelineId;
  }

  /**
   * 获取状态机实例
   * @returns {StateMachine|null}
   */
  get stateMachine() {
    return this._stateMachine;
  }

  /**
   * 获取触发器管理器
   * @returns {TriggerManager|null}
   */
  get triggerManager() {
    return this._triggerManager;
  }

  /**
   * 获取执行器
   * @returns {Executor|null}
   */
  get executor() {
    return this._executor;
  }

  /**
   * 获取错误处理器
   * @returns {ErrorHandler|null}
   */
  get errorHandler() {
    return this._errorHandler;
  }

  /**
   * 获取任务调度器
   * @returns {TaskScheduler|null}
   */
  get scheduler() {
    return this._scheduler;
  }

  /**
   * 获取通知管理器
   * @returns {NotificationManager|null}
   */
  get notification() {
    return this._notification;
  }

  /**
   * 检查是否运行中
   * @returns {boolean}
   */
  get isRunning() {
    return this._running;
  }

  /**
   * 初始化流水线
   * @async
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this._initialized) {
      return;
    }

    // 动态导入各模块
    const { StateMachine } = await import('./state-machine.js');
    const { TriggerManager } = await import('./trigger.js');
    const { Executor } = await import('./executor.js');
    const { ErrorHandler } = await import('./error-handler.js');
    const { TaskScheduler } = await import('./scheduler/index.js');
    const { NotificationManager } = await import('./notification/index.js');

    // 初始化任务调度器
    this._scheduler = new TaskScheduler({
      pipelineId: this._pipelineId,
      ...this._options.scheduler
    });
    await this._scheduler.initialize();

    // 初始化通知系统
    this._notification = new NotificationManager({
      pipelineId: this._pipelineId,
      ...this._options.notification
    });
    await this._notification.initialize();

    // 初始化状态机
    this._stateMachine = new StateMachine({
      pipelineId: this._pipelineId,
      ...this._options.stateMachine
    });
    await this._stateMachine.initialize();

    // 初始化触发器
    this._triggerManager = new TriggerManager({
      ...this._options.trigger
    });
    await this._triggerManager.initialize();

    // 初始化执行器
    this._executor = new Executor({
      pipelineId: this._pipelineId,
      ...this._options.executor
    });
    await this._executor.initialize();

    // 初始化错误处理器
    this._errorHandler = new ErrorHandler({
      ...this._options.errorHandler
    });
    await this._errorHandler.initialize();

    // 绑定事件
    this._bindEvents();

    this._initialized = true;
    
    // 发送初始化完成通知
    await this._notification?.success(
      '流水线初始化完成',
      `EvolutionPipeline ${this._pipelineId} 已成功初始化`,
      { pipelineId: this._pipelineId }
    );
    
    console.log(`[EvolutionPipeline] Initialized: ${this._pipelineId}`);
  }

  /**
   * 绑定内部事件
   * @private
   */
  _bindEvents() {
    // 状态机事件转发
    this._stateMachine.on('transition', (data) => {
      this._handleStateTransition(data);
    });

    // 触发器事件
    this._triggerManager.on('trigger:file', (event) => {
      this._handleFileTrigger(event);
    });

    this._triggerManager.on('trigger:schedule', (event) => {
      this._handleScheduleTrigger(event);
    });

    this._triggerManager.on('trigger:manual', (event) => {
      this._handleManualTrigger(event);
    });

    // 执行器事件
    this._executor.on('stage:failed', (data) => {
      this._handleStageFailure(data);
    });
  }

  /**
   * 启动流水线
   * @async
   * @returns {Promise<void>}
   */
  async start() {
    if (!this._initialized) {
      await this.initialize();
    }

    if (this._running) {
      return;
    }

    await this._triggerManager.start();
    this._scheduler.start();
    this._running = true;
    
    await this._notification?.info(
      '流水线已启动',
      `EvolutionPipeline ${this._pipelineId} 开始运行`,
      { pipelineId: this._pipelineId }
    );
    
    console.log(`[EvolutionPipeline] Started: ${this._pipelineId}`);
  }

  /**
   * 停止流水线
   * @async
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this._running) {
      return;
    }

    await this._triggerManager.stop();
    this._executor.cancel();
    this._scheduler.stop();
    
    this._running = false;
    
    await this._notification?.info(
      '流水线已停止',
      `EvolutionPipeline ${this._pipelineId} 已停止运行`,
      { pipelineId: this._pipelineId }
    );
    
    console.log(`[EvolutionPipeline] Stopped: ${this._pipelineId}`);
  }

  /**
   * 执行单次流水线
   * @async
   * @param {Object} context - 执行上下文
   * @returns {Promise<Object>}
   */
  async runOnce(context = {}) {
    if (!this._initialized) {
      await this.initialize();
    }

    const runId = `run_${Date.now()}`;
    
    await this._notification?.info(
      '开始执行流水线',
      `执行单次流水线运行: ${runId}`,
      { runId, context }
    );

    try {
      // 触发分析阶段
      await this._stateMachine.transition('analyzing', {
        reason: 'manual_trigger'
      });

      // 执行流水线
      const result = await this._executor.execute(context);

      if (result.success) {
        await this._stateMachine.transition('completed', {
          reason: 'execution_success'
        });
        
        await this._notification?.success(
          '流水线执行成功',
          `运行 ${runId} 已成功完成`,
          { runId, result }
        );
      } else {
        await this._stateMachine.transition('failed', {
          reason: 'execution_failed'
        });
        
        await this._notification?.warning(
          '流水线执行未完成',
          `运行 ${runId} 未成功完成`,
          { runId, result }
        );
      }

      return result;
    } catch (error) {
      await this._errorHandler.handleError(error, { stage: 'pipeline' });
      
      await this._notification?.error(
        '流水线执行失败',
        `运行 ${runId} 执行失败: ${error.message}`,
        { runId, error: error.message }
      );
      
      await this._stateMachine.transition('failed', {
        reason: error.message
      });

      throw error;
    }
  }

  /**
   * 处理状态转换
   * @private
   * @param {Object} data - 转换数据
   */
  _handleStateTransition(data) {
    console.log(`[EvolutionPipeline] State: ${data.from} -> ${data.to}`);
    
    // 根据状态触发相应动作
    switch (data.to) {
      case 'analyzing':
        this._triggerAnalysis();
        break;
      case 'failed':
        this._handleFailure(data);
        break;
      default:
        break;
    }
  }

  /**
   * 处理文件触发
   * @private
   * @param {Object} event - 触发事件
   */
  async _handleFileTrigger(event) {
    console.log('[EvolutionPipeline] File trigger:', event.payload.filePath);
    
    // 可以在这里触发流水线执行
    if (this._stateMachine.currentState === 'idle') {
      await this.runOnce({
        triggerType: 'file',
        filePath: event.payload.filePath
      });
    }
  }

  /**
   * 处理定时触发
   * @private
   * @param {Object} event - 触发事件
   */
  async _handleScheduleTrigger(event) {
    console.log('[EvolutionPipeline] Schedule trigger:', event.payload.scheduleId);
    
    if (this._stateMachine.currentState === 'idle') {
      await this.runOnce({
        triggerType: 'schedule',
        scheduleId: event.payload.scheduleId
      });
    }
  }

  /**
   * 处理手动触发
   * @private
   * @param {Object} event - 触发事件
   */
  async _handleManualTrigger(event) {
    console.log('[EvolutionPipeline] Manual trigger');
    await this.runOnce({
      triggerType: 'manual',
      ...event.payload
    });
  }

  /**
   * 处理阶段失败
   * @private
   * @param {Object} data - 失败数据
   */
  async _handleStageFailure(data) {
    const { stageId, result } = data;
    const error = new Error(result.error?.message || 'Stage execution failed');
    
    await this._errorHandler.handleError(error, { stage: stageId });
    
    // 发送错误通知
    await this._notification?.error(
      '流水线阶段失败',
      `阶段 ${stageId} 执行失败: ${error.message}`,
      { stageId, pipelineId: this._pipelineId, error: result.error }
    );
  }

  /**
   * 触发分析
   * @private
   */
  _triggerAnalysis() {
    // 实现分析逻辑
    this._notification?.info('开始分析', '流水线进入分析阶段');
  }

  /**
   * 处理失败
   * @private
   * @param {Object} data - 失败数据
   */
  async _handleFailure(data) {
    const { reason, from } = data;
    
    console.log(`[EvolutionPipeline] Failure: ${from} - ${reason}`);
    
    // 发送严重错误通知
    await this._notification?.critical(
      '流水线失败',
      `流水线从 ${from} 状态失败: ${reason}`,
      { from, reason, pipelineId: this._pipelineId }
    );
    
    // 可以尝试回滚
    if (from !== 'idle') {
      await this._errorHandler.rollbackMultiple(
        ['analyze', 'code', 'test', 'package', 'publish']
      );
    }
  }
}

/**
 * 创建流水线实例的工厂函数
 * @param {Object} options - 配置选项
 * @returns {EvolutionPipeline}
 */
export function createPipeline(options = {}) {
  return new EvolutionPipeline(options);
}

export default EvolutionPipeline;
