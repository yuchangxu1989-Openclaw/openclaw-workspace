/**
 * @file executor.js
 * @description EvoMap进化流水线执行器模块
 * @module EvolutionPipeline/Executor
 * @version 1.0.0
 * @license ISC
 * @copyright (c) 2026 SEEF (技能生态进化工厂)
 * @author SEEF Core Team
 */

import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

/**
 * @typedef {string} ExecutionMode
 * @description 执行模式枚举
 */
export const ExecutionMode = {
  SERIAL: 'serial',     // 串行执行
  PARALLEL: 'parallel', // 并行执行
  PIPELINE: 'pipeline'  // 管道模式
};

/**
 * @typedef {string} ExecutorStage
 * @description 流水线阶段枚举
 */
export const ExecutorStage = {
  ANALYZE: 'analyze',     // 分析阶段
  CODE: 'code',           // 编码阶段
  TEST: 'test',           // 测试阶段
  PACKAGE: 'package',     // 打包阶段
  PUBLISH: 'publish'      // 发布阶段
};

/**
 * @typedef {Object} ExecutionContext
 * @property {string} pipelineId - 流水线ID
 * @property {string} skillId - 技能ID
 * @property {string} skillPath - 技能路径
 * @property {Object} config - 配置对象
 * @property {Object} metadata - 元数据
 * @property {Object} results - 各阶段结果
 * @property {Error[]} errors - 错误列表
 * @property {number} startTime - 开始时间
 * @property {number} endTime - 结束时间
 */

/**
 * @typedef {Object} StageExecutor
 * @property {ExecutorStage} stage - 阶段标识
 * @property {string} name - 阶段名称
 * @property {Function} execute - 执行函数 (context) => Promise<any>
 * @property {number} [timeoutMs] - 超时时间
 * @property {boolean} [continueOnError=false] - 错误时是否继续
 * @property {string[]} [dependsOn] - 依赖阶段
 * @property {Object} [options] - 额外选项
 */

/**
 * @typedef {Object} ExecutionResult
 * @property {boolean} success - 是否成功
 * @property {ExecutorStage[]} completedStages - 完成的阶段
 * @property {ExecutorStage[]} failedStages - 失败的阶段
 * @property {Object} stageResults - 各阶段结果
 * @property {number} duration - 总耗时
 * @property {Error|null} error - 错误信息
 */

/**
 * 执行器引擎类
 * @class Executor
 * @extends EventEmitter
 * @description 管理流水线阶段的串行/并行执行，支持超时控制和上下文传递
 */
export class Executor extends EventEmitter {
  /**
   * @constructor
   * @param {Object} options - 配置选项
   * @param {string} [options.pipelineId] - 流水线ID
   * @param {ExecutionMode} [options.mode='serial'] - 默认执行模式
   * @param {number} [options.defaultTimeoutMs=300000] - 默认超时时间（5分钟）
   * @param {boolean} [options.continueOnError=false] - 错误时是否继续
   * @param {number} [options.maxConcurrency=3] - 最大并行数
   */
  constructor(options = {}) {
    super();

    /** @private @type {string} */
    this._pipelineId = options.pipelineId || `executor_${Date.now()}`;
    
    /** @private @type {ExecutionMode} */
    this._mode = options.mode || ExecutionMode.SERIAL;
    
    /** @private @type {number} */
    this._defaultTimeoutMs = options.defaultTimeoutMs || 5 * 60 * 1000;
    
    /** @private @type {boolean} */
    this._continueOnError = options.continueOnError || false;
    
    /** @private @type {number} */
    this._maxConcurrency = options.maxConcurrency || 3;

    /** @private @type {Map<ExecutorStage, StageExecutor>} */
    this._stages = new Map();

    /** @private @type {Map<string, AbortController>} */
    this._abortControllers = new Map();

    /** @private @type {boolean} */
    this._initialized = false;

    /** @private @type {boolean} */
    this._executing = false;
  }

  /**
   * 获取流水线ID
   * @returns {string}
   */
  get pipelineId() {
    return this._pipelineId;
  }

  /**
   * 获取当前执行模式
   * @returns {ExecutionMode}
   */
  get mode() {
    return this._mode;
  }

  /**
   * 获取是否正在执行
   * @returns {boolean}
   */
  get isExecuting() {
    return this._executing;
  }

  /**
   * 获取已注册阶段数量
   * @returns {number}
   */
  get stageCount() {
    return this._stages.size;
  }

  /**
   * 初始化执行器
   * @async
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this._initialized) {
      this._log('warn', 'Executor already initialized');
      return;
    }

    this._initialized = true;
    this._log('info', 'Executor initialized', {
      pipelineId: this._pipelineId,
      mode: this._mode,
      defaultTimeout: this._defaultTimeoutMs
    });
    
    this.emit('initialized', { pipelineId: this._pipelineId });
  }

  /**
   * 注册执行阶段
   * @param {StageExecutor} stage - 阶段配置
   * @returns {Executor} 返回自身以支持链式调用
   * @throws {Error} 阶段已存在时抛出
   */
  registerStage(stage) {
    if (!stage.stage || !stage.execute) {
      throw new Error('Stage must have "stage" and "execute" properties');
    }

    if (this._stages.has(stage.stage)) {
      throw new Error(`Stage '${stage.stage}' is already registered`);
    }

    // 设置默认值
    const normalizedStage = {
      name: stage.name || stage.stage,
      timeoutMs: stage.timeoutMs || this._defaultTimeoutMs,
      continueOnError: stage.continueOnError ?? this._continueOnError,
      dependsOn: stage.dependsOn || [],
      options: stage.options || {},
      ...stage
    };

    this._stages.set(stage.stage, normalizedStage);
    
    this._log('info', `Stage registered: ${stage.stage}`);
    this.emit('stage:registered', { stage: normalizedStage });

    return this;
  }

  /**
   * 注销执行阶段
   * @param {ExecutorStage} stageId - 阶段标识
   * @returns {boolean} 是否成功
   */
  unregisterStage(stageId) {
    if (!this._stages.has(stageId)) {
      return false;
    }

    this._stages.delete(stageId);
    
    this._log('info', `Stage unregistered: ${stageId}`);
    this.emit('stage:unregistered', { stageId });

    return true;
  }

  /**
   * 获取阶段配置
   * @param {ExecutorStage} stageId - 阶段标识
   * @returns {StageExecutor|null}
   */
  getStage(stageId) {
    return this._stages.get(stageId) || null;
  }

  /**
   * 获取所有阶段
   * @returns {StageExecutor[]}
   */
  getAllStages() {
    return Array.from(this._stages.values());
  }

  /**
   * 执行流水线
   * @async
   * @param {Object} initialContext - 初始上下文
   * @param {ExecutionMode} [mode] - 执行模式（覆盖默认）
   * @param {ExecutorStage[]} [stages] - 指定执行的阶段（默认全部）
   * @returns {Promise<ExecutionResult>}
   */
  async execute(initialContext = {}, mode, stages) {
    if (this._executing) {
      throw new Error('Executor is already running');
    }

    if (!this._initialized) {
      await this.initialize();
    }

    const executionMode = mode || this._mode;
    const targetStages = stages || Array.from(this._stages.keys());
    
    this._executing = true;
    const startTime = Date.now();

    // 创建执行上下文
    const context = this._createContext(initialContext);
    
    this._log('info', 'Starting execution', {
      mode: executionMode,
      stages: targetStages,
      pipelineId: this._pipelineId
    });
    
    this.emit('execution:start', { mode: executionMode, stages: targetStages, context });

    try {
      let result;
      
      switch (executionMode) {
        case ExecutionMode.PARALLEL:
          result = await this._executeParallel(targetStages, context);
          break;
        case ExecutionMode.PIPELINE:
          result = await this._executePipeline(targetStages, context);
          break;
        case ExecutionMode.SERIAL:
        default:
          result = await this._executeSerial(targetStages, context);
          break;
      }

      result.duration = Date.now() - startTime;
      
      this._log('info', 'Execution completed', {
        success: result.success,
        duration: result.duration,
        completedStages: result.completedStages.length
      });
      
      this.emit('execution:complete', result);
      
      return result;
    } catch (error) {
      const result = {
        success: false,
        completedStages: [],
        failedStages: targetStages,
        stageResults: {},
        duration: Date.now() - startTime,
        error
      };
      
      this._log('error', 'Execution failed', { error: error.message });
      this.emit('execution:failed', result);
      
      return result;
    } finally {
      this._executing = false;
      this._cleanup();
    }
  }

  /**
   * 串行执行阶段
   * @private
   * @async
   * @param {ExecutorStage[]} stageIds - 阶段列表
   * @param {ExecutionContext} context - 执行上下文
   * @returns {Promise<ExecutionResult>}
   */
  async _executeSerial(stageIds, context) {
    const completedStages = [];
    const failedStages = [];
    const stageResults = {};
    let shouldContinue = true;

    for (const stageId of stageIds) {
      if (!shouldContinue) {
        break;
      }

      const stage = this._stages.get(stageId);
      if (!stage) {
        this._log('warn', `Stage not found: ${stageId}`);
        continue;
      }

      const result = await this._executeStage(stage, context);
      
      stageResults[stageId] = result;
      context.results[stageId] = result;

      if (result.success) {
        completedStages.push(stageId);
        this.emit('stage:complete', { stageId, result, context });
      } else {
        failedStages.push(stageId);
        this.emit('stage:failed', { stageId, result, context });
        
        if (!stage.continueOnError) {
          shouldContinue = false;
        }
      }
    }

    return {
      success: failedStages.length === 0,
      completedStages,
      failedStages,
      stageResults,
      duration: 0,
      error: failedStages.length > 0 ? new Error(`Stages failed: ${failedStages.join(', ')}`) : null
    };
  }

  /**
   * 并行执行阶段
   * @private
   * @async
   * @param {ExecutorStage[]} stageIds - 阶段列表
   * @param {ExecutionContext} context - 执行上下文
   * @returns {Promise<ExecutionResult>}
   */
  async _executeParallel(stageIds, context) {
    // 构建依赖图
    const dependencyGraph = this._buildDependencyGraph(stageIds);
    const executedStages = new Set();
    const failedStages = new Set();
    const stageResults = {};

    // 批量执行（考虑依赖和并发限制）
    while (executedStages.size + failedStages.size < stageIds.length) {
      // 找出可执行的阶段（依赖已完成）
      const readyStages = stageIds.filter(id => {
        if (executedStages.has(id) || failedStages.has(id)) return false;
        const stage = this._stages.get(id);
        return stage.dependsOn.every(dep => executedStages.has(dep));
      });

      if (readyStages.length === 0) {
        // 检查是否有循环依赖或无法执行的阶段
        const remaining = stageIds.filter(id => 
          !executedStages.has(id) && !failedStages.has(id)
        );
        if (remaining.length > 0) {
          throw new Error(`Dependency deadlock detected for stages: ${remaining.join(', ')}`);
        }
        break;
      }

      // 限制并发数
      const batchSize = Math.min(readyStages.length, this._maxConcurrency);
      const batch = readyStages.slice(0, batchSize);

      // 并行执行批次
      const batchResults = await Promise.allSettled(
        batch.map(stageId => this._executeStage(this._stages.get(stageId), context))
      );

      // 处理结果
      batchResults.forEach((result, index) => {
        const stageId = batch[index];
        
        if (result.status === 'fulfilled') {
          stageResults[stageId] = result.value;
          context.results[stageId] = result.value;
          
          if (result.value.success) {
            executedStages.add(stageId);
            this.emit('stage:complete', { stageId, result: result.value, context });
          } else {
            failedStages.add(stageId);
            this.emit('stage:failed', { stageId, result: result.value, context });
            
            // 检查依赖此阶段的后续阶段
            const dependentStages = stageIds.filter(id => {
              const stage = this._stages.get(id);
              return stage.dependsOn.includes(stageId);
            });
            dependentStages.forEach(dep => failedStages.add(dep));
          }
        } else {
          failedStages.add(stageId);
          stageResults[stageId] = {
            success: false,
            error: result.reason,
            duration: 0
          };
          this.emit('stage:failed', { stageId, error: result.reason, context });
        }
      });
    }

    return {
      success: failedStages.size === 0,
      completedStages: Array.from(executedStages),
      failedStages: Array.from(failedStages),
      stageResults,
      duration: 0,
      error: failedStages.size > 0 ? new Error(`Stages failed: ${Array.from(failedStages).join(', ')}`) : null
    };
  }

  /**
   * 管道模式执行（前一阶段输出作为后一阶段输入）
   * @private
   * @async
   * @param {ExecutorStage[]} stageIds - 阶段列表
   * @param {ExecutionContext} context - 执行上下文
   * @returns {Promise<ExecutionResult>}
   */
  async _executePipeline(stageIds, context) {
    const completedStages = [];
    const failedStages = [];
    const stageResults = {};
    let pipelineData = null;

    for (const stageId of stageIds) {
      const stage = this._stages.get(stageId);
      if (!stage) {
        this._log('warn', `Stage not found: ${stageId}`);
        continue;
      }

      // 将前一阶段的输出作为输入
      const stageContext = {
        ...context,
        input: pipelineData,
        isPipelineMode: true
      };

      const result = await this._executeStage(stage, stageContext);
      
      stageResults[stageId] = result;
      context.results[stageId] = result;

      if (result.success) {
        completedStages.push(stageId);
        pipelineData = result.output || result.data || null;
        this.emit('stage:complete', { stageId, result, context: stageContext });
      } else {
        failedStages.push(stageId);
        this.emit('stage:failed', { stageId, result, context: stageContext });
        break; // 管道模式中断
      }
    }

    // 保存最终输出到上下文
    context.pipelineOutput = pipelineData;

    return {
      success: failedStages.length === 0,
      completedStages,
      failedStages,
      stageResults,
      duration: 0,
      output: pipelineData,
      error: failedStages.length > 0 ? new Error(`Pipeline broken at stage: ${failedStages[0]}`) : null
    };
  }

  /**
   * 执行单个阶段
   * @private
   * @async
   * @param {StageExecutor} stage - 阶段配置
   * @param {ExecutionContext} context - 执行上下文
   * @returns {Promise<Object>}
   */
  async _executeStage(stage, context) {
    const stageId = stage.stage;
    const abortController = new AbortController();
    this._abortControllers.set(stageId, abortController);

    const startTime = Date.now();
    
    this._log('info', `Executing stage: ${stageId}`);
    this.emit('stage:start', { stageId, stage, context });

    try {
      // 创建超时Promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new ExecutionTimeoutError(
            `Stage '${stageId}' timed out after ${stage.timeoutMs}ms`,
            stageId,
            stage.timeoutMs
          ));
        }, stage.timeoutMs);
      });

      // 创建执行Promise
      const executionPromise = Promise.resolve().then(() => {
        if (abortController.signal.aborted) {
          throw new ExecutionCancelledError(`Stage '${stageId}' was cancelled`, stageId);
        }
        return stage.execute(context, abortController.signal);
      });

      // 竞争执行
      const result = await Promise.race([executionPromise, timeoutPromise]);
      
      const duration = Date.now() - startTime;
      
      const stageResult = {
        success: true,
        stageId,
        output: result,
        data: result,
        duration,
        timestamp: Date.now()
      };

      this._log('info', `Stage completed: ${stageId}`, { duration });
      
      return stageResult;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      const stageResult = {
        success: false,
        stageId,
        error: {
          message: error.message,
          name: error.name,
          stack: error.stack
        },
        duration,
        timestamp: Date.now()
      };

      this._log('error', `Stage failed: ${stageId}`, { 
        error: error.message,
        duration 
      });

      return stageResult;
    } finally {
      this._abortControllers.delete(stageId);
    }
  }

  /**
   * 取消正在执行的阶段
   * @param {ExecutorStage} [stageId] - 阶段ID（不提供则取消所有）
   * @returns {boolean}
   */
  cancel(stageId = null) {
    if (stageId) {
      const controller = this._abortControllers.get(stageId);
      if (controller) {
        controller.abort();
        this._log('info', `Stage cancelled: ${stageId}`);
        this.emit('stage:cancelled', { stageId });
        return true;
      }
      return false;
    }

    // 取消所有
    for (const [id, controller] of this._abortControllers) {
      controller.abort();
      this.emit('stage:cancelled', { stageId: id });
    }
    
    this._log('info', `All stages cancelled: ${this._abortControllers.size}`);
    return this._abortControllers.size > 0;
  }

  /**
   * 创建执行上下文
   * @private
   * @param {Object} initialData - 初始数据
   * @returns {ExecutionContext}
   */
  _createContext(initialData = {}) {
    return {
      pipelineId: this._pipelineId,
      skillId: initialData.skillId || null,
      skillPath: initialData.skillPath || null,
      config: initialData.config || {},
      metadata: initialData.metadata || {},
      results: {},
      errors: [],
      startTime: Date.now(),
      endTime: null,
      ...initialData
    };
  }

  /**
   * 构建依赖图
   * @private
   * @param {ExecutorStage[]} stageIds - 阶段列表
   * @returns {Map}
   */
  _buildDependencyGraph(stageIds) {
    const graph = new Map();
    
    for (const stageId of stageIds) {
      const stage = this._stages.get(stageId);
      if (stage) {
        graph.set(stageId, stage.dependsOn || []);
      }
    }
    
    return graph;
  }

  /**
   * 清理资源
   * @private
   */
  _cleanup() {
    this._abortControllers.clear();
  }

  /**
   * 执行shell命令
   * @static
   * @param {string} command - 命令
   * @param {Object} options - 选项
   * @returns {Promise<{stdout: string, stderr: string, exitCode: number}>}
   */
  static async exec(command, options = {}) {
    return new Promise((resolve, reject) => {
      const { 
        cwd = process.cwd(),
        env = process.env,
        timeout = 60000,
        shell = true
      } = options;

      const child = spawn(command, {
        cwd,
        env,
        shell,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';
      let timeoutId;

      if (timeout) {
        timeoutId = setTimeout(() => {
          child.kill('SIGTERM');
          reject(new Error(`Command timed out after ${timeout}ms: ${command}`));
        }, timeout);
      }

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (exitCode) => {
        if (timeoutId) clearTimeout(timeoutId);
        
        resolve({
          stdout,
          stderr,
          exitCode: exitCode || 0,
          command
        });
      });

      child.on('error', (error) => {
        if (timeoutId) clearTimeout(timeoutId);
        reject(error);
      });
    });
  }

  /**
   * 记录日志
   * @private
   * @param {string} level - 日志级别
   * @param {string} message - 消息
   * @param {Object} [meta] - 元数据
   */
  _log(level, message, meta = {}) {
    const logEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      module: 'Executor',
      pipelineId: this._pipelineId,
      ...meta
    };

    const logFn = level === 'error' ? console.error : 
                  level === 'warn' ? console.warn : console.log;
    logFn(`[Executor:${this._pipelineId}] ${message}`, meta);

    this.emit('log', logEntry);
  }
}

/**
 * 执行超时错误类
 * @class ExecutionTimeoutError
 * @extends Error
 */
export class ExecutionTimeoutError extends Error {
  /**
   * @constructor
   * @param {string} message - 错误消息
   * @param {string} stageId - 阶段ID
   * @param {number} timeoutMs - 超时时间
   */
  constructor(message, stageId, timeoutMs) {
    super(message);
    this.name = 'ExecutionTimeoutError';
    this.stageId = stageId;
    this.timeoutMs = timeoutMs;
    this.timestamp = Date.now();
  }
}

/**
 * 执行取消错误类
 * @class ExecutionCancelledError
 * @extends Error
 */
export class ExecutionCancelledError extends Error {
  /**
   * @constructor
   * @param {string} message - 错误消息
   * @param {string} stageId - 阶段ID
   */
  constructor(message, stageId) {
    super(message);
    this.name = 'ExecutionCancelledError';
    this.stageId = stageId;
    this.timestamp = Date.now();
  }
}

/**
 * 创建执行器的工厂函数
 * @param {Object} options - 配置选项
 * @returns {Executor}
 */
export function createExecutor(options = {}) {
  return new Executor(options);
}

/**
 * 创建标准流水线阶段的辅助函数
 * @param {Object} config - 阶段配置
 * @returns {StageExecutor}
 */
export function createStage(config) {
  return {
    stage: config.stage,
    name: config.name || config.stage,
    execute: config.execute,
    timeoutMs: config.timeoutMs || 300000,
    continueOnError: config.continueOnError || false,
    dependsOn: config.dependsOn || [],
    options: config.options || {}
  };
}

/**
 * 预定义的阶段执行器
 */
export const BuiltinStages = {
  /**
   * 分析阶段
   * @returns {StageExecutor}
   */
  analyze: () => createStage({
    stage: ExecutorStage.ANALYZE,
    name: 'Analyze',
    execute: async (context) => {
      // 默认分析逻辑
      return { analyzed: true, timestamp: Date.now() };
    }
  }),

  /**
   * 编码阶段
   * @returns {StageExecutor}
   */
  code: () => createStage({
    stage: ExecutorStage.CODE,
    name: 'Code',
    dependsOn: [ExecutorStage.ANALYZE],
    execute: async (context) => {
      return { coded: true, timestamp: Date.now() };
    }
  }),

  /**
   * 测试阶段
   * @returns {StageExecutor}
   */
  test: () => createStage({
    stage: ExecutorStage.TEST,
    name: 'Test',
    dependsOn: [ExecutorStage.CODE],
    execute: async (context) => {
      return { tested: true, timestamp: Date.now() };
    }
  }),

  /**
   * 打包阶段
   * @returns {StageExecutor}
   */
  package: () => createStage({
    stage: ExecutorStage.PACKAGE,
    name: 'Package',
    dependsOn: [ExecutorStage.TEST],
    execute: async (context) => {
      return { packaged: true, timestamp: Date.now() };
    }
  }),

  /**
   * 发布阶段
   * @returns {StageExecutor}
   */
  publish: () => createStage({
    stage: ExecutorStage.PUBLISH,
    name: 'Publish',
    dependsOn: [ExecutorStage.PACKAGE],
    execute: async (context) => {
      return { published: true, timestamp: Date.now() };
    }
  })
};

export default Executor;
