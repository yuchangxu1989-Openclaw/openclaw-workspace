/**
 * @file error-handler.js
 * @description EvoMap进化流水线错误处理模块
 * @module EvolutionPipeline/ErrorHandler
 * @version 1.0.0
 * @license ISC
 * @copyright (c) 2026 SEEF (技能生态进化工厂)
 * @author SEEF Core Team
 */

import { EventEmitter } from 'events';
import fs from 'fs/promises';
import path from 'path';

/**
 * @typedef {string} ErrorSeverity
 * @description 错误严重程度枚举
 */
export const ErrorSeverity = {
  DEBUG: 'debug',
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'critical',
  FATAL: 'fatal'
};

/**
 * @typedef {string} ErrorCategory
 * @description 错误分类枚举
 */
export const ErrorCategory = {
  RECOVERABLE: 'recoverable',     // 可恢复错误
  UNRECOVERABLE: 'unrecoverable', // 不可恢复错误
  TRANSIENT: 'transient',         // 瞬时错误
  PERMANENT: 'permanent',         // 永久错误
  VALIDATION: 'validation',       // 验证错误
  TIMEOUT: 'timeout',             // 超时错误
  NETWORK: 'network',             // 网络错误
  RESOURCE: 'resource',           // 资源错误
  PERMISSION: 'permission',       // 权限错误
  UNKNOWN: 'unknown'              // 未知错误
};

/**
 * @typedef {Object} ErrorRecord
 * @property {string} id - 错误唯一标识
 * @property {Error} error - 原始错误
 * @property {string} message - 错误消息
 * @property {string} [stack] - 堆栈跟踪
 * @property {ErrorCategory} category - 错误分类
 * @property {ErrorSeverity} severity - 严重程度
 * @property {string} [stage] - 发生的阶段
 * @property {number} timestamp - 时间戳
 * @property {number} retryCount - 重试次数
 * @property {boolean} recovered - 是否已恢复
 * @property {Object} context - 上下文信息
 */

/**
 * @typedef {Object} RetryConfig
 * @property {number} maxRetries - 最大重试次数
 * @property {number} initialDelayMs - 初始延迟（毫秒）
 * @property {number} maxDelayMs - 最大延迟（毫秒）
 * @property {number} backoffMultiplier - 退避乘数
 * @property {boolean} exponentialBackoff - 是否使用指数退避
 * @property {number} [timeoutMs] - 单次重试超时
 */

/**
 * @typedef {Object} ErrorHandlerConfig
 * @property {RetryConfig} retry - 重试配置
 * @property {boolean} [enablePersistence=true] - 启用错误持久化
 * @property {string} [errorLogDir] - 错误日志目录
 * @property {number} [maxErrorHistory=1000] - 最大错误历史记录
 * @property {boolean} [autoClassify=true] - 自动分类错误
 * @property {Function} [classifier] - 自定义分类器
 * @property {boolean} [enableAlerts=true] - 启用告警
 * @property {Function} [alertHandler] - 自定义告警处理器
 * @property {boolean} [enableRollback=true] - 启用状态回滚
 */

/**
 * 默认重试配置
 * @constant {RetryConfig}
 */
export const DEFAULT_RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 60000,
  backoffMultiplier: 2,
  exponentialBackoff: true,
  timeoutMs: 30000
};

/**
 * 错误处理引擎类
 * @class ErrorHandler
 * @extends EventEmitter
 * @description 提供错误分类、重试策略、日志记录和状态回滚功能
 */
export class ErrorHandler extends EventEmitter {
  /**
   * @constructor
   * @param {ErrorHandlerConfig} config - 错误处理器配置
   */
  constructor(config = {}) {
    super();

    /** @private @type {ErrorHandlerConfig} */
    this._config = {
      retry: { ...DEFAULT_RETRY_CONFIG, ...config.retry },
      enablePersistence: config.enablePersistence !== false,
      errorLogDir: config.errorLogDir || path.join(process.cwd(), '.pipeline', 'errors'),
      maxErrorHistory: config.maxErrorHistory || 1000,
      autoClassify: config.autoClassify !== false,
      classifier: config.classifier || null,
      enableAlerts: config.enableAlerts !== false,
      alertHandler: config.alertHandler || null,
      enableRollback: config.enableRollback !== false,
      ...config
    };

    /** @private @type {ErrorRecord[]} */
    this._errorHistory = [];

    /** @private @type {Map<string, Object>} */
    this._activeRetries = new Map();

    /** @private @type {Map<string, Function>} */
    this._rollbackHandlers = new Map();

    /** @private @type {boolean} */
    this._initialized = false;

    /** @private @type {number} */
    this._errorCount = 0;

    /** @private @type {Object} */
    this._statistics = {
      total: 0,
      byCategory: {},
      bySeverity: {},
      recovered: 0,
      failed: 0
    };
  }

  /**
   * 获取配置
   * @returns {ErrorHandlerConfig}
   */
  get config() {
    return { ...this._config };
  }

  /**
   * 获取错误历史
   * @returns {ErrorRecord[]}
   */
  get errorHistory() {
    return [...this._errorHistory];
  }

  /**
   * 获取错误统计
   * @returns {Object}
   */
  get statistics() {
    return { ...this._statistics };
  }

  /**
   * 获取当前活跃重试数量
   * @returns {number}
   */
  get activeRetryCount() {
    return this._activeRetries.size;
  }

  /**
   * 初始化错误处理器
   * @async
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this._initialized) {
      return;
    }

    if (this._config.enablePersistence) {
      await this._ensureErrorDir();
      await this._loadErrorHistory();
    }

    this._initialized = true;
    this._log('info', 'ErrorHandler initialized');
    this.emit('initialized');
  }

  /**
   * 处理错误
   * @async
   * @param {Error} error - 错误对象
   * @param {Object} [context] - 上下文信息
   * @param {string} [context.stage] - 发生阶段
   * @param {Object} [context.metadata] - 元数据
   * @returns {Promise<ErrorRecord>}
   */
  async handleError(error, context = {}) {
    if (!this._initialized) {
      await this.initialize();
    }

    const errorRecord = this._createErrorRecord(error, context);
    
    this._log('error', `Error occurred: ${errorRecord.message}`, {
      category: errorRecord.category,
      severity: errorRecord.severity,
      stage: errorRecord.stage
    });

    this.emit('error:occurred', errorRecord);

    // 自动分类
    if (this._config.autoClassify && !context.category) {
      errorRecord.category = this._classifyError(error);
    }

    // 添加到历史
    this._addToHistory(errorRecord);

    // 更新统计
    this._updateStatistics(errorRecord);

    // 触发告警（如果配置）
    if (this._config.enableAlerts) {
      await this._triggerAlert(errorRecord);
    }

    // 持久化
    if (this._config.enablePersistence) {
      await this._persistError(errorRecord);
    }

    return errorRecord;
  }

  /**
   * 执行带重试的操作
   * @async
   * @template T
   * @param {Function} operation - 要执行的操作
   * @param {Object} options - 选项
   * @param {string} options.operationId - 操作标识
   * @param {RetryConfig} [options.retryConfig] - 重试配置（覆盖默认）
   * @param {Function} [options.onRetry] - 重试回调
   * @param {string} [options.stage] - 所属阶段
   * @returns {Promise<T>}
   * @throws {Error} 重试耗尽后抛出
   */
  async withRetry(operation, options) {
    const { 
      operationId, 
      retryConfig = this._config.retry,
      onRetry,
      stage
    } = options;

    const config = { ...this._config.retry, ...retryConfig };
    let lastError;
    let retryCount = 0;

    this._activeRetries.set(operationId, {
      operationId,
      startTime: Date.now(),
      retryCount: 0,
      config
    });

    this.emit('retry:started', { operationId, config });

    try {
      while (retryCount <= config.maxRetries) {
        try {
          // 设置单次超时
          const result = await this._executeWithTimeout(
            operation, 
            config.timeoutMs
          );

          if (retryCount > 0) {
            this._log('info', `Operation succeeded after ${retryCount} retries: ${operationId}`);
            this.emit('retry:succeeded', { operationId, retryCount });
          }

          return result;
        } catch (error) {
          lastError = error;
          retryCount++;

          if (retryCount > config.maxRetries) {
            break;
          }

          // 检查是否应该重试
          if (!this._shouldRetry(error)) {
            this._log('warn', `Non-retryable error, aborting: ${error.message}`);
            throw error;
          }

          // 计算延迟
          const delay = this._calculateDelay(retryCount, config);
          
          this._log('info', `Retry ${retryCount}/${config.maxRetries} for ${operationId} in ${delay}ms`);
          
          this.emit('retry:attempt', { 
            operationId, 
            retryCount, 
            delay,
            error 
          });

          if (onRetry) {
            await onRetry(error, retryCount, delay);
          }

          // 更新活跃重试状态
          const retryState = this._activeRetries.get(operationId);
          if (retryState) {
            retryState.retryCount = retryCount;
            retryState.lastError = error;
          }

          // 等待
          await this._sleep(delay);
        }
      }

      // 重试耗尽
      const finalError = new RetryExhaustedError(
        `Operation ${operationId} failed after ${retryCount} retries: ${lastError.message}`,
        operationId,
        retryCount,
        lastError
      );

      this._log('error', `Retry exhausted: ${operationId}`, {
        retryCount,
        lastError: lastError.message
      });

      this.emit('retry:exhausted', { 
        operationId, 
        retryCount, 
        lastError 
      });

      await this.handleError(finalError, { stage, retryCount });

      throw finalError;
    } finally {
      this._activeRetries.delete(operationId);
    }
  }

  /**
   * 注册回滚处理器
   * @param {string} stage - 阶段标识
   * @param {Function} handler - 回滚处理函数
   * @returns {ErrorHandler} 支持链式调用
   */
  registerRollbackHandler(stage, handler) {
    if (typeof handler !== 'function') {
      throw new Error('Rollback handler must be a function');
    }

    this._rollbackHandlers.set(stage, handler);
    this._log('info', `Rollback handler registered for stage: ${stage}`);
    
    return this;
  }

  /**
   * 执行回滚
   * @async
   * @param {string} stage - 要回滚的阶段
   * @param {Object} [context] - 回滚上下文
   * @returns {Promise<{success: boolean, stage: string, result?: any, error?: Error}>}
   */
  async rollback(stage, context = {}) {
    if (!this._config.enableRollback) {
      this._log('warn', 'Rollback is disabled');
      return { success: false, stage, error: new Error('Rollback is disabled') };
    }

    const handler = this._rollbackHandlers.get(stage);
    if (!handler) {
      this._log('warn', `No rollback handler for stage: ${stage}`);
      return { success: false, stage, error: new Error(`No rollback handler for stage: ${stage}`) };
    }

    this._log('info', `Executing rollback for stage: ${stage}`);
    this.emit('rollback:start', { stage, context });

    try {
      const result = await handler(context);
      
      this._log('info', `Rollback successful for stage: ${stage}`);
      this.emit('rollback:success', { stage, result });

      return { success: true, stage, result };
    } catch (error) {
      this._log('error', `Rollback failed for stage: ${stage}`, { error: error.message });
      this.emit('rollback:failed', { stage, error });

      await this.handleError(error, { stage: `${stage}:rollback`, context });

      return { success: false, stage, error };
    }
  }

  /**
   * 批量回滚多个阶段
   * @async
   * @param {string[]} stages - 阶段列表（按回滚顺序）
   * @param {Object} [context] - 回滚上下文
   * @returns {Promise<{success: boolean, results: Object[]}>}
   */
  async rollbackMultiple(stages, context = {}) {
    const results = [];
    
    // 按逆序回滚
    for (const stage of [...stages].reverse()) {
      const result = await this.rollback(stage, context);
      results.push(result);
      
      if (!result.success) {
        this._log('error', `Rollback chain broken at stage: ${stage}`);
        break;
      }
    }

    const success = results.every(r => r.success);
    
    this.emit('rollback:batch:complete', { stages, results, success });
    
    return { success, results };
  }

  /**
   * 标记错误为已恢复
   * @param {string} errorId - 错误ID
   * @returns {boolean}
   */
  markRecovered(errorId) {
    const record = this._errorHistory.find(e => e.id === errorId);
    if (!record) {
      return false;
    }

    record.recovered = true;
    record.recoveredAt = Date.now();
    this._statistics.recovered++;

    this._log('info', `Error marked as recovered: ${errorId}`);
    this.emit('error:recovered', { errorId, record });

    return true;
  }

  /**
   * 获取错误报告
   * @param {Object} options - 选项
   * @param {ErrorCategory[]} [options.categories] - 过滤分类
   * @param {ErrorSeverity[]} [options.severities] - 过滤严重程度
   * @param {number} [options.since] - 起始时间戳
   * @returns {Object}
   */
  getErrorReport(options = {}) {
    const { categories, severities, since } = options;

    let filtered = this._errorHistory;

    if (categories?.length) {
      filtered = filtered.filter(e => categories.includes(e.category));
    }

    if (severities?.length) {
      filtered = filtered.filter(e => severities.includes(e.severity));
    }

    if (since) {
      filtered = filtered.filter(e => e.timestamp >= since);
    }

    // 分组统计
    const byCategory = {};
    const byStage = {};
    
    for (const record of filtered) {
      byCategory[record.category] = (byCategory[record.category] || 0) + 1;
      if (record.stage) {
        byStage[record.stage] = (byStage[record.stage] || 0) + 1;
      }
    }

    return {
      total: filtered.length,
      recovered: filtered.filter(e => e.recovered).length,
      unrecovered: filtered.filter(e => !e.recovered).length,
      byCategory,
      byStage,
      recent: filtered.slice(-10),
      summary: this._statistics
    };
  }

  /**
   * 清空错误历史
   * @async
   * @returns {Promise<number>} 清空的数量
   */
  async clearHistory() {
    const count = this._errorHistory.length;
    this._errorHistory = [];
    
    this._log('info', `Error history cleared: ${count} records`);
    this.emit('history:cleared', { count });

    return count;
  }

  /**
   * 导出错误日志
   * @async
   * @param {string} [filePath] - 导出路径
   * @returns {Promise<string>} 导出文件路径
   */
  async exportLogs(filePath = null) {
    const exportPath = filePath || path.join(
      this._config.errorLogDir,
      `error-export-${Date.now()}.json`
    );

    const data = {
      exportedAt: new Date().toISOString(),
      statistics: this._statistics,
      errors: this._errorHistory
    };

    await fs.writeFile(exportPath, JSON.stringify(data, null, 2), 'utf-8');
    
    this._log('info', `Error logs exported: ${exportPath}`);
    
    return exportPath;
  }

  /**
   * 创建错误记录
   * @private
   * @param {Error} error - 错误对象
   * @param {Object} context - 上下文
   * @returns {ErrorRecord}
   */
  _createErrorRecord(error, context) {
    const id = `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return {
      id,
      error,
      message: error.message,
      stack: error.stack,
      category: context.category || ErrorCategory.UNKNOWN,
      severity: context.severity || this._determineSeverity(error),
      stage: context.stage || null,
      timestamp: Date.now(),
      retryCount: context.retryCount || 0,
      recovered: false,
      context: {
        ...context.metadata,
        stage: context.stage
      }
    };
  }

  /**
   * 确定错误严重程度
   * @private
   * @param {Error} error - 错误
   * @returns {ErrorSeverity}
   */
  _determineSeverity(error) {
    if (error.name === 'FatalError' || error.name === 'AssertionError') {
      return ErrorSeverity.FATAL;
    }
    if (error.name === 'TypeError' || error.name === 'ReferenceError') {
      return ErrorSeverity.ERROR;
    }
    if (error.name === 'TimeoutError') {
      return ErrorSeverity.WARNING;
    }
    return ErrorSeverity.ERROR;
  }

  /**
   * 分类错误
   * @private
   * @param {Error} error - 错误
   * @returns {ErrorCategory}
   */
  _classifyError(error) {
    // 使用自定义分类器
    if (this._config.classifier) {
      return this._config.classifier(error);
    }

    const message = error.message.toLowerCase();
    const name = error.name;

    // 网络错误
    if (message.includes('network') || 
        message.includes('timeout') || 
        message.includes('econnrefused') ||
        message.includes('enotfound')) {
      return ErrorCategory.NETWORK;
    }

    // 超时错误
    if (name.includes('Timeout') || message.includes('timeout')) {
      return ErrorCategory.TIMEOUT;
    }

    // 权限错误
    if (message.includes('permission') || 
        message.includes('eacces') ||
        message.includes('forbidden')) {
      return ErrorCategory.PERMISSION;
    }

    // 资源错误
    if (message.includes('enoent') || 
        message.includes('not found') ||
        message.includes('memory') ||
        message.includes('disk')) {
      return ErrorCategory.RESOURCE;
    }

    // 验证错误
    if (message.includes('invalid') || 
        message.includes('validation') ||
        message.includes('required')) {
      return ErrorCategory.VALIDATION;
    }

    return ErrorCategory.UNKNOWN;
  }

  /**
   * 是否应该重试
   * @private
   * @param {Error} error - 错误
   * @returns {boolean}
   */
  _shouldRetry(error) {
    const category = this._classifyError(error);
    
    // 可重试的分类
    const retryableCategories = [
      ErrorCategory.NETWORK,
      ErrorCategory.TIMEOUT,
      ErrorCategory.TRANSIENT
    ];

    return retryableCategories.includes(category);
  }

  /**
   * 计算重试延迟
   * @private
   * @param {number} retryCount - 重试次数
   * @param {RetryConfig} config - 重试配置
   * @returns {number}
   */
  _calculateDelay(retryCount, config) {
    if (!config.exponentialBackoff) {
      return config.initialDelayMs;
    }

    // 指数退避 + 随机抖动
    const baseDelay = config.initialDelayMs * Math.pow(config.backoffMultiplier, retryCount - 1);
    const jitter = Math.random() * 1000; // 0-1000ms 随机抖动
    const delay = Math.min(baseDelay + jitter, config.maxDelayMs);

    return Math.floor(delay);
  }

  /**
   * 带超时的执行
   * @private
   * @template T
   * @param {Function} operation - 操作
   * @param {number} timeoutMs - 超时时间
   * @returns {Promise<T>}
   */
  async _executeWithTimeout(operation, timeoutMs) {
    if (!timeoutMs) {
      return operation();
    }

    return Promise.race([
      operation(),
      new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Operation timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      })
    ]);
  }

  /**
   * 添加到历史
   * @private
   * @param {ErrorRecord} record - 错误记录
   */
  _addToHistory(record) {
    this._errorHistory.push(record);
    this._errorCount++;

    // 限制历史记录数量
    if (this._errorHistory.length > this._config.maxErrorHistory) {
      this._errorHistory = this._errorHistory.slice(-this._config.maxErrorHistory);
    }
  }

  /**
   * 更新统计
   * @private
   * @param {ErrorRecord} record - 错误记录
   */
  _updateStatistics(record) {
    this._statistics.total++;
    this._statistics.byCategory[record.category] = 
      (this._statistics.byCategory[record.category] || 0) + 1;
    this._statistics.bySeverity[record.severity] = 
      (this._statistics.bySeverity[record.severity] || 0) + 1;
  }

  /**
   * 触发告警
   * @private
   * @param {ErrorRecord} record - 错误记录
   */
  async _triggerAlert(record) {
    // 只给严重错误发告警
    if (![ErrorSeverity.ERROR, ErrorSeverity.CRITICAL, ErrorSeverity.FATAL].includes(record.severity)) {
      return;
    }

    const alert = {
      level: record.severity,
      message: record.message,
      category: record.category,
      stage: record.stage,
      timestamp: record.timestamp,
      errorId: record.id
    };

    this.emit('alert', alert);

    if (this._config.alertHandler) {
      try {
        await this._config.alertHandler(alert);
      } catch (error) {
        this._log('error', 'Alert handler failed', { error: error.message });
      }
    }
  }

  /**
   * 确保错误目录存在
   * @private
   * @async
   */
  async _ensureErrorDir() {
    try {
      await fs.mkdir(this._config.errorLogDir, { recursive: true });
    } catch (error) {
      throw new Error(`Failed to create error directory: ${error.message}`);
    }
  }

  /**
   * 持久化错误
   * @private
   * @param {ErrorRecord} record - 错误记录
   */
  async _persistError(record) {
    try {
      const fileName = `${record.id}.json`;
      const filePath = path.join(this._config.errorLogDir, fileName);

      const data = {
        ...record,
        error: {
          name: record.error.name,
          message: record.error.message,
          stack: record.error.stack
        }
      };

      await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      this._log('error', 'Failed to persist error', { error: error.message });
    }
  }

  /**
   * 加载错误历史
   * @private
   * @async
   */
  async _loadErrorHistory() {
    // 可以加载之前的错误历史，如果需要
    this._log('info', 'Error history loading (stub)');
  }

  /**
   * 睡眠
   * @private
   * @param {number} ms - 毫秒
   * @returns {Promise<void>}
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 记录日志
   * @private
   * @param {string} level - 级别
   * @param {string} message - 消息
   * @param {Object} [meta] - 元数据
   */
  _log(level, message, meta = {}) {
    const logEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      module: 'ErrorHandler',
      ...meta
    };

    const logFn = level === 'error' ? console.error : 
                  level === 'warn' ? console.warn : console.log;
    logFn(`[ErrorHandler] ${message}`, meta);

    this.emit('log', logEntry);
  }
}

/**
 * 重试耗尽错误
 * @class RetryExhaustedError
 * @extends Error
 */
export class RetryExhaustedError extends Error {
  /**
   * @constructor
   * @param {string} message - 消息
   * @param {string} operationId - 操作ID
   * @param {number} retryCount - 重试次数
   * @param {Error} lastError - 最后的错误
   */
  constructor(message, operationId, retryCount, lastError) {
    super(message);
    this.name = 'RetryExhaustedError';
    this.operationId = operationId;
    this.retryCount = retryCount;
    this.lastError = lastError;
    this.timestamp = Date.now();
  }
}

/**
 * 可恢复错误
 * @class RecoverableError
 * @extends Error
 */
export class RecoverableError extends Error {
  /**
   * @constructor
   * @param {string} message - 消息
   * @param {string} [recoveryHint] - 恢复提示
   */
  constructor(message, recoveryHint = null) {
    super(message);
    this.name = 'RecoverableError';
    this.recoveryHint = recoveryHint;
    this.category = ErrorCategory.RECOVERABLE;
  }
}

/**
 * 创建错误处理器的工厂函数
 * @param {ErrorHandlerConfig} config - 配置
 * @returns {ErrorHandler}
 */
export function createErrorHandler(config = {}) {
  return new ErrorHandler(config);
}

/**
 * 创建预配置的错误处理器（生产环境）
 * @returns {ErrorHandler}
 */
export function createProductionErrorHandler() {
  return new ErrorHandler({
    retry: {
      maxRetries: 5,
      initialDelayMs: 1000,
      maxDelayMs: 60000,
      backoffMultiplier: 2,
      exponentialBackoff: true
    },
    enablePersistence: true,
    enableAlerts: true,
    enableRollback: true
  });
}

/**
 * 创建预配置的错误处理器（开发环境）
 * @returns {ErrorHandler}
 */
export function createDevelopmentErrorHandler() {
  return new ErrorHandler({
    retry: {
      maxRetries: 2,
      initialDelayMs: 500,
      maxDelayMs: 5000,
      exponentialBackoff: false
    },
    enablePersistence: false,
    enableAlerts: false,
    enableRollback: true
  });
}

export default ErrorHandler;
