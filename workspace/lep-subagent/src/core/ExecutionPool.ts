// 执行池 - 并发控制 + 优先级队列
import { ExecutionTask, ExecutionResult, ExecutionStats } from '../types';
import { EventEmitter } from 'events';

interface QueuedTask {
  task: ExecutionTask;
  execute: () => Promise<ExecutionResult>;
  resolve: (result: ExecutionResult) => void;
  reject: (error: Error) => void;
  priority: number;
  enqueueTime: number;
}

interface ExecutionPoolConfig {
  maxConcurrency: number;
  queueSize: number;
  defaultPriority: 'high' | 'medium' | 'low';
}

export class ExecutionPool extends EventEmitter {
  private config: ExecutionPoolConfig;
  private queue: QueuedTask[] = [];
  private running: Map<string, QueuedTask> = new Map();
  private stats: ExecutionStats = {
    total: 0,
    success: 0,
    failed: 0,
    timeout: 0,
    averageDuration: 0,
    averageTokens: 0,
    byModel: {}
  };

  constructor(config: ExecutionPoolConfig) {
    super();
    this.config = config;
  }

  async submit(
    task: ExecutionTask, 
    executeFn: () => Promise<ExecutionResult>
  ): Promise<ExecutionResult> {
    return new Promise((resolve, reject) => {
      // 检查队列是否已满
      if (this.queue.length >= this.config.queueSize) {
        reject(new Error('Execution pool queue is full'));
        return;
      }

      const priority = this.getPriorityValue(task.priority);
      
      const queuedTask: QueuedTask = {
        task,
        execute: executeFn,
        resolve,
        reject,
        priority,
        enqueueTime: Date.now()
      };

      // 插入队列（按优先级排序）
      this.insertByPriority(queuedTask);
      
      this.emit('task:enqueued', { taskId: task.id, priority });
      
      // 尝试执行
      this.processQueue();
    });
  }

  private insertByPriority(queuedTask: QueuedTask): void {
    // 高优先级数字小，排在前面
    const index = this.queue.findIndex(qt => qt.priority > queuedTask.priority);
    if (index === -1) {
      this.queue.push(queuedTask);
    } else {
      this.queue.splice(index, 0, queuedTask);
    }
  }

  private async processQueue(): Promise<void> {
    // 检查并发限制
    if (this.running.size >= this.config.maxConcurrency) {
      return;
    }

    // 获取下一个任务
    const queuedTask = this.queue.shift();
    if (!queuedTask) return;

    // 开始执行
    this.running.set(queuedTask.task.id, queuedTask);
    
    const waitTime = Date.now() - queuedTask.enqueueTime;
    this.emit('task:started', { 
      taskId: queuedTask.task.id, 
      waitTime,
      queueLength: this.queue.length 
    });

    try {
      const result = await this.executeWithTimeout(queuedTask);
      
      // 更新统计
      this.updateStats(result);
      
      // 通知成功
      queuedTask.resolve(result);
      this.emit('task:completed', { taskId: queuedTask.task.id, result });
      
    } catch (error) {
      // 通知失败
      queuedTask.reject(error as Error);
      this.emit('task:failed', { 
        taskId: queuedTask.task.id, 
        error: (error as Error).message 
      });
      
    } finally {
      // 清理
      this.running.delete(queuedTask.task.id);
      
      // 继续处理队列
      setImmediate(() => this.processQueue());
    }
  }

  private async executeWithTimeout(
    queuedTask: QueuedTask
  ): Promise<ExecutionResult> {
    const { task, execute } = queuedTask;
    const timeout = task.timeout || 60000;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Task ${task.id} timeout after ${timeout}ms`));
      }, timeout);

      execute()
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  private updateStats(result: ExecutionResult): void {
    this.stats.total++;
    
    if (result.status === 'success') {
      this.stats.success++;
    } else if (result.status === 'timeout') {
      this.stats.timeout++;
    } else {
      this.stats.failed++;
    }

    // 更新平均耗时
    const oldAvg = this.stats.averageDuration;
    this.stats.averageDuration = 
      (oldAvg * (this.stats.total - 1) + result.duration) / this.stats.total;

    // 按模型统计
    if (!this.stats.byModel[result.model]) {
      this.stats.byModel[result.model] = {
        total: 0,
        success: 0,
        failed: 0,
        averageResponseTime: 0,
        currentLoad: 0
      };
    }
    
    const modelStats = this.stats.byModel[result.model];
    modelStats.total++;
    if (result.status === 'success') {
      modelStats.success++;
    } else {
      modelStats.failed++;
    }
  }

  private getPriorityValue(
    priority?: 'high' | 'medium' | 'low'
  ): number {
    const priorities = {
      high: 1,
      medium: 5,
      low: 10
    };
    return priorities[priority || this.config.defaultPriority] || 5;
  }

  // 获取当前状态
  getStatus(): {
    queued: number;
    running: number;
    maxConcurrency: number;
    queueSize: number;
  } {
    return {
      queued: this.queue.length,
      running: this.running.size,
      maxConcurrency: this.config.maxConcurrency,
      queueSize: this.config.queueSize
    };
  }

  getStats(): ExecutionStats {
    return { ...this.stats };
  }

  // 取消任务
  cancel(taskId: string): boolean {
    // 检查是否在队列中
    const index = this.queue.findIndex(qt => qt.task.id === taskId);
    if (index !== -1) {
      const queuedTask = this.queue.splice(index, 1)[0];
      queuedTask.reject(new Error('Task cancelled'));
      this.emit('task:cancelled', { taskId });
      return true;
    }

    // 检查是否正在运行（无法真正取消，只能标记）
    if (this.running.has(taskId)) {
      this.emit('task:cancel_requested', { taskId });
      return false; // 无法立即取消
    }

    return false;
  }

  // 清空队列
  clearQueue(): void {
    const cancelled = [...this.queue];
    this.queue = [];
    
    cancelled.forEach(qt => {
      qt.reject(new Error('Queue cleared'));
    });
    
    this.emit('queue:cleared', { cancelledCount: cancelled.length });
  }

  // 等待所有任务完成
  async drain(): Promise<void> {
    while (this.queue.length > 0 || this.running.size > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}

export default ExecutionPool;
