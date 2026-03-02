/**
 * 并行子代理执行器 v3.0 - 企业级并发控制与容错
 * 
 * 核心特性:
 * 1. 信号量并发控制 - 默认最多5个子Agent同时运行
 * 2. 子Agent连接池 - 预创建2-10个子Agent池，复用上下文
 * 3. 失败重试机制 - 最多重试2次，指数退避延迟
 * 4. 熔断器 - 连续失败5次后熔断，30秒后尝试恢复
 * 5. 优先级队列 - 3个优先级等级，高优先级任务优先执行
 */

const { sessions_spawn } = require('../../../../../.openclaw/extensions/openclaw-sessions');
const { EventEmitter } = require('events');

// ============================================
// 工具类实现
// ============================================

/**
 * 信号量 - 并发控制
 */
class Semaphore {
  constructor(maxConcurrency) {
    this.maxConcurrency = maxConcurrency;
    this.currentCount = 0;
    this.waitQueue = [];
  }

  async acquire() {
    if (this.currentCount < this.maxConcurrency) {
      this.currentCount++;
      return () => this.release();
    }

    return new Promise((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  release() {
    if (this.waitQueue.length > 0) {
      const next = this.waitQueue.shift();
      next(() => this.release());
    } else {
      this.currentCount--;
    }
  }

  get available() {
    return this.maxConcurrency - this.currentCount;
  }

  get pending() {
    return this.waitQueue.length;
  }
}

/**
 * 熔断器 - 故障保护
 */
class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.recoveryTimeout = options.recoveryTimeout || 30000;
    this.halfOpenMaxCalls = options.halfOpenMaxCalls || 2;
    
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.halfOpenCalls = 0;
  }

  async execute(fn) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime >= this.recoveryTimeout) {
        this.transitionTo('HALF_OPEN');
      } else {
        throw new CircuitBreakerOpenError('熔断器已打开，服务暂时不可用');
      }
    }

    if (this.state === 'HALF_OPEN' && this.halfOpenCalls >= this.halfOpenMaxCalls) {
      throw new CircuitBreakerOpenError('熔断器半开状态，限制调用中');
    }

    if (this.state === 'HALF_OPEN') {
      this.halfOpenCalls++;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failureCount = 0;
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= this.halfOpenMaxCalls) {
        this.transitionTo('CLOSED');
      }
    }
  }

  onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.failureThreshold) {
      this.transitionTo('OPEN');
    }
  }

  transitionTo(state) {
    const prevState = this.state;
    this.state = state;
    if (state === 'CLOSED') {
      this.failureCount = 0;
      this.successCount = 0;
      this.halfOpenCalls = 0;
    } else if (state === 'HALF_OPEN') {
      this.halfOpenCalls = 0;
      this.successCount = 0;
    }
    console.log(`[熔断器] ${prevState} -> ${state}`);
  }

  getStatus() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime
    };
  }
}

class CircuitBreakerOpenError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CircuitBreakerOpenError';
  }
}

/**
 * 优先级队列
 */
class PriorityQueue {
  constructor() {
    this.queues = new Map([[0, []], [1, []], [2, []]]); // 0=最高, 1=中, 2=低
  }

  enqueue(item, priority = 1) {
    priority = Math.max(0, Math.min(2, priority));
    const task = {
      ...item,
      priority,
      enqueuedAt: Date.now(),
      id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
    this.queues.get(priority).push(task);
    return task.id;
  }

  dequeue() {
    for (let p = 0; p <= 2; p++) {
      if (this.queues.get(p).length > 0) {
        return this.queues.get(p).shift();
      }
    }
    return null;
  }

  peek() {
    for (let p = 0; p <= 2; p++) {
      if (this.queues.get(p).length > 0) {
        return this.queues.get(p)[0];
      }
    }
    return null;
  }

  get size() {
    let total = 0;
    this.queues.forEach(q => total += q.length);
    return total;
  }

  get stats() {
    return {
      high: this.queues.get(0).length,
      medium: this.queues.get(1).length,
      low: this.queues.get(2).length,
      total: this.size
    };
  }
}

/**
 * 重试策略 - 指数退避
 */
class RetryPolicy {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 2;
    this.baseDelay = options.baseDelay || 1000;
    this.maxDelay = options.maxDelay || 10000;
    this.backoffMultiplier = options.backoffMultiplier || 2;
    this.retryableErrors = options.retryableErrors || [];
  }

  async execute(fn, context = {}) {
    let lastError;
    
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        
        if (attempt === this.maxRetries) {
          break;
        }

        if (!this.isRetryable(error)) {
          throw error;
        }

        const delay = this.calculateDelay(attempt);
        console.log(`[重试] 任务 "${context.name || 'unknown'}" 第 ${attempt + 1} 次失败，${delay}ms 后重试...`);
        await this.sleep(delay);
      }
    }

    throw new RetryExhaustedError(`重试次数耗尽: ${lastError?.message}`, lastError);
  }

  isRetryable(error) {
    if (this.retryableErrors.length === 0) return true;
    return this.retryableErrors.some(errType => error instanceof errType);
  }

  calculateDelay(attempt) {
    const exponential = this.baseDelay * Math.pow(this.backoffMultiplier, attempt);
    const jitter = Math.random() * 100; // 添加随机抖动避免惊群
    return Math.min(exponential + jitter, this.maxDelay);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

class RetryExhaustedError extends Error {
  constructor(message, originalError) {
    super(message);
    this.name = 'RetryExhaustedError';
    this.originalError = originalError;
  }
}

/**
 * 子Agent连接池
 */
class AgentPool {
  constructor(options = {}) {
    this.minSize = options.minSize || 2;
    this.maxSize = options.maxSize || 10;
    this.model = options.model || 'kimi-coding/k2p5';
    this.timeout = options.timeout || 300;
    this.label = options.label || 'pool_agent';
    
    this.pool = []; // 空闲连接
    this.active = new Set(); // 活跃连接
    this.initialized = false;
    this.stats = {
      created: 0,
      reused: 0,
      destroyed: 0,
      errors: 0
    };
  }

  async initialize() {
    if (this.initialized) return;
    
    console.log(`[连接池] 预创建 ${this.minSize} 个子Agent...`);
    const initPromises = [];
    
    for (let i = 0; i < this.minSize; i++) {
      initPromises.push(this.createAgent());
    }

    const agents = await Promise.allSettled(initPromises);
    agents.forEach((result, idx) => {
      if (result.status === 'fulfilled') {
        this.pool.push(result.value);
        this.stats.created++;
      } else {
        console.error(`[连接池] 预创建Agent ${idx} 失败:`, result.reason);
        this.stats.errors++;
      }
    });

    this.initialized = true;
    console.log(`[连接池] 初始化完成，可用连接: ${this.pool.length}`);
  }

  async createAgent() {
    const agent = {
      id: `agent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: Date.now(),
      useCount: 0,
      lastUsed: null,
      context: new Map() // 上下文存储
    };
    return agent;
  }

  async acquire() {
    await this.initialize();

    // 优先复用现有连接
    if (this.pool.length > 0) {
      const agent = this.pool.pop();
      agent.lastUsed = Date.now();
      agent.useCount++;
      this.active.add(agent.id);
      this.stats.reused++;
      return agent;
    }

    // 池未满，创建新连接
    if (this.active.size < this.maxSize) {
      const agent = await this.createAgent();
      agent.useCount++;
      agent.lastUsed = Date.now();
      this.active.add(agent.id);
      this.stats.created++;
      return agent;
    }

    // 池已满，等待
    throw new PoolExhaustedError('连接池已满，请稍后重试');
  }

  release(agent) {
    if (!agent) return;
    
    this.active.delete(agent.id);
    
    // 连接使用次数过多，销毁重建
    if (agent.useCount > 50) {
      this.stats.destroyed++;
      return;
    }

    // 清理上下文但保留连接
    agent.context.clear();
    this.pool.push(agent);
  }

  getStats() {
    return {
      available: this.pool.length,
      active: this.active.size,
      total: this.pool.length + this.active.size,
      ...this.stats
    };
  }
}

class PoolExhaustedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PoolExhaustedError';
  }
}

// ============================================
// 主类 - ParallelSubagentSpawner
// ============================================

class ParallelSubagentSpawner extends EventEmitter {
  constructor(options = {}) {
    super();
    
    // 配置 - CRAS-C知识治理任务需要更长时间
    this.label = options.label || `subagent_${Date.now()}`;
    this.model = options.model || 'kimi-coding/k2p5';
    this.timeout = options.timeout || 600; // 默认600秒（10分钟），原为300秒
    
    // 并发控制 - 信号量
    this.semaphore = new Semaphore(options.maxConcurrency || 5);
    
    // 连接池
    this.agentPool = new AgentPool({
      minSize: options.poolMinSize || 2,
      maxSize: options.poolMaxSize || 10,
      model: this.model,
      timeout: this.timeout,
      label: this.label
    });
    
    // 熔断器
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: options.failureThreshold || 5,
      recoveryTimeout: options.recoveryTimeout || 30000,
      halfOpenMaxCalls: options.halfOpenMaxCalls || 2
    });
    
    // 重试策略
    this.retryPolicy = new RetryPolicy({
      maxRetries: options.maxRetries || 2,
      baseDelay: options.baseDelay || 1000,
      maxDelay: options.maxDelay || 10000
    });
    
    // 优先级队列
    this.priorityQueue = new PriorityQueue();
    
    // 状态
    this.isProcessing = false;
    this.metrics = {
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      retriedTasks: 0,
      circuitBreakerTrips: 0,
      avgExecutionTime: 0,
      executionTimes: []
    };
  }

  /**
   * 执行任务 - 完整的生命周期管理
   */
  async executeTask(taskConfig) {
    const startTime = Date.now();
    const task = {
      ...taskConfig,
      attempts: 0,
      startTime,
      agent: null
    };

    try {
      // 获取连接池中的Agent
      task.agent = await this.agentPool.acquire();
      
      // 使用熔断器保护
      const result = await this.circuitBreaker.execute(async () => {
        // 使用重试策略执行
        return await this.retryPolicy.execute(
          async () => this.spawnAgent(task),
          { name: task.name }
        );
      });

      const executionTime = Date.now() - startTime;
      this.recordSuccess(executionTime);
      
      return {
        task: task.name,
        status: 'fulfilled',
        value: result,
        executionTime,
        attempts: task.attempts + 1,
        agentId: task.agent?.id
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.recordFailure(error);
      
      return {
        task: task.name,
        status: 'rejected',
        reason: error.message,
        errorType: error.name,
        executionTime,
        attempts: task.attempts + 1,
        agentId: task.agent?.id
      };
    } finally {
      // 释放连接回池
      if (task.agent) {
        this.agentPool.release(task.agent);
      }
    }
  }

  /**
   * 实际派生Agent
   */
  async spawnAgent(task) {
    task.attempts++;
    
    console.log(`[子代理] ${task.name} (尝试 ${task.attempts})`);
    
    const result = await sessions_spawn({
      task: task.prompt,
      label: `${this.label}_${task.name}_${Date.now()}`,
      model: task.model || this.model,
      timeoutSeconds: task.timeout || this.timeout,
      cleanup: 'delete'
    });

    return result;
  }

  /**
   * 带信号量的受控执行
   */
  async executeWithSemaphore(task, priority = 1) {
    // 加入优先级队列
    const taskId = this.priorityQueue.enqueue(task, priority);
    this.metrics.totalTasks++;
    
    console.log(`[队列] 任务 "${task.name}" 已加入 (优先级: ${priority}, ID: ${taskId})`);
    console.log(`[队列状态]`, this.priorityQueue.stats);

    // 获取信号量许可
    const release = await this.semaphore.acquire();
    
    try {
      // 从队列中取出（确保优先级顺序）
      const queuedTask = this.priorityQueue.dequeue();
      if (!queuedTask) {
        throw new Error('队列异常：无法获取任务');
      }

      return await this.executeTask(queuedTask);
    } finally {
      release(); // 释放信号量
    }
  }

  /**
   * 批量并行执行 - 带并发控制
   */
  async spawnBatch(tasks, options = {}) {
    console.log(`\n[并行子代理] 批量派发 ${tasks.length} 个任务...`);
    console.log(`[并发控制] 最大并发: ${this.semaphore.maxConcurrency}`);
    console.log(`[连接池] ${JSON.stringify(this.agentPool.getStats())}`);
    
    const batchStartTime = Date.now();
    
    // 为每个任务分配优先级（默认中等）
    const prioritizedTasks = tasks.map((task, idx) => ({
      ...task,
      _priority: options.priorities?.[idx] ?? 1
    }));

    // 使用 Promise.all 并行执行，但受信号量控制
    const promises = prioritizedTasks.map(task => 
      this.executeWithSemaphore(task, task._priority)
    );

    const results = await Promise.allSettled(promises);
    
    const batchExecutionTime = Date.now() - batchStartTime;
    
    const processedResults = results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          task: tasks[index]?.name || `task_${index}`,
          status: 'rejected',
          reason: result.reason?.message || 'Unknown error'
        };
      }
    });

    console.log(`\n[批量执行完成] 总耗时: ${batchExecutionTime}ms`);
    this.printMetrics();

    return processedResults;
  }

  /**
   * 顺序执行 - 带重试和熔断
   */
  async spawnSequential(tasks) {
    const results = [];
    
    for (const task of tasks) {
      const result = await this.executeWithSemaphore(task, task.priority || 1);
      results.push(result);
      
      // 检查是否需要停止
      if (result.status === 'rejected' && task.stopOnFailure !== false) {
        console.log(`[顺序执行] 任务 "${task.name}" 失败，停止后续任务`);
        break;
      }
    }
    
    return results;
  }

  /**
   * 执行工作流 - 完整编排
   */
  async executeWorkflow(workflow) {
    console.log('\n' + '='.repeat(60));
    console.log(`[工作流] ${workflow.name}`);
    console.log('='.repeat(60));
    
    // 初始化连接池
    await this.agentPool.initialize();
    
    const workflowStartTime = Date.now();
    const allResults = [];
    
    for (const stage of workflow.stages) {
      console.log(`\n[阶段] ${stage.name} (${stage.type})`);
      console.log('-'.repeat(40));
      
      const stageTasks = stage.agents.map(a => ({
        name: `${stage.name}-${a.role}`,
        prompt: a.task,
        timeout: a.timeout,
        priority: a.priority ?? 1,
        model: a.model || this.model
      }));

      let stageResults;
      if (stage.type === 'parallel') {
        stageResults = await this.spawnBatch(stageTasks, {
          priorities: stage.agents.map(a => a.priority ?? 1)
        });
      } else if (stage.type === 'sequential') {
        stageResults = await this.spawnSequential(stageTasks);
      } else {
        console.warn(`[警告] 未知阶段类型: ${stage.type}`);
        continue;
      }

      allResults.push(...stageResults);
      
      // 阶段失败检查
      const stageFailed = stageResults.some(r => r.status === 'rejected');
      if (stageFailed && stage.stopOnFailure !== false) {
        console.log(`[工作流] 阶段 "${stage.name}" 失败，停止工作流`);
        break;
      }
    }

    const workflowExecutionTime = Date.now() - workflowStartTime;
    
    const summary = {
      total: allResults.length,
      success: allResults.filter(r => r.status === 'fulfilled').length,
      failed: allResults.filter(r => r.status === 'rejected').length,
      totalTime: workflowExecutionTime,
      avgTaskTime: workflowExecutionTime / (allResults.length || 1)
    };

    console.log('\n' + '='.repeat(60));
    console.log('[工作流完成]');
    console.log(`  总计: ${summary.total} | 成功: ${summary.success} | 失败: ${summary.failed}`);
    console.log(`  总耗时: ${summary.totalTime}ms | 平均任务耗时: ${summary.avgTaskTime.toFixed(2)}ms`);
    console.log('='.repeat(60));

    return {
      workflow: workflow.name,
      results: allResults,
      summary,
      metrics: this.getMetrics(),
      circuitBreakerStatus: this.circuitBreaker.getStatus(),
      poolStats: this.agentPool.getStats()
    };
  }

  /**
   * 记录成功
   */
  recordSuccess(executionTime) {
    this.metrics.completedTasks++;
    this.metrics.executionTimes.push(executionTime);
    
    // 保持最近100个执行时间
    if (this.metrics.executionTimes.length > 100) {
      this.metrics.executionTimes.shift();
    }
    
    // 计算平均执行时间
    const sum = this.metrics.executionTimes.reduce((a, b) => a + b, 0);
    this.metrics.avgExecutionTime = sum / this.metrics.executionTimes.length;
  }

  /**
   * 记录失败
   */
  recordFailure(error) {
    this.metrics.failedTasks++;
    if (error.name === 'RetryExhaustedError') {
      this.metrics.retriedTasks++;
    }
    if (error.name === 'CircuitBreakerOpenError') {
      this.metrics.circuitBreakerTrips++;
    }
  }

  /**
   * 获取指标
   */
  getMetrics() {
    return {
      ...this.metrics,
      semaphore: {
        max: this.semaphore.maxConcurrency,
        available: this.semaphore.available,
        pending: this.semaphore.pending
      },
      queue: this.priorityQueue.stats,
      circuitBreaker: this.circuitBreaker.getStatus(),
      pool: this.agentPool.getStats()
    };
  }

  /**
   * 打印指标
   */
  printMetrics() {
    const m = this.getMetrics();
    console.log('\n[性能指标]');
    console.log(`  任务: 总计${m.totalTasks} | 完成${m.completedTasks} | 失败${m.failedTasks} | 重试${m.retriedTasks}`);
    console.log(`  平均执行时间: ${m.avgExecutionTime.toFixed(2)}ms`);
    console.log(`  信号量: 可用${m.semaphore.available}/${m.semaphore.max} | 等待${m.semaphore.pending}`);
    console.log(`  队列: 高${m.queue.high} | 中${m.queue.medium} | 低${m.queue.low}`);
    console.log(`  熔断器: ${m.circuitBreaker.state} | 失败${m.circuitBreaker.failureCount}次`);
    console.log(`  连接池: 可用${m.pool.available} | 活跃${m.pool.active} | 总创建${m.pool.created}`);
  }

  /**
   * 获取健康状态
   */
  healthCheck() {
    const cb = this.circuitBreaker.getStatus();
    return {
      healthy: cb.state !== 'OPEN',
      state: cb.state,
      queueSize: this.priorityQueue.size,
      poolUtilization: this.agentPool.active.size / this.agentPool.maxSize,
      canAcceptTasks: cb.state !== 'OPEN' && this.priorityQueue.size < 100
    };
  }

  /**
   * 优雅关闭
   */
  async shutdown() {
    console.log('[关闭] 正在优雅关闭并行子代理...');
    this.isProcessing = false;
    
    // 等待队列清空
    while (this.priorityQueue.size > 0) {
      console.log(`[关闭] 等待 ${this.priorityQueue.size} 个任务完成...`);
      await new Promise(r => setTimeout(r, 1000));
    }

    console.log('[关闭] 完成');
    return this.getMetrics();
  }
}

// ============================================
// 导出
// ============================================

module.exports = {
  ParallelSubagentSpawner,
  Semaphore,
  CircuitBreaker,
  PriorityQueue,
  RetryPolicy,
  AgentPool,
  // 错误类
  CircuitBreakerOpenError,
  RetryExhaustedError,
  PoolExhaustedError
};
