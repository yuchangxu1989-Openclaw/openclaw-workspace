/**
 * LEP (Local Execution Protocol) Executor - Core Implementation
 * 
 * 统一韧性任务执行引擎，整合现有分散的韧性能力
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

// 复用 parallel-subagent 的韧性核心
const { 
  CircuitBreaker, 
  RetryPolicy,
  AgentPool
} = require('../../../parallel-subagent/index.js');

// 适配器：RetryPolicy → RetryHandler 接口
class RetryHandler {
  constructor(options = {}) {
    this.policy = new RetryPolicy({
      maxRetries: options.maxRetries || 3,
      baseDelay: options.baseDelay || 1000,
      maxDelay: options.maxDelay || 30000,
      backoffMultiplier: options.backoff === 'exponential' ? 2 : 1
    });
  }

  async execute(fn, context = {}) {
    return this.policy.execute(fn, context);
  }
}

// 适配器：AgentPool → ConnectionPool 接口
class ConnectionPool {
  constructor(options = {}) {
    this.pool = new AgentPool({
      minSize: options.minSize || 2,
      maxSize: options.maxSize || 10,
      maxUses: options.maxUses || 100
    });
  }

  async acquire() {
    return this.pool.acquire();
  }

  release(agent) {
    return this.pool.release(agent);
  }

  getStats() {
    return this.pool.getStats();
  }
}

// 超时管理器（独立实现）
class TimeoutManager {
  constructor(options = {}) {
    this.defaultTimeout = options.default || 60000;
  }

  async withTimeout(promise, timeoutMs) {
    const timeout = timeoutMs || this.defaultTimeout;
    return Promise.race([
      promise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`Timeout after ${timeout}ms`)), timeout)
      )
    ]);
  }
}

/**
 * LEP 执行器主类
 */
class LEPExecutor extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      // 重试策略
      retryPolicy: {
        maxRetries: 3,
        backoff: 'exponential',
        baseDelay: 1000,
        maxDelay: 30000,
        ...options.retryPolicy
      },
      // 熔断策略
      circuitBreaker: {
        failureThreshold: 5,
        resetTimeout: 30000,
        ...options.circuitBreaker
      },
      // 超时策略
      timeout: {
        default: 60000,
        ...options.timeout
      },
      // WAL配置
      wal: {
        enabled: true,
        path: path.join(__dirname, '../.lep-wal'),
        ...options.wal
      },
      // 指标配置
      metrics: {
        enabled: true,
        ...options.metrics
      }
    };

    // 初始化韧性组件
    this.resilience = new ResilienceCore(this.options);
    
    // 初始化规则引擎
    this.ruleEngine = new ISCRuleEngine(this);
    
    // 初始化可观测组件
    this.observability = new ObservabilityManager(this.options);
    
    // 初始化恢复层桥接器
    this.recoveryBridges = new RecoveryBridges();
    
    // 执行状态缓存
    this.executionCache = new Map();
    
    // 初始化WAL
    if (this.options.wal.enabled) {
      this._initWAL();
    }
  }

  /**
   * 统一执行入口
   * @param {ExecutionTask} task - 执行任务配置
   * @returns {Promise<ExecutionResult>} 执行结果
   */
  async execute(task) {
    const executionId = this._generateId();
    const startTime = Date.now();
    
    // 构建执行上下文
    const context = {
      executionId,
      task,
      startTime,
      status: 'pending',
      attempt: 0,
      maxAttempts: this.options.retryPolicy.maxRetries + 1
    };

    // 1. 记录开始（WAL）
    await this._logStart(context);
    
    try {
      // 2. 前置检查
      await this._preExecutionChecks(context);
      
      // 3. 执行（带重试）
      const result = await this._executeWithRetry(context);
      
      // 4. 记录成功
      await this._logSuccess(context, result);
      
      // 5. 触发成功事件
      this.emit('execution:success', { executionId, result, duration: Date.now() - startTime });
      
      return {
        executionId,
        status: 'success',
        result: result.data,
        duration: Date.now() - startTime,
        attempts: context.attempt
      };
      
    } catch (error) {
      // 6. 记录失败
      await this._logFailure(context, error);
      
      // 7. 触发恢复流程
      await this._triggerRecovery(context, error);
      
      // 8. 触发失败事件
      this.emit('execution:failure', { executionId, error, duration: Date.now() - startTime });
      
      throw new ExecutionError(error.message, {
        executionId,
        taskType: task.type,
        attempts: context.attempt,
        originalError: error
      });
    }
  }

  /**
   * 执行ISC规则
   * @param {string} ruleId - 规则ID (如 N016, N017, N018)
   * @param {Object} context - 执行上下文
   * @returns {Promise<ExecutionResult>}
   */
  async executeRule(ruleId, context = {}) {
    return await this.execute({
      type: 'isc_rule',
      ruleId,
      context
    });
  }

  /**
   * 定时调度任务
   * @param {string} cron - cron表达式
   * @param {ExecutionTask} task - 执行任务配置
   * @param {Object} options - 调度选项
   * @returns {string} 调度ID
   */
  schedule(cron, task, options = {}) {
    const scheduleId = this._generateId('sched');
    
    // 注册到调度器
    const scheduler = require('./scheduler');
    scheduler.register({
      id: scheduleId,
      cron,
      task,
      options
    });
    
    this.emit('schedule:registered', { scheduleId, cron, task });
    
    return scheduleId;
  }

  /**
   * 查询执行状态
   * @param {string} executionId - 执行ID
   * @returns {Promise<ExecutionStatus>}
   */
  async query(executionId) {
    // 1. 检查缓存
    if (this.executionCache.has(executionId)) {
      return this.executionCache.get(executionId);
    }
    
    // 2. 查询WAL
    const walEntry = await this.observability.wal.query(executionId);
    if (walEntry) {
      return {
        executionId,
        status: walEntry.status,
        startTime: walEntry.startTime,
        endTime: walEntry.endTime,
        duration: walEntry.endTime - walEntry.startTime,
        result: walEntry.result
      };
    }
    
    return null;
  }

  /**
   * 健康检查
   * @returns {Promise<HealthStatus>}
   */
  async health() {
    const checks = await Promise.all([
      this.resilience.health(),
      this.ruleEngine.health(),
      this.observability.health()
    ]);
    
    const allHealthy = checks.every(c => c.healthy);
    
    return {
      healthy: allHealthy,
      status: allHealthy ? 'healthy' : 'unhealthy',
      checks: {
        resilience: checks[0],
        ruleEngine: checks[1],
        observability: checks[2]
      },
      timestamp: Date.now()
    };
  }

  /**
   * 获取执行统计
   * @param {Object} filters - 过滤条件
   * @returns {ExecutionStats}
   */
  getStats(filters = {}) {
    return this.observability.metrics.getStats(filters);
  }

  // ============ 私有方法 ============

  async _preExecutionChecks(context) {
    // 1. 熔断检查
    if (!this.resilience.circuitBreaker.canExecute(context.task.type)) {
      throw new CircuitBreakerOpenError(`Circuit breaker open for task type: ${context.task.type}`);
    }
    
    // 2. 并发限制检查
    const activeExecutions = Array.from(this.executionCache.values())
      .filter(e => e.status === 'running').length;
    
    const maxConcurrent = this.options.maxConcurrent || 100;
    if (activeExecutions >= maxConcurrent) {
      throw new ConcurrencyLimitError(`Max concurrent executions (${maxConcurrent}) reached`);
    }
  }

  async _executeWithRetry(context) {
    let lastError;
    
    for (context.attempt = 1; context.attempt <= context.maxAttempts; context.attempt++) {
      try {
        context.status = 'running';
        this.executionCache.set(context.executionId, context);
        
        const result = await this._executeOnce(context);
        
        // 记录成功到熔断器
        this.resilience.circuitBreaker.recordSuccess(context.task.type);
        
        return result;
        
      } catch (error) {
        lastError = error;
        
        // 记录失败到熔断器
        this.resilience.circuitBreaker.recordFailure(context.task.type);
        
        // 判断是否需要重试
        if (context.attempt < context.maxAttempts && this._isRetryable(error)) {
          const delay = this._calculateBackoff(context.attempt - 1);
          this.emit('execution:retry', { 
            executionId: context.executionId, 
            attempt: context.attempt,
            nextAttempt: context.attempt + 1,
            delay 
          });
          await this._sleep(delay);
        } else {
          break;
        }
      }
    }
    
    throw lastError;
  }

  async _executeOnce(context) {
    const { task } = context;
    
    switch (task.type) {
      case 'isc_rule':
        return await this.ruleEngine.executeRule(task.ruleId, task.context);
        
      case 'function':
        return await this._executeFunction(task);
        
      case 'shell':
        return await this._executeShell(task);
        
      case 'http':
        return await this._executeHttp(task);
        
      default:
        throw new Error(`Unknown task type: ${task.type}`);
    }
  }

  async _executeFunction(task) {
    const { fn, args = [], timeout } = task;
    
    return await this.resilience.timeout.execute(
      () => fn(...args),
      timeout || this.options.timeout.default
    );
  }

  async _executeShell(task) {
    const { command, cwd, env, timeout } = task;
    const { exec } = require('child_process');
    const util = require('util');
    const execPromise = util.promisify(exec);
    
    return await this.resilience.timeout.execute(
      () => execPromise(command, { cwd, env }),
      timeout || this.options.timeout.default
    );
  }

  async _executeHttp(task) {
    const { url, method = 'GET', headers, body, timeout } = task;
    const fetch = require('node-fetch');
    
    return await this.resilience.timeout.execute(
      () => fetch(url, { method, headers, body }),
      timeout || this.options.timeout.default
    );
  }

  async _triggerRecovery(context, error) {
    // 根据错误类型和任务类型选择合适的恢复策略
    const recoveryStrategy = this._determineRecoveryStrategy(context, error);
    
    if (recoveryStrategy) {
      try {
        this.emit('recovery:triggered', {
          executionId: context.executionId,
          strategy: recoveryStrategy.type
        });
        
        await recoveryStrategy.execute(context, error);
        
        this.emit('recovery:success', {
          executionId: context.executionId,
          strategy: recoveryStrategy.type
        });
      } catch (recoveryError) {
        this.emit('recovery:failure', {
          executionId: context.executionId,
          strategy: recoveryStrategy.type,
          error: recoveryError
        });
      }
    }
  }

  _determineRecoveryStrategy(context, error) {
    const { task } = context;
    
    // 根据任务类型和错误类型选择恢复策略
    if (task.type === 'isc_rule') {
      // ISC规则失败，可能触发其他规则
      return null; // 规则失败通常不自动恢复
    }
    
    // 触发全局自主决策流水线
    return {
      type: 'auto_decision_pipeline',
      execute: async (ctx, err) => {
        await this.recoveryBridges.autoDecisionPipeline.triggerAutoFix({
          taskType: ctx.task.type,
          error: err.message,
          executionId: ctx.executionId,
          timestamp: Date.now()
        });
      }
    };
  }

  _isRetryable(error) {
    // 判断错误是否可重试
    const retryableErrors = [
      'ECONNRESET',
      'ETIMEDOUT',
      'ECONNREFUSED',
      'ENOTFOUND',
      'EAI_AGAIN'
    ];
    
    if (error.code && retryableErrors.includes(error.code)) {
      return true;
    }
    
    if (error.message && error.message.includes('timeout')) {
      return true;
    }
    
    return false;
  }

  _calculateBackoff(attempt) {
    const { backoff, baseDelay, maxDelay } = this.options.retryPolicy;
    
    if (backoff === 'fixed') {
      return baseDelay;
    }
    
    // 指数退避
    const delay = baseDelay * Math.pow(2, attempt);
    
    // 添加抖动
    const jitter = delay * 0.1 * (Math.random() - 0.5);
    
    return Math.min(delay + jitter, maxDelay);
  }

  _generateId(prefix = 'lep') {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 9);
    return `${prefix}_${timestamp}_${random}`;
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // WAL相关
  async _logStart(context) {
    await this.observability.wal.append({
      type: 'execution_start',
      executionId: context.executionId,
      task: context.task,
      startTime: context.startTime,
      status: 'started'
    });
  }

  async _logSuccess(context, result) {
    context.status = 'success';
    context.endTime = Date.now();
    
    await this.observability.wal.append({
      type: 'execution_success',
      executionId: context.executionId,
      endTime: context.endTime,
      duration: context.endTime - context.startTime,
      attempts: context.attempt,
      result: result.data
    });
    
    // 记录指标
    this.observability.metrics.record(context.task.type, 'success', 
      context.endTime - context.startTime);
  }

  async _logFailure(context, error) {
    context.status = 'failed';
    context.endTime = Date.now();
    
    await this.observability.wal.append({
      type: 'execution_failure',
      executionId: context.executionId,
      endTime: context.endTime,
      duration: context.endTime - context.startTime,
      attempts: context.attempt,
      error: {
        message: error.message,
        code: error.code,
        stack: error.stack
      }
    });
    
    // 记录指标
    this.observability.metrics.record(context.task.type, 'failure',
      context.endTime - context.startTime);
  }

  _initWAL() {
    const walPath = this.options.wal.path;
    if (!fs.existsSync(walPath)) {
      fs.mkdirSync(walPath, { recursive: true });
    }
  }
}

/**
 * 韧性核心 - 复用 parallel-subagent 的实现
 */
class ResilienceCore {
  constructor(options) {
    this.retry = new RetryHandler(options.retryPolicy);
    this.circuitBreaker = new CircuitBreaker(options.circuitBreaker);
    this.timeout = new TimeoutManager(options.timeout);
  }

  async health() {
    return {
      healthy: true,
      circuitBreaker: this.circuitBreaker.getState(),
      timestamp: Date.now()
    };
  }
}

/**
 * ISC规则引擎
 */
class ISCRuleEngine {
  constructor(executor) {
    this.executor = executor;
    this.executors = new Map();
    this._loadExecutors();
  }

  _loadExecutors() {
    // 加载N规则执行器
    const { N016RepairLoopExecutor } = require('./executors/n016-repair-loop');
    const { N017RecurringPatternExecutor } = require('./executors/n017-recurring-pattern');
    const { N018GlobalAlignmentExecutor } = require('./executors/n018-global-alignment');
    
    this.executors.set('N016', new N016RepairLoopExecutor(this.executor));
    this.executors.set('N017', new N017RecurringPatternExecutor(this.executor));
    this.executors.set('N018', new N018GlobalAlignmentExecutor(this.executor));
  }

  async executeRule(ruleId, context) {
    const executor = this.executors.get(ruleId);
    if (!executor) {
      throw new Error(`Unknown ISC rule: ${ruleId}`);
    }

    return await executor.execute(context);
  }

  async loadRule(ruleId) {
    const rulePath = path.join(__dirname, '../../isc-core/rules', `*${ruleId}*.json`);
    const glob = require('glob');
    const files = glob.sync(rulePath);
    
    if (files.length === 0) {
      throw new Error(`ISC rule not found: ${ruleId}`);
    }
    
    return JSON.parse(fs.readFileSync(files[0], 'utf8'));
  }

  async health() {
    return {
      healthy: true,
      loadedExecutors: Array.from(this.executors.keys()),
      timestamp: Date.now()
    };
  }
}

/**
 * 可观测性管理器
 */
class ObservabilityManager {
  constructor(options) {
    this.options = options;
    this.wal = new WALLogger(options.wal);
    this.metrics = new MetricsAggregator();
  }

  async health() {
    return {
      healthy: true,
      wal: this.wal.isHealthy(),
      metrics: this.metrics.isHealthy(),
      timestamp: Date.now()
    };
  }
}

/**
 * WAL日志器
 */
class WALLogger {
  constructor(options) {
    this.options = options;
    this.walPath = options.path;
    this.sequence = 0;
    this._init();
  }

  _init() {
    if (!fs.existsSync(this.walPath)) {
      fs.mkdirSync(this.walPath, { recursive: true });
    }
    
    // 恢复序列号
    this._recoverSequence();
  }

  _recoverSequence() {
    try {
      const files = fs.readdirSync(this.walPath);
      const maxSeq = files
        .filter(f => f.endsWith('.wal'))
        .map(f => parseInt(f.split('_')[1], 10))
        .filter(n => !isNaN(n))
        .reduce((max, n) => Math.max(max, n), 0);
      this.sequence = maxSeq;
    } catch (e) {
      this.sequence = 0;
    }
  }

  async append(event) {
    this.sequence++;
    
    const entry = {
      ...event,
      _wal: {
        sequence: this.sequence,
        timestamp: Date.now()
      }
    };
    
    // 同步写入保证不丢失
    const walFile = path.join(this.walPath, `wal_${Math.floor(this.sequence / 1000)}.wal`);
    fs.appendFileSync(walFile, JSON.stringify(entry) + '\n');
    
    return entry;
  }

  async query(executionId) {
    // 从WAL中查询执行记录
    const files = fs.readdirSync(this.walPath).filter(f => f.endsWith('.wal'));
    
    for (const file of files.sort().reverse()) {
      const content = fs.readFileSync(path.join(this.walPath, file), 'utf8');
      const lines = content.split('\n').filter(Boolean);
      
      for (const line of lines.reverse()) {
        try {
          const entry = JSON.parse(line);
          if (entry.executionId === executionId) {
            return entry;
          }
        } catch (e) {
          // 忽略解析错误
        }
      }
    }
    
    return null;
  }

  isHealthy() {
    return fs.existsSync(this.walPath);
  }
}

/**
 * 指标聚合器
 */
class MetricsAggregator {
  constructor() {
    this.metrics = new Map();
    this.startTime = Date.now();
  }

  record(taskType, status, duration) {
    if (!this.metrics.has(taskType)) {
      this.metrics.set(taskType, {
        total: 0,
        success: 0,
        failure: 0,
        totalDuration: 0,
        minDuration: Infinity,
        maxDuration: 0
      });
    }
    
    const metric = this.metrics.get(taskType);
    metric.total++;
    metric[status]++;
    metric.totalDuration += duration;
    metric.minDuration = Math.min(metric.minDuration, duration);
    metric.maxDuration = Math.max(metric.maxDuration, duration);
  }

  getStats(filters = {}) {
    const stats = {};
    
    for (const [taskType, metric] of this.metrics) {
      if (filters.taskType && taskType !== filters.taskType) {
        continue;
      }
      
      stats[taskType] = {
        ...metric,
        avgDuration: metric.totalDuration / metric.total,
        successRate: metric.success / metric.total
      };
    }
    
    return {
      uptime: Date.now() - this.startTime,
      taskTypes: Object.keys(stats).length,
      stats
    };
  }

  isHealthy() {
    return true;
  }
}

/**
 * 恢复层桥接器
 */
class RecoveryBridges {
  constructor() {
    this.autoDecisionPipeline = {
      triggerAutoFix: async (context) => {
        // 动态加载避免循环依赖
        const pipeline = require('../lto-core/global-auto-decision-pipeline');
        await pipeline.triggerAutoFix(context);
      }
    };
  }
}

// 错误类
class ExecutionError extends Error {
  constructor(message, context) {
    super(message);
    this.name = 'ExecutionError';
    this.executionId = context.executionId;
    this.taskType = context.taskType;
    this.attempts = context.attempts;
    this.originalError = context.originalError;
  }
}

class CircuitBreakerOpenError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CircuitBreakerOpenError';
    this.code = 'CIRCUIT_BREAKER_OPEN';
  }
}

class ConcurrencyLimitError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConcurrencyLimitError';
    this.code = 'CONCURRENCY_LIMIT';
  }
}

module.exports = {
  LEPExecutor,
  ExecutionError,
  CircuitBreakerOpenError,
  ConcurrencyLimitError
};
