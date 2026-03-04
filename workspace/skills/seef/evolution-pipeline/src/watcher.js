/**
 * 文件监控模块 (File Watcher)
 * 
 * 功能：监控skills/目录变更，触发流水线
 * 实现：chokidar文件监听 + 变更去重 + 事件触发
 */

const fs = require('fs');
const path = require('path');

class FileWatcher {
  constructor(config = {}) {
    this.config = config;
    this.watchPaths = config.watch?.paths || [require('../../../_shared/paths').SKILLS_DIR];
    this.ignored = config.watch?.ignored || [
      '**/node_modules/**',
      '**/.git/**',
      '**/.pipeline/**',
      '**/logs/**',
      '**/tests/**',
      '**/*.log'
    ];
    this.debounceMs = config.watch?.debounceMs || 300000; // 5分钟防抖
    this.checkIntervalMs = config.watch?.checkIntervalMs || 300000;
    
    this.chokidar = null;
    this.changeBuffer = new Map(); // 变更缓冲区
    this.onChangeCallback = null;
    this.isRunning = false;
    this.intervalId = null;
  }

  /**
   * 初始化chokidar
   */
  async initialize() {
    // 尝试加载chokidar
    try {
      this.chokidar = require('chokidar');
      console.log('[FileWatcher] chokidar已加载');
    } catch (e) {
      console.warn('[FileWatcher] chokidar未安装，使用轮询模式');
      this.chokidar = null;
    }
  }

  /**
   * 启动监控
   * @param {Function} onChange - 变更回调函数
   */
  async start(onChange) {
    if (this.isRunning) {
      console.warn('[FileWatcher] 监控已在运行');
      return;
    }
    
    this.onChangeCallback = onChange;
    this.isRunning = true;
    
    console.log('[FileWatcher] 启动文件监控...');
    console.log(`[FileWatcher] 监控路径: ${this.watchPaths.join(', ')}`);
    
    if (this.chokidar) {
      await this.startChokidarMode();
    } else {
      await this.startPollingMode();
    }
    
    // 启动防抖处理定时器
    this.intervalId = setInterval(() => {
      this.processChangeBuffer();
    }, this.debounceMs);
    
    console.log('[FileWatcher] 文件监控已启动');
  }

  /**
   * chokidar模式（高效）
   */
  async startChokidarMode() {
    const watcher = this.chokidar.watch(this.watchPaths, {
      ignored: this.ignored,
      persistent: true,
      ignoreInitial: true,
      depth: 2, // 只监控到技能目录层级
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100
      }
    });
    
    watcher
      .on('add', (filePath) => this.handleFileChange(filePath, 'add'))
      .on('change', (filePath) => this.handleFileChange(filePath, 'change'))
      .on('unlink', (filePath) => this.handleFileChange(filePath, 'delete'))
      .on('addDir', (dirPath) => this.handleDirChange(dirPath, 'add'))
      .on('unlinkDir', (dirPath) => this.handleDirChange(dirPath, 'delete'))
      .on('error', (error) => console.error(`[FileWatcher] 监控错误: ${error}`))
      .on('ready', () => console.log('[FileWatcher] 初始扫描完成，开始监控'));
  }

  /**
   * 轮询模式（降级方案）
   */
  async startPollingMode() {
    console.log('[FileWatcher] 使用轮询模式');
    
    // 记录初始状态
    this.lastScan = this.scanSkillsDirectory();
    
    // 定期轮询
    this.intervalId = setInterval(() => {
      this.pollForChanges();
    }, this.checkIntervalMs);
  }

  /**
   * 扫描技能目录
   * @returns {Map} 文件状态映射
   */
  scanSkillsDirectory() {
    const states = new Map();
    
    for (const watchPath of this.watchPaths) {
      if (!fs.existsSync(watchPath)) continue;
      
      const entries = fs.readdirSync(watchPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        
        const skillPath = path.join(watchPath, entry.name);
        const skillMdPath = path.join(skillPath, 'SKILL.md');
        
        // 只监控包含SKILL.md的目录（技能目录）
        if (fs.existsSync(skillMdPath)) {
          const stats = fs.statSync(skillMdPath);
          states.set(entry.name, {
            path: skillPath,
            mtime: stats.mtime.getTime(),
            size: stats.size
          });
        }
      }
    }
    
    return states;
  }

  /**
   * 轮询检测变更
   */
  pollForChanges() {
    const currentScan = this.scanSkillsDirectory();
    
    // 检测新增和修改
    for (const [skillId, currentState] of currentScan) {
      const lastState = this.lastScan.get(skillId);
      
      if (!lastState) {
        // 新增技能
        this.handleFileChange(currentState.path, 'add');
      } else if (currentState.mtime !== lastState.mtime || currentState.size !== lastState.size) {
        // 修改
        this.handleFileChange(currentState.path, 'change');
      }
    }
    
    // 检测删除
    for (const [skillId, lastState] of this.lastScan) {
      if (!currentScan.has(skillId)) {
        this.handleFileChange(lastState.path, 'delete');
      }
    }
    
    this.lastScan = currentScan;
  }

  /**
   * 处理文件变更
   * @param {string} filePath - 文件路径
   * @param {string} type - 变更类型
   */
  handleFileChange(filePath, type) {
    // 只关注SKILL.md的变更
    if (!filePath.endsWith('SKILL.md')) return;
    
    const skillPath = path.dirname(filePath);
    const skillId = path.basename(skillPath);
    
    console.log(`[FileWatcher] 检测到变更: ${skillId} (${type})`);
    
    // 添加到变更缓冲区（防抖）
    this.changeBuffer.set(skillId, {
      skillPath,
      type,
      timestamp: Date.now()
    });
  }

  /**
   * 处理目录变更
   * @param {string} dirPath - 目录路径
   * @param {string} type - 变更类型
   */
  handleDirChange(dirPath, type) {
    // 只监控技能目录（直接子目录）
    const parentDir = path.dirname(dirPath);
    const isSkillsDir = this.watchPaths.some(p => 
      path.resolve(parentDir) === path.resolve(p)
    );
    
    if (!isSkillsDir) return;
    
    const skillId = path.basename(dirPath);
    
    console.log(`[FileWatcher] 检测到目录变更: ${skillId} (${type})`);
    
    this.changeBuffer.set(skillId, {
      skillPath: dirPath,
      type,
      timestamp: Date.now()
    });
  }

  /**
   * 处理变更缓冲区
   */
  processChangeBuffer() {
    if (this.changeBuffer.size === 0) return;
    
    const now = Date.now();
    const readyChanges = [];
    
    // 找出超过防抖时间的变更
    for (const [skillId, change] of this.changeBuffer) {
      if (now - change.timestamp >= this.debounceMs) {
        readyChanges.push({ skillId, ...change });
        this.changeBuffer.delete(skillId);
      }
    }
    
    // 触发回调
    if (readyChanges.length > 0 && this.onChangeCallback) {
      console.log(`[FileWatcher] 触发 ${readyChanges.length} 个变更`);
      
      for (const change of readyChanges) {
        try {
          this.onChangeCallback(change.skillPath, change.type);
        } catch (e) {
          console.error(`[FileWatcher] 处理变更失败: ${change.skillId}`, e.message);
        }
      }
    }
  }

  /**
   * 停止监控
   */
  async stop() {
    if (!this.isRunning) return;
    
    console.log('[FileWatcher] 停止文件监控...');
    
    this.isRunning = false;
    
    // 清除定时器
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    // 处理剩余变更
    this.processChangeBuffer();
    
    console.log('[FileWatcher] 文件监控已停止');
  }

  /**
   * 获取监控统计
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      isRunning: this.isRunning,
      bufferedChanges: this.changeBuffer.size,
      watchPaths: this.watchPaths,
      mode: this.chokidar ? 'chokidar' : 'polling'
    };
  }
}

// 如果直接运行此文件
if (require.main === module) {
  const configPath = path.join(__dirname, '../config/pipeline.config.json');
  let config = {};
  
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  }
  
  const watcher = new FileWatcher(config);
  
  watcher.initialize().then(() => {
    watcher.start((skillPath, type) => {
      console.log(`[Watcher] 变更确认: ${path.basename(skillPath)} (${type})`);
      // 这里可以触发流水线引擎
    });
  });
  
  // 优雅关闭
  process.on('SIGINT', async () => {
    await watcher.stop();
    process.exit(0);
  });
}

module.exports = { FileWatcher };
