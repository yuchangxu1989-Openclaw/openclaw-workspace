/**
 * @file trigger.js
 * @description EvoMap进化流水线触发器模块
 * @module EvolutionPipeline/Trigger
 * @version 1.0.0
 * @license ISC
 * @copyright (c) 2026 SEEF (技能生态进化工厂)
 * @author SEEF Core Team
 */

import { EventEmitter } from 'events';
import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';

/**
 * @typedef {string} TriggerType
 * @description 触发器类型枚举
 */
export const TriggerType = {
  FILE: 'file',       // 文件系统变更
  SCHEDULE: 'schedule', // 定时触发
  MANUAL: 'manual',   // 手动触发
  WEBHOOK: 'webhook', // Webhook触发
  EVENT: 'event'      // 内部事件
};

/**
 * @typedef {Object} TriggerEvent
 * @property {string} id - 事件唯一标识
 * @property {TriggerType} type - 触发类型
 * @property {string} source - 事件来源
 * @property {number} timestamp - 触发时间戳
 * @property {Object} payload - 事件负载
 * @property {boolean} processed - 是否已处理
 * @property {PipelineState} [targetState] - 目标状态（如果适用）
 */

/**
 * @typedef {Object} FileWatchConfig
 * @property {string[]} paths - 监控路径列表
 * @property {string[]} [ignore] - 忽略模式（glob）
 * @property {number} [debounceMs=5000] - 防抖时间（毫秒）
 * @property {boolean} [recursive=true] - 是否递归监控
 */

/**
 * @typedef {Object} ScheduleConfig
 * @property {string} cron - Cron表达式
 * @property {string} [timezone='Asia/Shanghai'] - 时区
 * @property {boolean} [enabled=true] - 是否启用
 * @property {number} [maxMissedRuns=1] - 最大错过的运行次数
 */

/**
 * @typedef {Object} TriggerConfig
 * @property {FileWatchConfig} [file] - 文件监控配置
 * @property {ScheduleConfig[]} [schedules] - 定时任务配置
 * @property {number} [queueMaxSize=1000] - 队列最大容量
 * @property {number} [queueProcessInterval=1000] - 队列处理间隔（毫秒）
 * @property {boolean} [deduplicate=true] - 是否去重
 * @property {number} [deduplicateWindowMs=30000] - 去重时间窗口
 */

/**
 * 触发器管理器类
 * @class TriggerManager
 * @extends EventEmitter
 * @description 管理文件监控、定时任务和手动触发的统一接口
 */
export class TriggerManager extends EventEmitter {
  /**
   * @constructor
   * @param {TriggerConfig} config - 触发器配置
   */
  constructor(config = {}) {
    super();

    /** @private @type {TriggerConfig} */
    this._config = {
      queueMaxSize: 1000,
      queueProcessInterval: 1000,
      deduplicate: true,
      deduplicateWindowMs: 30000,
      ...config
    };

    /** @private @type {Map<string, Function>} */
    this._watchers = new Map();

    /** @private @type {Map<string, Object>} */
    this._schedules = new Map();

    /** @private @type {TriggerEvent[]} */
    this._eventQueue = [];

    /** @private @type {boolean} */
    this._processingQueue = false;

    /** @private @type {NodeJS.Timeout|null} */
    this._queueProcessor = null;

    /** @private @type {Map<string, number>} */
    this._deduplicationMap = new Map();

    /** @private @type {Set<string>} */
    this._processedEvents = new Set();

    /** @private @type {boolean} */
    this._initialized = false;

    /** @private @type {boolean} */
    this._running = false;

    // 绑定队列处理方法
    this._processQueue = this._processQueue.bind(this);
  }

  /**
   * 获取触发器配置
   * @returns {TriggerConfig}
   */
  get config() {
    return { ...this._config };
  }

  /**
   * 获取事件队列长度
   * @returns {number}
   */
  get queueLength() {
    return this._eventQueue.length;
  }

  /**
   * 获取是否运行中
   * @returns {boolean}
   */
  get isRunning() {
    return this._running;
  }

  /**
   * 获取已注册的监控器数量
   * @returns {number}
   */
  get watcherCount() {
    return this._watchers.size;
  }

  /**
   * 获取已注册的计划任务数量
   * @returns {number}
   */
  get scheduleCount() {
    return this._schedules.size;
  }

  /**
   * 初始化触发器管理器
   * @async
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this._initialized) {
      this._log('warn', 'TriggerManager already initialized');
      return;
    }

    // 启动队列处理器
    this._startQueueProcessor();

    // 启动定时清理去重缓存
    this._startDeduplicationCleanup();

    this._initialized = true;
    this._log('info', 'TriggerManager initialized');
    this.emit('initialized');
  }

  /**
   * 启动所有触发器
   * @async
   * @returns {Promise<void>}
   */
  async start() {
    if (!this._initialized) {
      await this.initialize();
    }

    if (this._running) {
      this._log('warn', 'TriggerManager already running');
      return;
    }

    // 启动文件监控
    if (this._config.file) {
      await this._startFileWatcher();
    }

    // 启动定时任务
    if (this._config.schedules) {
      for (const schedule of this._config.schedules) {
        await this.addSchedule(schedule);
      }
    }

    this._running = true;
    this._log('info', 'TriggerManager started');
    this.emit('started');
  }

  /**
   * 停止所有触发器
   * @async
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this._running) {
      return;
    }

    // 停止文件监控
    await this._stopFileWatcher();

    // 停止定时任务
    await this._stopAllSchedules();

    // 停止队列处理器
    this._stopQueueProcessor();

    this._running = false;
    this._log('info', 'TriggerManager stopped');
    this.emit('stopped');
  }

  /**
   * 添加文件监控
   * @async
   * @param {FileWatchConfig} config - 文件监控配置
   * @param {string} [id] - 监控器标识（可选）
   * @returns {Promise<string>} 监控器ID
   */
  async addFileWatcher(config, id = null) {
    const watcherId = id || `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    if (this._watchers.has(watcherId)) {
      throw new Error(`File watcher with id '${watcherId}' already exists`);
    }

    // 动态导入chokidar（可选依赖）
    let chokidar;
    try {
      chokidar = await import('chokidar');
    } catch {
      // 如果没有chokidar，使用简易轮询方案
      this._log('warn', 'chokidar not available, using polling fallback');
      return this._addPollingFileWatcher(watcherId, config);
    }

    const watcher = chokidar.watch(config.paths, {
      ignored: config.ignore || /(^|[\/\\])\../,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: config.debounceMs || 2000,
        pollInterval: 100
      },
      depth: config.recursive !== false ? 99 : 0
    });

    // 处理文件变更事件
    const handleChange = (eventType, filePath) => {
      this._handleFileEvent(eventType, filePath, watcherId);
    };

    watcher.on('add', (path) => handleChange('add', path));
    watcher.on('change', (path) => handleChange('change', path));
    watcher.on('unlink', (path) => handleChange('unlink', path));
    watcher.on('addDir', (path) => handleChange('addDir', path));
    watcher.on('unlinkDir', (path) => handleChange('unlinkDir', path));
    watcher.on('error', (error) => {
      this._log('error', 'File watcher error', { error: error.message, watcherId });
      this.emit('watcher:error', { watcherId, error });
    });

    this._watchers.set(watcherId, {
      id: watcherId,
      type: 'chokidar',
      instance: watcher,
      config,
      createdAt: Date.now()
    });

    this._log('info', `File watcher added: ${watcherId}`, { paths: config.paths });
    this.emit('watcher:added', { watcherId, config });

    return watcherId;
  }

  /**
   * 添加轮询式文件监控（fallback方案）
   * @private
   * @param {string} watcherId - 监控器ID
   * @param {FileWatchConfig} config - 配置
   * @returns {string}
   */
  _addPollingFileWatcher(watcherId, config) {
    const pollInterval = config.debounceMs || 5000;
    const fileHashes = new Map();

    const pollFiles = async () => {
      try {
        for (const watchPath of config.paths) {
          const stats = await fs.stat(watchPath).catch(() => null);
          if (!stats) continue;

          if (stats.isFile()) {
            await this._checkFileChange(watchPath, fileHashes, watcherId);
          } else if (stats.isDirectory() && config.recursive !== false) {
            await this._pollDirectory(watchPath, config.ignore || [], fileHashes, watcherId);
          }
        }
      } catch (error) {
        this._log('error', 'Polling error', { error: error.message });
      }
    };

    const interval = setInterval(pollFiles, pollInterval);

    this._watchers.set(watcherId, {
      id: watcherId,
      type: 'polling',
      instance: interval,
      config,
      fileHashes,
      createdAt: Date.now()
    });

    // 立即执行一次
    pollFiles();

    return watcherId;
  }

  /**
   * 轮询目录变更
   * @private
   * @param {string} dirPath - 目录路径
   * @param {string[]} ignore - 忽略模式
   * @param {Map} fileHashes - 文件哈希映射
   * @param {string} watcherId - 监控器ID
   */
  async _pollDirectory(dirPath, ignore, fileHashes, watcherId) {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        // 检查忽略模式
        if (ignore.some(pattern => this._matchPattern(entry.name, pattern))) {
          continue;
        }

        if (entry.isFile()) {
          await this._checkFileChange(fullPath, fileHashes, watcherId);
        } else if (entry.isDirectory()) {
          await this._pollDirectory(fullPath, ignore, fileHashes, watcherId);
        }
      }
    } catch (error) {
      // 忽略无权限等错误
    }
  }

  /**
   * 检查单个文件变更
   * @private
   * @param {string} filePath - 文件路径
   * @param {Map} fileHashes - 文件哈希映射
   * @param {string} watcherId - 监控器ID
   */
  async _checkFileChange(filePath, fileHashes, watcherId) {
    try {
      const content = await fs.readFile(filePath);
      const hash = createHash('md5').update(content).digest('hex');
      const oldHash = fileHashes.get(filePath);

      if (oldHash !== undefined && oldHash !== hash) {
        this._handleFileEvent('change', filePath, watcherId);
      }
      
      fileHashes.set(filePath, hash);
    } catch {
      // 文件可能已被删除
      if (fileHashes.has(filePath)) {
        fileHashes.delete(filePath);
        this._handleFileEvent('unlink', filePath, watcherId);
      }
    }
  }

  /**
   * 匹配模式
   * @private
   * @param {string} name - 文件名
   * @param {string} pattern - 模式
   * @returns {boolean}
   */
  _matchPattern(name, pattern) {
    if (typeof pattern === 'string') {
      return name.includes(pattern) || new RegExp(pattern).test(name);
    }
    return pattern.test(name);
  }

  /**
   * 处理文件事件
   * @private
   * @param {string} eventType - 事件类型
   * @param {string} filePath - 文件路径
   * @param {string} watcherId - 监控器ID
   */
  _handleFileEvent(eventType, filePath, watcherId) {
    const event = this._createTriggerEvent(TriggerType.FILE, {
      eventType,
      filePath,
      watcherId,
      relativePath: path.relative(process.cwd(), filePath)
    });

    this._enqueueEvent(event);
  }

  /**
   * 添加定时任务
   * @async
   * @param {ScheduleConfig} config - 定时配置
   * @param {string} [id] - 任务标识
   * @returns {Promise<string>} 任务ID
   */
  async addSchedule(config, id = null) {
    const scheduleId = id || `schedule_${Date.now()}`;
    
    if (this._schedules.has(scheduleId)) {
      throw new Error(`Schedule with id '${scheduleId}' already exists`);
    }

    if (!config.enabled) {
      this._log('info', `Schedule ${scheduleId} disabled, skipping`);
      return scheduleId;
    }

    // 尝试使用node-cron
    let cronInstance = null;
    try {
      const cron = await import('node-cron');
      
      cronInstance = cron.schedule(config.cron, () => {
        this._handleScheduleEvent(scheduleId, config);
      }, {
        scheduled: false,
        timezone: config.timezone
      });

      if (this._running) {
        cronInstance.start();
      }
    } catch {
      // node-cron不可用，使用setTimeout模拟
      this._log('warn', 'node-cron not available, using setTimeout fallback');
      cronInstance = this._createFallbackSchedule(config, scheduleId);
    }

    this._schedules.set(scheduleId, {
      id: scheduleId,
      config,
      instance: cronInstance,
      createdAt: Date.now(),
      runCount: 0,
      lastRun: null
    });

    this._log('info', `Schedule added: ${scheduleId}`, { cron: config.cron });
    this.emit('schedule:added', { scheduleId, config });

    return scheduleId;
  }

  /**
   * 创建fallback定时器
   * @private
   * @param {ScheduleConfig} config - 配置
   * @param {string} scheduleId - 任务ID
   * @returns {Object}
   */
  _createFallbackSchedule(config, scheduleId) {
    // 简单的定时器实现，只支持分钟级别的间隔
    const intervalMs = this._parseCronToInterval(config.cron);
    
    let timeoutId = null;
    let running = false;

    const tick = () => {
      if (!running) return;
      this._handleScheduleEvent(scheduleId, config);
      timeoutId = setTimeout(tick, intervalMs);
    };

    return {
      start: () => {
        if (!running) {
          running = true;
          tick();
        }
      },
      stop: () => {
        running = false;
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      },
      destroy: () => {
        this.stop();
      }
    };
  }

  /**
   * 简单解析cron为毫秒间隔
   * @private
   * @param {string} cron - Cron表达式
   * @returns {number}
   */
  _parseCronToInterval(cron) {
    // 简化处理：只支持 */n * * * * 格式（每n分钟）
    const match = cron.match(/^\*\/(\d+) \* \* \* \*$/);
    if (match) {
      return parseInt(match[1]) * 60 * 1000;
    }
    // 默认5分钟
    return 5 * 60 * 1000;
  }

  /**
   * 处理定时事件
   * @private
   * @param {string} scheduleId - 任务ID
   * @param {ScheduleConfig} config - 配置
   */
  _handleScheduleEvent(scheduleId, config) {
    const schedule = this._schedules.get(scheduleId);
    if (schedule) {
      schedule.runCount++;
      schedule.lastRun = Date.now();
    }

    const event = this._createTriggerEvent(TriggerType.SCHEDULE, {
      scheduleId,
      cron: config.cron,
      timezone: config.timezone,
      runCount: schedule?.runCount || 0
    });

    this._enqueueEvent(event);
  }

  /**
   * 手动触发事件
   * @param {Object} payload - 触发负载
   * @param {string} [triggeredBy='user'] - 触发者
   * @returns {TriggerEvent}
   */
  manualTrigger(payload = {}, triggeredBy = 'user') {
    const event = this._createTriggerEvent(TriggerType.MANUAL, {
      ...payload,
      triggeredBy
    });

    this._enqueueEvent(event);
    
    this._log('info', 'Manual trigger', { triggeredBy, payload });
    this.emit('manual:triggered', { event, triggeredBy });

    return event;
  }

  /**
   * Webhook触发
   * @param {Object} payload - Webhook数据
   * @param {Object} [headers] - HTTP头
   * @returns {TriggerEvent}
   */
  webhookTrigger(payload = {}, headers = {}) {
    const event = this._createTriggerEvent(TriggerType.WEBHOOK, {
      ...payload,
      headers: { ...headers }
    });

    this._enqueueEvent(event);
    
    this._log('info', 'Webhook trigger', { payload: Object.keys(payload) });
    this.emit('webhook:received', { event, headers });

    return event;
  }

  /**
   * 发送内部事件
   * @param {string} eventName - 事件名称
   * @param {Object} payload - 事件数据
   * @returns {TriggerEvent}
   */
  emitEvent(eventName, payload = {}) {
    const event = this._createTriggerEvent(TriggerType.EVENT, {
      eventName,
      ...payload
    });

    this._enqueueEvent(event);
    
    this.emit('event:emitted', { event, eventName });

    return event;
  }

  /**
   * 移除文件监控
   * @async
   * @param {string} watcherId - 监控器ID
   * @returns {Promise<boolean>}
   */
  async removeFileWatcher(watcherId) {
    const watcher = this._watchers.get(watcherId);
    if (!watcher) {
      return false;
    }

    if (watcher.type === 'chokidar') {
      await watcher.instance.close();
    } else if (watcher.type === 'polling') {
      clearInterval(watcher.instance);
    }

    this._watchers.delete(watcherId);
    
    this._log('info', `File watcher removed: ${watcherId}`);
    this.emit('watcher:removed', { watcherId });

    return true;
  }

  /**
   * 移除定时任务
   * @async
   * @param {string} scheduleId - 任务ID
   * @returns {Promise<boolean>}
   */
  async removeSchedule(scheduleId) {
    const schedule = this._schedules.get(scheduleId);
    if (!schedule) {
      return false;
    }

    if (schedule.instance) {
      schedule.instance.stop();
    }

    this._schedules.delete(scheduleId);
    
    this._log('info', `Schedule removed: ${scheduleId}`);
    this.emit('schedule:removed', { scheduleId });

    return true;
  }

  /**
   * 清空事件队列
   * @returns {number} 清空的数量
   */
  clearQueue() {
    const count = this._eventQueue.length;
    this._eventQueue = [];
    this._log('info', `Event queue cleared: ${count} events`);
    return count;
  }

  /**
   * 获取队列统计
   * @returns {Object}
   */
  getQueueStats() {
    const stats = {
      total: this._eventQueue.length,
      byType: {},
      processed: 0,
      pending: 0
    };

    for (const event of this._eventQueue) {
      stats.byType[event.type] = (stats.byType[event.type] || 0) + 1;
      if (event.processed) {
        stats.processed++;
      } else {
        stats.pending++;
      }
    }

    return stats;
  }

  /**
   * 创建触发事件
   * @private
   * @param {TriggerType} type - 触发类型
   * @param {Object} payload - 事件负载
   * @returns {TriggerEvent}
   */
  _createTriggerEvent(type, payload = {}) {
    const id = `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return {
      id,
      type,
      source: payload.watcherId || payload.scheduleId || 'system',
      timestamp: Date.now(),
      payload,
      processed: false
    };
  }

  /**
   * 将事件加入队列
   * @private
   * @param {TriggerEvent} event - 事件对象
   */
  _enqueueEvent(event) {
    // 去重检查
    if (this._config.deduplicate) {
      const dedupKey = this._getDeduplicationKey(event);
      const lastSeen = this._deduplicationMap.get(dedupKey);
      
      if (lastSeen && (Date.now() - lastSeen) < this._config.deduplicateWindowMs) {
        this._log('debug', 'Duplicate event dropped', { eventId: event.id, dedupKey });
        return;
      }
      
      this._deduplicationMap.set(dedupKey, Date.now());
    }

    // 队列容量检查
    if (this._eventQueue.length >= this._config.queueMaxSize) {
      this._log('warn', 'Event queue full, dropping oldest event');
      this._eventQueue.shift(); // 移除最旧的事件
    }

    this._eventQueue.push(event);
    this.emit('event:queued', { event, queueLength: this._eventQueue.length });
  }

  /**
   * 获取去重键
   * @private
   * @param {TriggerEvent} event - 事件
   * @returns {string}
   */
  _getDeduplicationKey(event) {
    if (event.type === TriggerType.FILE) {
      return `file:${event.payload.filePath}:${event.payload.eventType}`;
    }
    if (event.type === TriggerType.SCHEDULE) {
      return `schedule:${event.payload.scheduleId}`;
    }
    return `${event.type}:${event.source}`;
  }

  /**
   * 启动队列处理器
   * @private
   */
  _startQueueProcessor() {
    if (this._queueProcessor) return;
    
    this._queueProcessor = setInterval(
      this._processQueue,
      this._config.queueProcessInterval
    );
  }

  /**
   * 停止队列处理器
   * @private
   */
  _stopQueueProcessor() {
    if (this._queueProcessor) {
      clearInterval(this._queueProcessor);
      this._queueProcessor = null;
    }
  }

  /**
   * 处理队列中的事件
   * @private
   * @async
   */
  async _processQueue() {
    if (this._processingQueue || this._eventQueue.length === 0) {
      return;
    }

    this._processingQueue = true;

    try {
      while (this._eventQueue.length > 0) {
        const event = this._eventQueue[0];
        
        await this._processEvent(event);
        
        // 从队列中移除
        this._eventQueue.shift();
      }
    } catch (error) {
      this._log('error', 'Queue processing error', { error: error.message });
    } finally {
      this._processingQueue = false;
    }
  }

  /**
   * 处理单个事件
   * @private
   * @param {TriggerEvent} event - 事件
   */
  async _processEvent(event) {
    event.processed = true;
    
    this._log('debug', `Processing event: ${event.id}`, { type: event.type });
    
    this.emit('event:processing', { event });

    try {
      // 根据事件类型触发不同的处理逻辑
      switch (event.type) {
        case TriggerType.FILE:
          this.emit('trigger:file', event);
          break;
        case TriggerType.SCHEDULE:
          this.emit('trigger:schedule', event);
          break;
        case TriggerType.MANUAL:
          this.emit('trigger:manual', event);
          break;
        case TriggerType.WEBHOOK:
          this.emit('trigger:webhook', event);
          break;
        case TriggerType.EVENT:
          this.emit(`trigger:event:${event.payload.eventName}`, event);
          this.emit('trigger:event', event);
          break;
      }

      this.emit('event:processed', { event, success: true });
    } catch (error) {
      this._log('error', `Event processing failed: ${event.id}`, { error: error.message });
      this.emit('event:processed', { event, success: false, error });
    }
  }

  /**
   * 启动文件监控
   * @private
   * @async
   */
  async _startFileWatcher() {
    if (this._config.file && !this._watchers.has('default')) {
      await this.addFileWatcher(this._config.file, 'default');
    }
  }

  /**
   * 停止文件监控
   * @private
   * @async
   */
  async _stopFileWatcher() {
    for (const [watcherId] of this._watchers) {
      await this.removeFileWatcher(watcherId);
    }
  }

  /**
   * 停止所有定时任务
   * @private
   * @async
   */
  async _stopAllSchedules() {
    for (const [scheduleId] of this._schedules) {
      await this.removeSchedule(scheduleId);
    }
  }

  /**
   * 启动去重缓存清理
   * @private
   */
  _startDeduplicationCleanup() {
    // 每5分钟清理过期的去重缓存
    setInterval(() => {
      const now = Date.now();
      const window = this._config.deduplicateWindowMs;
      
      for (const [key, timestamp] of this._deduplicationMap) {
        if (now - timestamp > window * 2) {
          this._deduplicationMap.delete(key);
        }
      }
    }, 5 * 60 * 1000);
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
      module: 'TriggerManager',
      ...meta
    };

    const logFn = level === 'error' ? console.error : 
                  level === 'warn' ? console.warn : console.log;
    logFn(`[TriggerManager] ${message}`, meta);

    this.emit('log', logEntry);
  }
}

/**
 * 创建触发器管理器的工厂函数
 * @param {TriggerConfig} config - 配置
 * @returns {TriggerManager}
 */
export function createTriggerManager(config = {}) {
  return new TriggerManager(config);
}

/**
 * 解析cron表达式（简化版）
 * @param {string} cron - Cron表达式
 * @returns {Object}
 */
export function parseCron(cron) {
  const parts = cron.split(' ');
  if (parts.length !== 5) {
    throw new Error('Invalid cron expression: must have 5 parts');
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  return {
    minute,
    hour,
    dayOfMonth,
    month,
    dayOfWeek,
    isValid: true
  };
}

export default TriggerManager;
