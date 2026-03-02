/**
 * AEO 评测任务调度器 (Evaluation Scheduler)
 * 管理评测生命周期 - 调度、状态管理、任务分发
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

/**
 * 评测任务状态
 */
const EvaluationStatus = {
  PENDING: 'pending',
  SCHEDULED: 'scheduled',
  RUNNING: 'running',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

/**
 * 评测任务调度器
 */
class EvaluationScheduler extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      maxConcurrent: options.maxConcurrent || 3,
      timeout: options.timeout || 300000,
      autoSave: options.autoSave !== false,
      savePath: options.savePath || path.join(__dirname, '../../evaluation-sets'),
      ...options
    };
    
    // 任务队列
    this.queue = [];
    
    // 运行中任务
    this.running = new Map();
    
    // 历史记录
    this.history = [];
    
    // 调度器状态
    this.isRunning = false;
    this.schedulerId = null;
    
    // 统计
    this.stats = {
      total: 0,
      completed: 0,
      failed: 0,
      cancelled: 0
    };
    
    // 加载历史
    this._loadHistory();
  }
  
  /**
   * 创建评测任务
   * @param {Object} config - 评测配置
   * @returns {string} 任务ID
   */
  createTask(config) {
    const taskId = `eval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const task = {
      id: taskId,
      name: config.name || `评测任务 ${taskId}`,
      type: config.type || 'skill', // skill | workflow | agent
      target: config.target, // 评测目标
      testCases: config.testCases || [], // 测试用例
      dimensions: config.dimensions || ['accuracy', 'relevance', 'helpfulness'],
      status: EvaluationStatus.PENDING,
      priority: config.priority || 'normal', // high | normal | low
      createdAt: new Date().toISOString(),
      scheduledAt: null,
      startedAt: null,
      completedAt: null,
      progress: {
        total: config.testCases?.length || 0,
        completed: 0,
        failed: 0
      },
      results: [],
      config: {
        batchSize: config.batchSize || 5,
        retryAttempts: config.retryAttempts || 2,
        timeout: config.timeout || this.options.timeout,
        ...config.options
      }
    };
    
    this.queue.push(task);
    this.stats.total++;
    
    this.emit('task:created', { taskId, task });
    
    // 自动保存
    if (this.options.autoSave) {
      this._saveTask(task);
    }
    
    return taskId;
  }
  
  /**
   * 调度任务
   * @param {string} taskId - 任务ID
   * @param {Object} options - 调度选项
   */
  schedule(taskId, options = {}) {
    const task = this._getTask(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }
    
    if (task.status !== EvaluationStatus.PENDING) {
      throw new Error(`Cannot schedule task in status: ${task.status}`);
    }
    
    task.status = EvaluationStatus.SCHEDULED;
    task.scheduledAt = new Date().toISOString();
    
    // 延迟执行
    if (options.delay) {
      setTimeout(() => this._startTask(taskId), options.delay);
    } else {
      this._startTask(taskId);
    }
    
    this.emit('task:scheduled', { taskId, task });
    return task;
  }
  
  /**
   * 批量调度多个任务
   * @param {Array<string>} taskIds - 任务ID列表
   */
  scheduleBatch(taskIds) {
    const results = [];
    for (const taskId of taskIds) {
      try {
        const task = this.schedule(taskId);
        results.push({ taskId, success: true, task });
      } catch (error) {
        results.push({ taskId, success: false, error: error.message });
      }
    }
    return results;
  }
  
  /**
   * 启动调度器循环
   */
  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.schedulerId = setInterval(() => this._processQueue(), 1000);
    
    this.emit('scheduler:started');
    console.log('[EvaluationScheduler] Scheduler started');
  }
  
  /**
   * 停止调度器
   */
  stop() {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    if (this.schedulerId) {
      clearInterval(this.schedulerId);
      this.schedulerId = null;
    }
    
    this.emit('scheduler:stopped');
    console.log('[EvaluationScheduler] Scheduler stopped');
  }
  
  /**
   * 暂停任务
   * @param {string} taskId - 任务ID
   */
  pause(taskId) {
    const task = this._getTask(taskId);
    if (!task) return false;
    
    if (task.status === EvaluationStatus.RUNNING) {
      task.status = EvaluationStatus.PAUSED;
      this.emit('task:paused', { taskId, task });
      return true;
    }
    return false;
  }
  
  /**
   * 恢复任务
   * @param {string} taskId - 任务ID
   */
  resume(taskId) {
    const task = this._getTask(taskId);
    if (!task) return false;
    
    if (task.status === EvaluationStatus.PAUSED) {
      task.status = EvaluationStatus.RUNNING;
      this.emit('task:resumed', { taskId, task });
      return true;
    }
    return false;
  }
  
  /**
   * 取消任务
   * @param {string} taskId - 任务ID
   */
  cancel(taskId) {
    const task = this._getTask(taskId);
    if (!task) return false;
    
    if ([EvaluationStatus.PENDING, EvaluationStatus.SCHEDULED, EvaluationStatus.RUNNING, EvaluationStatus.PAUSED].includes(task.status)) {
      task.status = EvaluationStatus.CANCELLED;
      task.completedAt = new Date().toISOString();
      
      // 从运行中移除
      this.running.delete(taskId);
      
      this.stats.cancelled++;
      this.emit('task:cancelled', { taskId, task });
      return true;
    }
    return false;
  }
  
  /**
   * 获取任务状态
   * @param {string} taskId - 任务ID
   */
  getTaskStatus(taskId) {
    const task = this._getTask(taskId);
    if (!task) return null;
    
    return {
      id: task.id,
      name: task.name,
      status: task.status,
      progress: task.progress,
      createdAt: task.createdAt,
      startedAt: task.startedAt,
      completedAt: task.completedAt
    };
  }
  
  /**
   * 获取所有任务
   */
  getAllTasks() {
    return [...this.queue, ...this.history];
  }
  
  /**
   * 获取待处理任务
   */
  getPendingTasks() {
    return this.queue.filter(t => t.status === EvaluationStatus.PENDING);
  }
  
  /**
   * 获取运行中任务
   */
  getRunningTasks() {
    return Array.from(this.running.values());
  }
  
  /**
   * 获取统计信息
   */
  getStats() {
    return {
      ...this.stats,
      queueLength: this.queue.length,
      runningCount: this.running.size,
      historyCount: this.history.length
    };
  }
  
  /**
   * 更新任务进度
   * @param {string} taskId - 任务ID
   * @param {Object} progress - 进度信息
   */
  updateProgress(taskId, progress) {
    const task = this._getTask(taskId);
    if (!task) return false;
    
    task.progress = { ...task.progress, ...progress };
    this.emit('task:progress', { taskId, progress: task.progress });
    return true;
  }
  
  /**
   * 记录任务结果
   * @param {string} taskId - 任务ID
   * @param {Object} result - 结果数据
   */
  recordResult(taskId, result) {
    const task = this._getTask(taskId);
    if (!task) return false;
    
    task.results.push(result);
    
    // 更新进度
    task.progress.completed++;
    
    this.emit('task:result', { taskId, result });
    return true;
  }
  
  /**
   * 完成任务
   * @param {string} taskId - 任务ID
   * @param {Object} finalResult - 最终结果
   */
  completeTask(taskId, finalResult = {}) {
    const task = this._getTask(taskId);
    if (!task) return false;
    
    task.status = EvaluationStatus.COMPLETED;
    task.completedAt = new Date().toISOString();
    task.finalResult = finalResult;
    
    // 从运行中移除，加入历史
    this.running.delete(taskId);
    this._moveToHistory(task);
    
    this.stats.completed++;
    this.emit('task:completed', { taskId, task, finalResult });
    
    // 保存
    if (this.options.autoSave) {
      this._saveTask(task);
    }
    
    return true;
  }
  
  /**
   * 标记任务失败
   * @param {string} taskId - 任务ID
   * @param {Error} error - 错误信息
   */
  failTask(taskId, error) {
    const task = this._getTask(taskId);
    if (!task) return false;
    
    task.status = EvaluationStatus.FAILED;
    task.completedAt = new Date().toISOString();
    task.error = error.message || error;
    
    // 从运行中移除
    this.running.delete(taskId);
    this._moveToHistory(task);
    
    this.stats.failed++;
    this.emit('task:failed', { taskId, task, error });
    
    return true;
  }
  
  // ==================== 私有方法 ====================
  
  _getTask(taskId) {
    // 先在队列中查找
    let task = this.queue.find(t => t.id === taskId);
    if (task) return task;
    
    // 在运行中查找
    if (this.running.has(taskId)) {
      return this.running.get(taskId);
    }
    
    // 在历史中查找
    return this.history.find(t => t.id === taskId);
  }
  
  _startTask(taskId) {
    const task = this._getTask(taskId);
    if (!task) return false;
    
    // 检查并发限制
    if (this.running.size >= this.options.maxConcurrent) {
      // 等待队列
      return false;
    }
    
    task.status = EvaluationStatus.RUNNING;
    task.startedAt = new Date().toISOString();
    
    this.running.set(taskId, task);
    this.emit('task:started', { taskId, task });
    
    return true;
  }
  
  _processQueue() {
    // 处理等待中的任务
    const pending = this.queue.filter(t => t.status === EvaluationStatus.PENDING);
    
    for (const task of pending) {
      if (this.running.size >= this.options.maxConcurrent) break;
      this._startTask(task.id);
    }
  }
  
  _moveToHistory(task) {
    // 从队列中移除
    const index = this.queue.findIndex(t => t.id === task.id);
    if (index > -1) {
      this.queue.splice(index, 1);
    }
    
    // 加入历史
    this.history.push(task);
    
    // 限制历史大小
    if (this.history.length > 100) {
      this.history.shift();
    }
  }
  
  _saveTask(task) {
    try {
      const filePath = path.join(this.options.savePath, `${task.id}.json`);
      fs.mkdirSync(this.options.savePath, { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(task, null, 2));
    } catch (error) {
      console.error(`[EvaluationScheduler] Failed to save task: ${error.message}`);
    }
  }
  
  _loadHistory() {
    try {
      if (!fs.existsSync(this.options.savePath)) return;
      
      const files = fs.readdirSync(this.options.savePath);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const content = fs.readFileSync(path.join(this.options.savePath, file), 'utf8');
          const task = JSON.parse(content);
          this.history.push(task);
        }
      }
    } catch (error) {
      console.error(`[EvaluationScheduler] Failed to load history: ${error.message}`);
    }
  }
}

module.exports = { EvaluationScheduler, EvaluationStatus };
