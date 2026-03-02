/**
 * Memory Guardian - 内存守护模块
 * @version 1.0.0
 * @description 监控系统内存，智能扩缩容沙盒池，防止OOM崩溃
 */

const { EventEmitter } = require('events');
const os = require('os');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

// ============================================================================
// 内存阈值配置
// ============================================================================

const MEMORY_THRESHOLDS = {
  // 系统级阈值
  SYSTEM_CRITICAL: 90,    // 90% - 紧急释放所有沙盒
  SYSTEM_WARNING: 75,     // 75% - 缩减容器数量
  SYSTEM_CAUTION: 60,     // 60% - 停止扩容
  
  // 沙盒池阈值
  POOL_MAX_MEMORY_MB: 1536,  // 沙盒池最大占用1.5GB（留2.5GB给系统）
  POOL_MIN_CONTAINERS: 1,    // 最少保留1个容器
  POOL_MAX_CONTAINERS: 5     // 最多5个容器
};

// ============================================================================
// 内存监控器
// ============================================================================

class MemoryMonitor extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = {
      checkInterval: 5000,    // 5秒检查一次
      criticalInterval: 1000, // 紧急情况1秒检查
      ...config
    };
    
    this.isRunning = false;
    this.currentStatus = 'normal';  // normal | caution | warning | critical
    this.history = [];              // 内存使用历史
    this.maxHistorySize = 60;       // 保留60个数据点（5分钟）
  }

  /**
   * 启动监控
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    
    console.log('[MemoryGuardian] Monitor started');
    this._monitorLoop();
  }

  /**
   * 停止监控
   */
  stop() {
    this.isRunning = false;
    console.log('[MemoryGuardian] Monitor stopped');
  }

  /**
   * 获取当前内存状态
   */
  async getMemoryStatus() {
    try {
      // 方法1: 读取/proc/meminfo（Linux）
      if (process.platform === 'linux') {
        return await this._getLinuxMemory();
      }
      
      // 方法2: 使用Node.js os模块
      return this._getNodeMemory();
      
    } catch (error) {
      console.error('[MemoryGuardian] Failed to get memory status:', error);
      return this._getNodeMemory();  // 降级
    }
  }

  /**
   * 读取Linux内存信息
   */
  async _getLinuxMemory() {
    try {
      const { stdout } = await execAsync('cat /proc/meminfo');
      const lines = stdout.split('\n');
      
      let total = 0;
      let available = 0;
      
      for (const line of lines) {
        if (line.startsWith('MemTotal:')) {
          total = parseInt(line.match(/\d+/)[0]) * 1024;  // KB to bytes
        }
        if (line.startsWith('MemAvailable:')) {
          available = parseInt(line.match(/\d+/)[0]) * 1024;
        }
      }
      
      const used = total - available;
      const percentage = Math.round((used / total) * 100);
      
      return {
        total,
        used,
        available,
        percentage,
        timestamp: Date.now()
      };
      
    } catch (error) {
      throw error;
    }
  }

  /**
   * Node.js方式获取内存（不太准确但跨平台）
   */
  _getNodeMemory() {
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;
    
    return {
      total,
      used,
      available: free,
      percentage: Math.round((used / total) * 100),
      timestamp: Date.now()
    };
  }

  /**
   * 获取Docker容器内存占用
   */
  async getContainerMemory() {
    try {
      const { stdout } = await execAsync(
        "docker ps -q | xargs -I {} docker stats --no-stream --format '{{.Container}} {{.MemUsage}}' {} 2>/dev/null || echo ''"
      );
      
      const containers = [];
      for (const line of stdout.trim().split('\n')) {
        if (!line) continue;
        const parts = line.split(' ');
        if (parts.length >= 2) {
          const memStr = parts[parts.length - 2];  // e.g., "256MiB"
          const memMB = this._parseMemoryString(memStr);
          containers.push({
            id: parts[0],
            memoryMB: memMB
          });
        }
      }
      
      const totalContainerMemory = containers.reduce((sum, c) => sum + c.memoryMB, 0);
      
      return {
        containers,
        totalMB: totalContainerMemory,
        count: containers.length
      };
      
    } catch (error) {
      return { containers: [], totalMB: 0, count: 0 };
    }
  }

  /**
   * 解析内存字符串（如 "256MiB" -> 256）
   */
  _parseMemoryString(str) {
    const match = str.match(/([\d.]+)([KMGT]i?B?)/i);
    if (!match) return 0;
    
    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();
    
    const multipliers = {
      'K': 1/1024,
      'M': 1,
      'G': 1024,
      'T': 1024 * 1024
    };
    
    return Math.round(value * (multipliers[unit.charAt(0)] || 1));
  }

  // ==========================================================================
  // 监控循环
  // ==========================================================================

  async _monitorLoop() {
    while (this.isRunning) {
      const memory = await this.getMemoryStatus();
      const containerMem = await this.getContainerMemory();
      
      // 记录历史
      this.history.push({
        system: memory,
        containers: containerMem,
        timestamp: Date.now()
      });
      
      if (this.history.length > this.maxHistorySize) {
        this.history.shift();
      }
      
      // 检查阈值并触发事件
      await this._checkThresholds(memory, containerMem);
      
      // 确定检查间隔
      const interval = this.currentStatus === 'critical' 
        ? this.config.criticalInterval 
        : this.config.checkInterval;
      
      await this._sleep(interval);
    }
  }

  async _checkThresholds(memory, containerMem) {
    const percentage = memory.percentage;
    const oldStatus = this.currentStatus;
    
    // 确定新状态
    if (percentage >= MEMORY_THRESHOLDS.SYSTEM_CRITICAL) {
      this.currentStatus = 'critical';
    } else if (percentage >= MEMORY_THRESHOLDS.SYSTEM_WARNING) {
      this.currentStatus = 'warning';
    } else if (percentage >= MEMORY_THRESHOLDS.SYSTEM_CAUTION) {
      this.currentStatus = 'caution';
    } else {
      this.currentStatus = 'normal';
    }
    
    // 状态变化时触发事件
    if (oldStatus !== this.currentStatus) {
      console.log(`[MemoryGuardian] Status changed: ${oldStatus} -> ${this.currentStatus} (${percentage}%)`);
      
      this.emit('statusChange', {
        from: oldStatus,
        to: this.currentStatus,
        memory,
        containers: containerMem
      });
    }
    
    // 触发具体阈值事件
    if (percentage >= MEMORY_THRESHOLDS.SYSTEM_CRITICAL) {
      this.emit('critical', { memory, containers: containerMem });
    } else if (percentage >= MEMORY_THRESHOLDS.SYSTEM_WARNING) {
      this.emit('warning', { memory, containers: containerMem });
    } else if (percentage >= MEMORY_THRESHOLDS.SYSTEM_CAUTION) {
      this.emit('caution', { memory, containers: containerMem });
    } else {
      this.emit('normal', { memory, containers: containerMem });
    }
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ==========================================================================
  // 查询方法
  // ==========================================================================

  /**
   * 获取内存趋势
   */
  getTrend(minutes = 5) {
    const cutoff = Date.now() - (minutes * 60 * 1000);
    const recent = this.history.filter(h => h.timestamp >= cutoff);
    
    if (recent.length < 2) return 'insufficient_data';
    
    const first = recent[0].system.percentage;
    const last = recent[recent.length - 1].system.percentage;
    
    const diff = last - first;
    if (diff > 5) return 'rising';
    if (diff < -5) return 'falling';
    return 'stable';
  }

  /**
   * 获取统计信息
   */
  getStats() {
    if (this.history.length === 0) return null;
    
    const percentages = this.history.map(h => h.system.percentage);
    const containerMemories = this.history.map(h => h.containers.totalMB);
    
    return {
      current: {
        system: this.history[this.history.length - 1].system,
        containers: this.history[this.history.length - 1].containers
      },
      avg: {
        systemPercentage: Math.round(percentages.reduce((a, b) => a + b, 0) / percentages.length),
        containerMemoryMB: Math.round(containerMemories.reduce((a, b) => a + b, 0) / containerMemories.length)
      },
      max: {
        systemPercentage: Math.max(...percentages),
        containerMemoryMB: Math.max(...containerMemories)
      },
      trend: this.getTrend()
    };
  }
}

// ============================================================================
// 智能扩缩容控制器
// ============================================================================

class SmartScalingController extends EventEmitter {
  constructor(containerPool, memoryMonitor, config = {}) {
    super();
    this.containerPool = containerPool;
    this.memoryMonitor = memoryMonitor;
    this.config = {
      targetUtilization: 70,  // 目标内存使用率70%
      scaleDownDelay: 60000,  // 缩容延迟1分钟（防止抖动）
      scaleUpDelay: 10000,    // 扩容延迟10秒
      ...config
    };
    
    this.targetSize = containerPool.config.poolSize;
    this.lastScaleTime = 0;
    this.scaleReason = null;
    
    this._setupListeners();
  }

  /**
   * 设置监听器
   */
  _setupListeners() {
    this.memoryMonitor.on('critical', async ({ memory, containers }) => {
      await this._handleCritical(memory, containers);
    });
    
    this.memoryMonitor.on('warning', async ({ memory, containers }) => {
      await this._handleWarning(memory, containers);
    });
    
    this.memoryMonitor.on('caution', async ({ memory, containers }) => {
      await this._handleCaution(memory, containers);
    });
    
    this.memoryMonitor.on('normal', async ({ memory, containers }) => {
      await this._handleNormal(memory, containers);
    });
  }

  /**
   * 处理危急情况（90%+）
   */
  async _handleCritical(memory, containers) {
    console.error('[SmartScaling] 🚨 CRITICAL MEMORY! Emergency shutdown...');
    
    this.scaleReason = 'critical_memory';
    this.targetSize = MEMORY_THRESHOLDS.POOL_MIN_CONTAINERS;
    
    // 立即终止大部分容器，只留1个
    await this._emergencyScaleDown();
    
    this.emit('emergency', {
      message: '内存告急！已释放沙盒容器',
      memory: memory.percentage,
      action: 'emergency_release'
    });
  }

  /**
   * 处理警告（75%+）
   */
  async _handleWarning(memory, containers) {
    console.warn('[SmartScaling] ⚠️ High memory usage, scaling down...');
    
    const currentSize = this._getCurrentPoolSize();
    const newSize = Math.max(
      MEMORY_THRESHOLDS.POOL_MIN_CONTAINERS,
      Math.floor(currentSize * 0.6)  // 缩减到60%
    );
    
    if (newSize < currentSize) {
      this.targetSize = newSize;
      this.scaleReason = 'high_memory';
      await this._scaleDown(newSize);
      
      this.emit('scaled', {
        from: currentSize,
        to: newSize,
        reason: 'high_memory',
        memory: memory.percentage
      });
    }
  }

  /**
   * 处理注意（60%+）
   */
  async _handleCaution(memory, containers) {
    // 停止扩容，保持当前规模
    if (this.targetSize > this._getCurrentPoolSize()) {
      console.log('[SmartScaling] Caution zone, preventing scale up');
      this.targetSize = this._getCurrentPoolSize();
    }
  }

  /**
   * 处理正常状态（<60%）
   */
  async _handleNormal(memory, containers) {
    const currentSize = this._getCurrentPoolSize();
    
    // 如果容器太少且内存充足，可以考虑扩容
    if (currentSize < 3 && memory.percentage < 50) {
      const timeSinceLastScale = Date.now() - this.lastScaleTime;
      
      if (timeSinceLastScale > this.config.scaleUpDelay) {
        const newSize = Math.min(3, currentSize + 1);  // 保守扩容
        
        this.targetSize = newSize;
        this.scaleReason = 'memory_available';
        await this._scaleUp(newSize);
        
        this.emit('scaled', {
          from: currentSize,
          to: newSize,
          reason: 'memory_available',
          memory: memory.percentage
        });
      }
    }
  }

  /**
   * 紧急缩容
   */
  async _emergencyScaleDown() {
    // 杀死除第一个外的所有容器
    const containers = Array.from(this.containerPool.containers.values());
    
    for (let i = 1; i < containers.length; i++) {
      const container = containers[i];
      if (container.state !== 'busy') {
        console.log(`[SmartScaling] Killing container ${container.id} for emergency`);
        await container.destroy();
      }
    }
    
    this.lastScaleTime = Date.now();
  }

  /**
   * 缩容到指定数量
   */
  async _scaleDown(targetCount) {
    const containers = Array.from(this.containerPool.containers.values())
      .filter(c => c.state === 'idle');  // 只杀空闲容器
    
    const toRemove = containers.slice(0, containers.length - targetCount);
    
    for (const container of toRemove) {
      console.log(`[SmartScaling] Removing container ${container.id}`);
      await container.destroy();
      this.containerPool.containers.delete(container.id);
    }
    
    this.lastScaleTime = Date.now();
  }

  /**
   * 扩容
   */
  async _scaleUp(targetCount) {
    const currentCount = this._getCurrentPoolSize();
    const toAdd = targetCount - currentCount;
    
    for (let i = 0; i < toAdd; i++) {
      const newId = currentCount + i;
      console.log(`[SmartScaling] Adding container ${newId}`);
      await this.containerPool._createContainer(newId);
    }
    
    this.lastScaleTime = Date.now();
  }

  _getCurrentPoolSize() {
    return this.containerPool.containers.size;
  }

  /**
   * 获取扩缩容状态
   */
  getStatus() {
    return {
      targetSize: this.targetSize,
      currentSize: this._getCurrentPoolSize(),
      lastScaleTime: this.lastScaleTime,
      lastScaleReason: this.scaleReason,
      canScaleUp: this.memoryMonitor.currentStatus === 'normal',
      canScaleDown: ['warning', 'critical'].includes(this.memoryMonitor.currentStatus)
    };
  }
}

// ============================================================================
// 导出
// ============================================================================

module.exports = {
  MemoryMonitor,
  SmartScalingController,
  MEMORY_THRESHOLDS
};

// 测试
if (require.main === module) {
  const monitor = new MemoryMonitor({ checkInterval: 3000 });
  
  monitor.on('statusChange', ({ from, to, memory }) => {
    console.log(`Memory: ${memory.percentage}%, ${from} -> ${to}`);
  });
  
  monitor.on('critical', () => {
    console.error('🚨 CRITICAL MEMORY! Take action now!');
  });
  
  monitor.start();
  
  setInterval(() => {
    const stats = monitor.getStats();
    if (stats) {
      console.log(`[Stats] Avg: ${stats.avg.systemPercentage}%, Trend: ${stats.trend}`);
    }
  }, 10000);
}
