/**
 * @file scheduler/task-scheduler.js
 * @description 任务调度器 - 负责任务队列管理、优先级调度和执行控制
 * @module EvolutionPipeline/TaskScheduler
 * @version 1.0.0
 * @license ISC
 * @copyright (c) 2026 SEEF (技能生态进化工厂)
 * @author SEEF Core Team
 */

import { EventEmitter } from 'events';
import { TaskPriority, TaskStatus, EventType } from '../types/index.js';

const DEFAULT_SCHEDULE_CHECK_INTERVAL_MS = 1000;

/**
 * 任务类
 * @class Task
 * @description 封装单个任务的执行单元
 */
export class Task {
  /**
   * @constructor
   * @param {Object} config - 任务配置
   * @param {string} config.id - 任务ID
   * @param {string} config.name - 任务名称
   * @param {Function} config.executor - 执行函数
   * @param {TaskPriority} [config.priority=TaskPriority.NORMAL] - 优先级
   * @param {number} [config.timeout=30000] - 超时时间(毫秒)
   * @param {number} [config.maxRetries=3] - 最大重试次数
   * @param {Object} [config.metadata] - 元数据
   * @param {string} [config.cron] - Cron表达式
   * @param {Date} [config.scheduledAt] - 计划执行时间
   */
  constructor(config) {
    this.id = config.id || `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.name = config.name || 'unnamed_task';
    this.executor = config.executor;
    this.priority = config.priority ?? TaskPriority.NORMAL;
    this.timeout = config.timeout || 30000;
    this.maxRetries = config.maxRetries ?? 3;
    this.metadata = config.metadata || {};
    this.cron = config.cron;
    this.scheduledAt = config.scheduledAt;

    this.status = TaskStatus.PENDING;
    this.result = null;
    this.error = null;
    this.retryCount = 0;
    this.createdAt = new Date();
    this.startedAt = null;
    this.completedAt = null;
    this.cancelled = false;
  }

  /**
   * 获取任务执行时长
   * @returns {number|null} 毫秒
   */
  get duration() {
    if (!this.startedAt) return null;
    return (this.completedAt || new Date()) - this.startedAt;
  }

  /**
   * 检查是否可以执行
   * @returns {boolean}
   */
  canExecute() {
    return this.status === TaskStatus.PENDING || this.status === TaskStatus.SCHEDULED;
  }

  /**
   * 标记为正在执行
   */
  markRunning() {
    this.status = TaskStatus.RUNNING;
    this.startedAt = new Date();
  }

  /**
   * 标记为完成
   * @param {*} result - 执行结果
   */
  markCompleted(result) {
    this.status = TaskStatus.COMPLETED;
    this.result = result;
    this.completedAt = new Date();
  }

  /**
   * 标记为失败
   * @param {Error} error - 错误对象
   */
  markFailed(error) {
    this.status = TaskStatus.FAILED;
    this.error = error;
    this.completedAt = new Date();
  }

  /**
   * 标记为重试中
   */
  markRetrying() {
    this.status = TaskStatus.RETRYING;
    this.retryCount++;
  }

  /**
   * 标记为取消
   */
  markCancelled() {
    this.status = TaskStatus.CANCELLED;
    this.cancelled = true;
    this.completedAt = new Date();
  }

  /**
   * 标记为超时
   */
  markTimeout() {
    this.status = TaskStatus.TIMEOUT;
    this.completedAt = new Date();
  }

  /**
   * 转换为JSON
   * @returns {Object}
   */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      priority: this.priority,
      status: this.status,
      timeout: this.timeout,
      maxRetries: this.maxRetries,
      retryCount: this.retryCount,
      metadata: this.metadata,
      createdAt: this.createdAt,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      duration: this.duration,
      cancelled: this.cancelled
    };
  }
}

/**
 * 任务调度器
 * @class TaskScheduler
 * @extends EventEmitter
 * @description 管理任务队列、优先级调度和执行控制
 */
export class TaskScheduler extends EventEmitter {
  /**
   * @constructor
   * @param {Object} options - 配置选项
   * @param {number} [options.maxConcurrency=3] - 最大并发数
   * @param {number} [options.queueLimit=1000] - 队列最大容量
   * @param {boolean} [options.autoStart=true] - 自动启动
   * @param {number} [options.pollInterval=100] - 轮询间隔(毫秒)
   * @param {boolean} [options.enablePersistence=false] - 启用持久化
   * @param {string} [options.persistencePath] - 持久化路径
   */
  constructor(options = {}) {
    super();

    this.config = {
      maxConcurrency: options.maxConcurrency ?? 3,
      queueLimit: options.queueLimit || 1000,
      autoStart: options.autoStart !== false,
      pollInterval: options.pollInterval || 100,
      enablePersistence: options.enablePersistence || false,
      persistencePath: options.persistencePath,
      ...options
    };

    /** @private @type {Task[]} */
    this.taskQueue = [];

    /** @private @type {Map<string, Task>} */
    this.runningTasks = new Map();

    /** @private @type {Map<string, Task>} */
    this.completedTasks = new Map();

    /** @private @type {Map<string, Object>} */
    this.scheduledTasks = new Map();

    /** @private @type {boolean} */
    this.isRunning = false;

    /** @private @type {boolean} */
    this.isPaused = false;

    /** @private @type {NodeJS.Timeout|null} */
    this.pollTimer = null;

    /** @private @type {NodeJS.Timeout|null} */
    this.scheduleTimer = null;

    /** @private @type {number} */
    this.totalExecuted = 0;

    /** @private @type {number} */
    this.totalFailed = 0;

    this._setupEventHandlers();
  }

  /**
   * 设置事件处理器
   * @private
   */
  _setupEventHandlers() {
    this.on('task:completed', (task) => {
      this.runningTasks.delete(task.id);
      this.completedTasks.set(task.id, task);
      this.totalExecuted++;
    });

    this.on('task:failed', (task) => {
      this.runningTasks.delete(task.id);
      this.completedTasks.set(task.id, task);
      this.totalFailed++;
    });

    this.on('task:cancelled', (task) => {
      this.runningTasks.delete(task.id);
      this.completedTasks.set(task.id, task);
    });
  }

  /**
   * 初始化调度器
   * @async
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.config.enablePersistence && this.config.persistencePath) {
      await this._loadState();
    }

    if (this.config.autoStart) {
      this.start();
    }

    this.emit('initialized');
    this._log('info', 'TaskScheduler initialized');
  }

  /**
   * 启动调度器
   */
  start() {
    if (this.isRunning) return;

    this.isRunning = true;
    this.isPaused = false;
    this._startPolling();
    this._startSchedulePolling();

    this.emit('started');
    this._log('info', 'TaskScheduler started');
  }

  /**
   * 停止调度器
   */
  stop() {
    if (!this.isRunning) return;

    this.isRunning = false;
    this._stopPolling();
    this._stopSchedulePolling();

    this.emit('stopped');
    this._log('info', 'TaskScheduler stopped');
  }

  /**
   * 暂停调度器
   */
  pause() {
    this.isPaused = true;
    this.emit('paused');
    this._log('info', 'TaskScheduler paused');
  }

  /**
   * 恢复调度器
   */
  resume() {
    this.isPaused = false;
    this.emit('resumed');
    this._log('info', 'TaskScheduler resumed');
  }

  /**
   * 添加任务到队列
   * @param {Task|Object} task - 任务对象或配置
   * @returns {Task}
   */
  addTask(task) {
    if (!(task instanceof Task)) {
      task = new Task(task);
    }

    // 检查队列容量
    if (this.taskQueue.length >= this.config.queueLimit) {
      const error = new Error(`Task queue limit exceeded: ${this.config.queueLimit}`);
      this.emit('error', { error, task });
      throw error;
    }

    // 根据优先级插入到正确位置
    const insertIndex = this.taskQueue.findIndex(t => t.priority > task.priority);
    if (insertIndex === -1) {
      this.taskQueue.push(task);
    } else {
      this.taskQueue.splice(insertIndex, 0, task);
    }

    this.emit(EventType.TASK_CREATED, task);
    this._log('debug', `Task added: ${task.name} (${task.id})`);

    return task;
  }

  /**
   * 批量添加任务
   * @param {Array<Task|Object>} tasks - 任务列表
   * @returns {Task[]}
   */
  addTasks(tasks) {
    return tasks.map(task => this.addTask(task));
  }

  /**
   * 调度定时任务
   * @param {Object} config - 任务配置
   * @param {string|Date} schedule - Cron表达式或执行时间
   * @returns {Task}
   */
  scheduleTask(config, schedule) {
    const task = new Task({
      ...config,
      status: TaskStatus.SCHEDULED
    });

    if (schedule instanceof Date) {
      task.scheduledAt = schedule;
    } else {
      task.cron = schedule;
    }

    const nextRun = this._calculateNextRun(schedule);

    this.scheduledTasks.set(task.id, {
      task,
      schedule,
      nextRun,
      lastTriggeredAt: null
    });

    task.status = TaskStatus.SCHEDULED;

    this.emit(EventType.TASK_CREATED, task);
    this._log('info', `Task scheduled: ${task.name} at ${schedule}`);

    return task;
  }

  /**
   * 取消任务
   * @param {string} taskId - 任务ID
   * @returns {boolean}
   */
  cancelTask(taskId) {
    // 从队列中移除
    const queueIndex = this.taskQueue.findIndex(t => t.id === taskId);
    if (queueIndex !== -1) {
      const task = this.taskQueue.splice(queueIndex, 1)[0];
      task.markCancelled();
      this.emit(EventType.TASK_CANCELLED, task);
      return true;
    }

    // 从运行中移除（尽力而为）
    if (this.runningTasks.has(taskId)) {
      const task = this.runningTasks.get(taskId);
      task.markCancelled();
      this.emit(EventType.TASK_CANCELLED, task);
      return true;
    }

    // 从调度中移除
    if (this.scheduledTasks.has(taskId)) {
      this.scheduledTasks.delete(taskId);
      return true;
    }

    return false;
  }

  /**
   * 立即执行任务
   * @async
   * @param {Task} task - 任务对象
   * @returns {Promise<*>}
   */
  async executeTask(task) {
    if (!task.canExecute()) {
      throw new Error(`Task ${task.id} cannot be executed (status: ${task.status})`);
    }

    task.markRunning();
    this.runningTasks.set(task.id, task);

    this.emit(EventType.TASK_STARTED, task);
    this._log('info', `Task started: ${task.name} (${task.id})`);

    try {
      // 创建超时Promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Task timeout after ${task.timeout}ms`));
        }, task.timeout);
      });

      // 执行任务
      const result = await Promise.race([
        task.executor(task),
        timeoutPromise
      ]);

      task.markCompleted(result);
      this.emit(EventType.TASK_COMPLETED, task);
      this._log('info', `Task completed: ${task.name} (${task.duration}ms)`);

      return result;
    } catch (error) {
      // 检查是否需要重试
      if (task.retryCount < task.maxRetries && !task.cancelled) {
        task.markRetrying();
        this.emit('task:retrying', { task, error, retryCount: task.retryCount });
        this._log('warn', `Task retrying: ${task.name} (${task.retryCount}/${task.maxRetries})`);

        // 延迟重试
        await this._sleep(Math.min(Math.pow(2, task.retryCount) * 100, 1000));
        return this.executeTask(task);
      }

      task.markFailed(error);
      this.emit(EventType.TASK_FAILED, { task, error });
      this._log('error', `Task failed: ${task.name} - ${error.message}`);

      throw error;
    }
  }

  /**
   * 等待所有任务完成
   * @async
   * @param {number} [timeout=60000] - 超时时间
   * @returns {Promise<void>}
   */
  async waitForAll(timeout = 60000) {
    const startTime = Date.now();

    while (
      this.taskQueue.length > 0 ||
      this.runningTasks.size > 0 ||
      this.isPaused
    ) {
      if (Date.now() - startTime > timeout) {
        throw new Error(`Wait for all tasks timeout after ${timeout}ms`);
      }
      await this._sleep(100);
    }
  }

  /**
   * 获取统计信息
   * @returns {Object}
   */
  getStats() {
    const statusCount = {};
    for (const task of this.completedTasks.values()) {
      statusCount[task.status] = (statusCount[task.status] || 0) + 1;
    }

    return {
      queueLength: this.taskQueue.length,
      runningCount: this.runningTasks.size,
      completedCount: this.completedTasks.size,
      scheduledCount: this.scheduledTasks.size,
      totalExecuted: this.totalExecuted,
      totalFailed: this.totalFailed,
      successRate: this.totalExecuted > 0
        ? ((this.totalExecuted - this.totalFailed) / this.totalExecuted * 100).toFixed(2)
        : 100,
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      statusDistribution: statusCount
    };
  }

  /**
   * 清空已完成任务
   * @param {number} [olderThanMs=3600000] - 只清空超过此时间的任务
   * @returns {number} 清空的数量
   */
  clearCompleted(olderThanMs = 3600000) {
    const now = Date.now();
    let cleared = 0;

    for (const [id, task] of this.completedTasks) {
      if (now - task.completedAt?.getTime() > olderThanMs) {
        this.completedTasks.delete(id);
        cleared++;
      }
    }

    return cleared;
  }

  /**
   * 开始轮询
   * @private
   */
  _startPolling() {
    this.pollTimer = setInterval(() => {
      this._poll();
    }, this.config.pollInterval);
  }

  /**
   * 停止轮询
   * @private
   */
  _stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * 启动定时任务轮询
   * @private
   */
  _startSchedulePolling() {
    if (this.scheduleTimer) return;

    this.scheduleTimer = setInterval(() => {
      this._pollScheduledTasks().catch((error) => {
        this.emit(EventType.ERROR_OCCURRED, error);
        this._log('error', `Scheduled task poll failed: ${error.message}`);
      });
    }, this.config.scheduleCheckInterval || DEFAULT_SCHEDULE_CHECK_INTERVAL_MS);
  }

  /**
   * 停止定时任务轮询
   * @private
   */
  _stopSchedulePolling() {
    if (this.scheduleTimer) {
      clearInterval(this.scheduleTimer);
      this.scheduleTimer = null;
    }
  }

  /**
   * 轮询已注册的定时任务并按事件驱动投递到执行队列
   * @private
   * @returns {Promise<void>}
   */
  async _pollScheduledTasks() {
    if (!this.isRunning || this.isPaused || this.scheduledTasks.size === 0) {
      return;
    }

    const now = new Date();

    for (const entry of this.scheduledTasks.values()) {
      if (!entry?.nextRun || entry.task.cancelled) {
        continue;
      }

      if (entry.nextRun.getTime() > now.getTime()) {
        continue;
      }

      entry.lastTriggeredAt = now;
      entry.nextRun = this._calculateNextRun(entry.schedule, now);

      const scheduledTask = entry.task;
      const runtimeTask = new Task({
        ...scheduledTask,
        id: `${scheduledTask.id}_run_${Date.now()}`,
        metadata: {
          ...scheduledTask.metadata,
          scheduledTaskId: scheduledTask.id,
          scheduledAt: entry.lastTriggeredAt.toISOString(),
          trigger: 'schedule'
        }
      });

      this.addTask(runtimeTask);

      this.emit(EventType.SCHEDULE_TRIGGERED, {
        scheduledTaskId: scheduledTask.id,
        runtimeTaskId: runtimeTask.id,
        schedule: entry.schedule,
        triggeredAt: now,
        nextRun: entry.nextRun
      });

      this._log('info', `Scheduled task triggered: ${scheduledTask.name} -> ${runtimeTask.id}`);
    }
  }

  /**
   * 轮询处理
   * @private
   */
  async _poll() {
    if (!this.isRunning || this.isPaused) return;
    if (this.runningTasks.size >= this.config.maxConcurrency) return;
    if (this.taskQueue.length === 0) return;

    const availableSlots = this.config.maxConcurrency - this.runningTasks.size;
    const tasksToRun = this.taskQueue.splice(0, availableSlots);

    for (const task of tasksToRun) {
      this.executeTask(task).catch(() => {
        // 错误已在executeTask中处理
      });
    }
  }

  /**
   * 计算下次运行时间
   * @private
   * @param {string|Date} schedule - 调度表达式
   * @returns {Date}
   */
  _calculateNextRun(schedule, fromTime = new Date()) {
    if (schedule instanceof Date) {
      const date = schedule;
      if (date.getTime() > (fromTime instanceof Date ? fromTime.getTime() : Date.now())) {
        return date;
      }
      return null;
    }

    const baseTime = fromTime instanceof Date ? fromTime.getTime() : Date.now();
    const cron = String(schedule).trim();

    const everyMinutes = cron.match(/^\*\/(\d+) \* \* \* \*$/);
    if (everyMinutes) {
      const intervalMinutes = Math.max(1, parseInt(everyMinutes[1], 10));
      return new Date(baseTime + intervalMinutes * 60 * 1000);
    }

    if (cron === '* * * * *') {
      return new Date(baseTime + 60 * 1000);
    }

    const parts = cron.split(/\s+/);
    if (parts.length === 5) {
      const [minuteExpr, hourExpr] = parts;
      const minute = /^\d+$/.test(minuteExpr) ? parseInt(minuteExpr, 10) : null;
      const hour = /^\d+$/.test(hourExpr) ? parseInt(hourExpr, 10) : null;

      if (minute !== null && hour !== null) {
        const next = new Date(baseTime);
        next.setSeconds(0, 0);
        next.setMinutes(minute);
        next.setHours(hour);

        if (next.getTime() <= baseTime) {
          next.setDate(next.getDate() + 1);
        }

        return next;
      }

      if (minute !== null && hourExpr === '*') {
        const next = new Date(baseTime);
        next.setSeconds(0, 0);
        next.setMinutes(minute);

        if (next.getTime() <= baseTime) {
          next.setHours(next.getHours() + 1);
        }

        return next;
      }
    }

    // fallback：按分钟级兜底，确保定时任务至少可被事件驱动触发
    return new Date(baseTime + 60 * 1000);
  }

  /**
   * 加载状态
   * @private
   * @async
   */
  async _loadState() {
    // 实现从文件加载状态
    this._log('info', 'Loading scheduler state (stub)');
  }

  /**
   * 保存状态
   * @private
   * @async
   */
  async _saveState() {
    if (!this.config.enablePersistence) return;
    // 实现保存状态到文件
  }

  /**
   * 睡眠函数
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
   * @param {string} level - 日志级别
   * @param {string} message - 消息
   */
  _log(level, message) {
    const logEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      module: 'TaskScheduler'
    };

    const logFn = level === 'error' ? console.error :
                  level === 'warn' ? console.warn : console.log;
    logFn(`[TaskScheduler] ${message}`);

    this.emit('log', logEntry);
  }
}

/**
 * 创建任务调度器的工厂函数
 * @param {Object} options - 配置选项
 * @returns {TaskScheduler}
 */
export function createTaskScheduler(options = {}) {
  return new TaskScheduler(options);
}

export default TaskScheduler;
