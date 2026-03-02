/**
 * @fileoverview 文件监控模块 (File Watcher) - EvoMap进化流水线核心
 * @description 监控skills/目录变更，触发流水线执行
 * @module Watcher
 * @version 1.0.0
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { EventEmitter } from 'events';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 变更类型枚举
 * @readonly
 * @enum {string}
 */
export const ChangeType = {
  ADD: 'add',
  CHANGE: 'change',
  DELETE: 'delete',
  ADD_DIR: 'addDir',
  DELETE_DIR: 'unlinkDir'
};

/**
 * 文件监控类
 * @class Watcher
 * @extends EventEmitter
 * @description 基于chokidar的文件监控，支持防抖和变更去重
 */
class Watcher extends EventEmitter {
  /**
   * @constructor
   * @param {Object} config - 配置选项
   * @param {string[]} [config.watchPaths] - 监控路径列表
   * @param {string[]} [config.ignored] - 忽略模式列表
   * @param {number} [config.debounceMs=300000] - 防抖时间（毫秒）
   * @param {number} [config.checkIntervalMs=300000] - 轮询间隔（毫秒）
   * @param {number} [config.depth=2] - 监控深度
   * @param {Object} [config.logger] - 日志记录器
   */
  constructor(config = {}) {
    super();
    
    this.config = {
      watchPaths: config.watchPaths || ['/root/.openclaw/workspace/skills'],
      ignored: config.ignored || [
        '**/node_modules/**',
        '**/.git/**',
        '**/.pipeline/**',
        '**/logs/**',
        '**/tests/**',
        '**/__tests__/**',
        '**/*.log',
        '**/evolution-pipeline/**'
      ],
      debounceMs: config.debounceMs || 300000, // 5分钟防抖
      checkIntervalMs: config.checkIntervalMs || 300000,
      depth: config.depth || 2,
      ...config
    };
    
    this.logger = config.logger || console;
    
    // chokidar实例
    this.chokidar = null;
    this.watcherInstance = null;
    
    // 变更缓冲区（用于防抖）
    this.changeBuffer = new Map();
    
    // 状态
    this.isRunning = false;
    this.intervalId = null;
    this.lastScan = null;
    
    // 统计
    this.stats = {
      changesDetected: 0,
      changesProcessed: 0,
      startTime: null
    };
  }

  /**
   * 初始化chokidar
   * @async
   * @returns {Promise<boolean>} 是否成功加载chokidar
   */
  async initialize() {
    // 尝试加载chokidar
    try {
      const chokidarModule = await import('chokidar');
      this.chokidar = chokidarModule.default || chokidarModule;
      this.logger.info('[Watcher] chokidar已加载');
      return true;
    } catch (e) {
      this.logger.warn('[Watcher] chokidar未安装，将使用轮询模式');
      this.chokidar = null;
      return false;
    }
  }

  /**
   * 启动监控
   * @async
   * @returns {Promise<void>}
   */
  async start() {
    if (this.isRunning) {
      this.logger.warn('[Watcher] 监控已在运行');
      return;
    }
    
    // 确保已初始化
    if (!this.chokidar && !(await this.initialize())) {
      // 初始化失败，使用轮询模式
    }
    
    this.isRunning = true;
    this.stats.startTime = new Date().toISOString();
    
    this.logger.info('[Watcher] 启动文件监控...');
    this.logger.info(`[Watcher] 监控路径: ${this.config.watchPaths.join(', ')}`);
    this.logger.info(`[Watcher] 防抖时间: ${this.config.debounceMs}ms`);
    
    if (this.chokidar) {
      await this.startChokidarMode();
    } else {
      await this.startPollingMode();
    }
    
    // 启动防抖处理定时器
    this.intervalId = setInterval(() => {
      this.processChangeBuffer();
    }, Math.min(this.config.debounceMs, 30000)); // 最少30秒检查一次
    
    this.logger.info('[Watcher] 文件监控已启动');
    this.emit('started');
  }

  /**
   * chokidar模式（高效）
   * @async
   * @private
   */
  async startChokidarMode() {
    this.watcherInstance = this.chokidar.watch(this.config.watchPaths, {
      ignored: this.config.ignored,
      persistent: true,
      ignoreInitial: true,
      depth: this.config.depth,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100
      }
    });
    
    this.watcherInstance
      .on('add', (filePath) => this.handleFileChange(filePath, ChangeType.ADD))
      .on('change', (filePath) => this.handleFileChange(filePath, ChangeType.CHANGE))
      .on('unlink', (filePath) => this.handleFileChange(filePath, ChangeType.DELETE))
      .on('addDir', (dirPath) => this.handleDirChange(dirPath, ChangeType.ADD_DIR))
      .on('unlinkDir', (dirPath) => this.handleDirChange(dirPath, ChangeType.DELETE_DIR))
      .on('error', (error) => {
        this.logger.error(`[Watcher] 监控错误: ${error.message}`);
        this.emit('error', error);
      })
      .on('ready', () => {
        this.logger.info('[Watcher] 初始扫描完成，开始监控');
        this.emit('ready');
      });
  }

  /**
   * 轮询模式（降级方案）
   * @async
   * @private
   */
  async startPollingMode() {
    this.logger.info('[Watcher] 使用轮询模式');
    
    // 记录初始状态
    this.lastScan = this.scanSkillsDirectory();
    
    // 定期轮询
    const poll = () => {
      if (!this.isRunning) return;
      this.pollForChanges();
      setTimeout(poll, this.config.checkIntervalMs);
    };
    
    setTimeout(poll, this.config.checkIntervalMs);
    this.emit('ready');
  }

  /**
   * 扫描技能目录
   * @private
   * @returns {Map<string, Object>} 文件状态映射
   */
  scanSkillsDirectory() {
    const states = new Map();
    
    for (const watchPath of this.config.watchPaths) {
      if (!fs.existsSync(watchPath)) {
        this.logger.warn(`[Watcher] 监控路径不存在: ${watchPath}`);
        continue;
      }
      
      try {
        const entries = fs.readdirSync(watchPath, { withFileTypes: true });
        
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          
          const skillPath = path.join(watchPath, entry.name);
          const skillMdPath = path.join(skillPath, 'SKILL.md');
          
          // 只监控包含SKILL.md的目录（技能目录）
          if (fs.existsSync(skillMdPath)) {
            try {
              const stats = fs.statSync(skillMdPath);
              states.set(entry.name, {
                path: skillPath,
                mtime: stats.mtime.getTime(),
                size: stats.size
              });
            } catch (e) {
              // 忽略无法访问的文件
            }
          }
        }
      } catch (e) {
        this.logger.error(`[Watcher] 扫描目录失败: ${watchPath}`, e.message);
      }
    }
    
    return states;
  }

  /**
   * 轮询检测变更
   * @private
   */
  pollForChanges() {
    const currentScan = this.scanSkillsDirectory();
    
    // 检测新增和修改
    for (const [skillId, currentState] of currentScan) {
      const lastState = this.lastScan?.get(skillId);
      
      if (!lastState) {
        // 新增技能
        this.handleFileChange(path.join(currentState.path, 'SKILL.md'), ChangeType.ADD);
      } else if (currentState.mtime !== lastState.mtime || currentState.size !== lastState.size) {
        // 修改
        this.handleFileChange(path.join(currentState.path, 'SKILL.md'), ChangeType.CHANGE);
      }
    }
    
    // 检测删除
    if (this.lastScan) {
      for (const [skillId, lastState] of this.lastScan) {
        if (!currentScan.has(skillId)) {
          this.handleFileChange(path.join(lastState.path, 'SKILL.md'), ChangeType.DELETE);
        }
      }
    }
    
    this.lastScan = currentScan;
  }

  /**
   * 处理文件变更
   * @private
   * @param {string} filePath - 文件路径
   * @param {string} type - 变更类型
   */
  handleFileChange(filePath, type) {
    // 只关注SKILL.md的变更
    if (!filePath.endsWith('SKILL.md')) return;
    
    const skillPath = path.dirname(filePath);
    const skillId = path.basename(skillPath);
    
    this.logger.info(`[Watcher] 检测到变更: ${skillId} (${type})`);
    
    this.stats.changesDetected++;
    
    // 添加到变更缓冲区（防抖）
    this.changeBuffer.set(skillId, {
      skillPath,
      type,
      timestamp: Date.now()
    });
    
    // 触发changeDetected事件
    this.emit('changeDetected', { skillId, skillPath, type });
  }

  /**
   * 处理目录变更
   * @private
   * @param {string} dirPath - 目录路径
   * @param {string} type - 变更类型
   */
  handleDirChange(dirPath, type) {
    // 只监控技能目录（直接子目录）
    const parentDir = path.dirname(dirPath);
    const isSkillsDir = this.config.watchPaths.some(p => 
      path.resolve(parentDir) === path.resolve(p)
    );
    
    if (!isSkillsDir) return;
    
    const skillId = path.basename(dirPath);
    
    this.logger.info(`[Watcher] 检测到目录变更: ${skillId} (${type})`);
    
    this.changeBuffer.set(skillId, {
      skillPath: dirPath,
      type,
      timestamp: Date.now()
    });
    
    this.emit('changeDetected', { skillId, skillPath: dirPath, type });
  }

  /**
   * 处理变更缓冲区
   * @private
   */
  processChangeBuffer() {
    if (this.changeBuffer.size === 0) return;
    
    const now = Date.now();
    const readyChanges = [];
    
    // 找出超过防抖时间的变更
    for (const [skillId, change] of this.changeBuffer) {
      if (now - change.timestamp >= this.config.debounceMs) {
        readyChanges.push({ skillId, ...change });
        this.changeBuffer.delete(skillId);
      }
    }
    
    // 触发变更事件
    if (readyChanges.length > 0) {
      this.logger.info(`[Watcher] 触发 ${readyChanges.length} 个变更`);
      this.stats.changesProcessed += readyChanges.length;
      
      for (const change of readyChanges) {
        try {
          this.emit('change', {
            skillId: change.skillId,
            skillPath: change.skillPath,
            type: change.type,
            timestamp: change.timestamp
          });
        } catch (e) {
          this.logger.error(`[Watcher] 处理变更失败: ${change.skillId}`, e.message);
          this.emit('error', { error: e, change });
        }
      }
    }
  }

  /**
   * 停止监控
   * @async
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.isRunning) return;
    
    this.logger.info('[Watcher] 停止文件监控...');
    
    this.isRunning = false;
    
    // 清除定时器
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    // 关闭chokidar
    if (this.watcherInstance) {
      await this.watcherInstance.close();
      this.watcherInstance = null;
    }
    
    // 处理剩余变更
    this.processChangeBuffer();
    
    this.logger.info('[Watcher] 文件监控已停止');
    this.emit('stopped');
  }

  /**
   * 强制处理当前缓冲区（忽略防抖）
   * @returns {Array<Object>} 处理的变更列表
   */
  flushBuffer() {
    const changes = [];
    
    for (const [skillId, change] of this.changeBuffer) {
      changes.push({ skillId, ...change });
    }
    
    this.changeBuffer.clear();
    
    for (const change of changes) {
      this.emit('change', {
        skillId: change.skillId,
        skillPath: change.skillPath,
        type: change.type,
        timestamp: change.timestamp
      });
    }
    
    return changes;
  }

  /**
   * 获取监控统计
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      ...this.stats,
      isRunning: this.isRunning,
      bufferedChanges: this.changeBuffer.size,
      watchPaths: this.config.watchPaths,
      mode: this.chokidar ? 'chokidar' : 'polling',
      uptime: this.stats.startTime 
        ? Date.now() - new Date(this.stats.startTime).getTime() 
        : 0
    };
  }

  /**
   * 添加监控路径
   * @param {string} watchPath - 要添加的路径
   */
  addWatchPath(watchPath) {
    if (!this.config.watchPaths.includes(watchPath)) {
      this.config.watchPaths.push(watchPath);
      
      // 如果正在运行，需要重启
      if (this.isRunning) {
        this.logger.info(`[Watcher] 添加监控路径: ${watchPath}（将在重启后生效）`);
      }
    }
  }

  /**
   * 移除监控路径
   * @param {string} watchPath - 要移除的路径
   */
  removeWatchPath(watchPath) {
    const index = this.config.watchPaths.indexOf(watchPath);
    if (index > -1) {
      this.config.watchPaths.splice(index, 1);
      
      if (this.isRunning) {
        this.logger.info(`[Watcher] 移除监控路径: ${watchPath}（将在重启后生效）`);
      }
    }
  }
}

/**
 * 创建文件监控器的工厂函数
 * @param {Object} config - 配置选项
 * @returns {Watcher} 文件监控器实例
 */
export function createWatcher(config = {}) {
  return new Watcher(config);
}

export { Watcher };
export default Watcher;
