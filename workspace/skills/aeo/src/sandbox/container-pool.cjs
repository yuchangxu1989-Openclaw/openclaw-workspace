/**
 * Sandbox Container Pool - 沙盒容器池管理器
 * @version 1.0.0
 * @description 预创建容器池，实现评测任务的安全隔离执行
 */

const { spawn, exec } = require('child_process');
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const { MemoryMonitor, SmartScalingController } = require('./memory-guardian.cjs');

// ============================================================================
// 配置常量
// ============================================================================

const DEFAULT_CONFIG = {
  poolSize: 5,              // 容器池大小
  minIdle: 2,               // 最小空闲容器数
  maxWaitMs: 30000,         // 最大等待时间
  containerTimeout: 60000,  // 容器内任务超时
  cpuLimit: '0.5',          // CPU限制
  memoryLimit: '512m',      // 内存限制
  networkMode: 'none',      // 禁用网络（可选bridge）
  readonlyPaths: [          // 只读挂载路径
    '/input:ro',
    '/skills:ro'
  ],
  writablePath: '/output',  // 可写输出路径
  imageName: 'aeo-sandbox:latest',  // 沙盒镜像
  cleanupInterval: 300000,  // 5分钟清理一次僵尸容器
  healthCheckInterval: 60000  // 1分钟健康检查
};

// ============================================================================
// 容器状态枚举
// ============================================================================

const ContainerState = {
  IDLE: 'idle',           // 空闲可用
  BUSY: 'busy',           // 执行中
  INITIALIZING: 'init',   // 初始化中
  UNHEALTHY: 'unhealthy', // 不健康
  DESTROYED: 'destroyed'  // 已销毁
};

// ============================================================================
// 容器实例类
// ============================================================================

class Container {
  constructor(id, config) {
    this.id = id;
    this.containerId = null;  // Docker容器ID
    this.state = ContainerState.INITIALIZING;
    this.config = config;
    this.createdAt = Date.now();
    this.lastUsedAt = null;
    this.taskCount = 0;
    this.errorCount = 0;
    this.currentTask = null;
    this.process = null;
  }

  /**
   * 启动容器
   */
  async start() {
    return new Promise((resolve, reject) => {
      const containerName = `aeo-sandbox-${this.id}-${Date.now()}`;
      
      // 构建docker run命令
      const args = [
        'run', '-d', '--rm',
        '--name', containerName,
        '--cpus', this.config.cpuLimit,
        '--memory', this.config.memoryLimit,
        '--network', this.config.networkMode,
        '-v', `${path.join(__dirname, '../../temp/input')}:/input:ro`,
        '-v', `${path.join(__dirname, '../../temp/output')}:/output`,
        this.config.imageName,
        'tail', '-f', '/dev/null'  // 保持容器运行
      ];

      const docker = spawn('docker', args, { 
        stdio: ['ignore', 'pipe', 'pipe'] 
      });

      let stdout = '';
      let stderr = '';

      docker.stdout.on('data', (data) => { stdout += data; });
      docker.stderr.on('data', (data) => { stderr += data; });

      docker.on('close', (code) => {
        if (code === 0) {
          this.containerId = stdout.trim();
          this.state = ContainerState.IDLE;
          console.log(`[Container ${this.id}] Started: ${this.containerId.slice(0, 12)}`);
          resolve(this);
        } else {
          this.state = ContainerState.UNHEALTHY;
          reject(new Error(`Container start failed: ${stderr}`));
        }
      });

      docker.on('error', (err) => {
        this.state = ContainerState.UNHEALTHY;
        reject(err);
      });
    });
  }

  /**
   * 在容器内执行任务
   */
  async execute(task) {
    if (this.state !== ContainerState.IDLE) {
      throw new Error(`Container ${this.id} is not idle`);
    }

    this.state = ContainerState.BUSY;
    this.currentTask = task;
    this.lastUsedAt = Date.now();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this._killProcess();
        reject(new Error(`Task timeout after ${this.config.containerTimeout}ms`));
      }, this.config.containerTimeout);

      // 构建执行命令
      const execArgs = [
        'exec', this.containerId,
        'node', '-e', task.code
      ];

      const startTime = Date.now();
      this.process = spawn('docker', execArgs, {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      if (task.input) {
        this.process.stdin.write(JSON.stringify(task.input));
        this.process.stdin.end();
      }

      this.process.stdout.on('data', (data) => { stdout += data; });
      this.process.stderr.on('data', (data) => { stderr += data; });

      this.process.on('close', (code) => {
        clearTimeout(timeout);
        this.process = null;
        this.currentTask = null;
        this.taskCount++;

        const result = {
          exitCode: code,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          duration: Date.now() - startTime,
          containerId: this.id
        };

        if (code === 0) {
          this.state = ContainerState.IDLE;
          resolve(result);
        } else {
          this.errorCount++;
          this.state = ContainerState.IDLE;
          reject(new Error(`Task failed with code ${code}: ${stderr}`));
        }
      });
    });
  }

  /**
   * 健康检查
   */
  async healthCheck() {
    return new Promise((resolve) => {
      exec(`docker ps -q -f id=${this.containerId}`, (err, stdout) => {
        const isRunning = stdout.trim() === this.containerId;
        if (!isRunning && this.state !== ContainerState.DESTROYED) {
          this.state = ContainerState.UNHEALTHY;
        }
        resolve(isRunning);
      });
    });
  }

  /**
   * 销毁容器
   */
  async destroy() {
    if (this.containerId) {
      try {
        await new Promise((resolve) => {
          exec(`docker kill ${this.containerId}`, () => resolve());
        });
      } catch (e) {}
    }
    this.state = ContainerState.DESTROYED;
  }

  /**
   * 强制终止当前进程
   */
  _killProcess() {
    if (this.process) {
      this.process.kill('SIGKILL');
      // 同时kill容器内的进程
      exec(`docker exec ${this.containerId} pkill -9 node`);
    }
  }
}

// ============================================================================
// 容器池管理器
// ============================================================================

class ContainerPool extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.containers = new Map();
    this.waitQueue = [];
    this.stats = {
      totalTasks: 0,
      successfulTasks: 0,
      failedTasks: 0,
      avgWaitTime: 0,
      avgExecutionTime: 0
    };
    
    this._cleanupInterval = null;
    this._healthCheckInterval = null;
    
    // 内存监控与智能扩缩容
    this.memoryMonitor = null;
    this.scalingController = null;
    this.memoryAlerts = [];  // 内存告警记录
  }

  /**
   * 初始化容器池
   */
  async initialize() {
    console.log('[ContainerPool] Initializing...');
    
    // 检查系统内存是否足够
    const memStatus = await this._checkSystemMemory();
    if (!memStatus.sufficient) {
      console.warn(`[ContainerPool] ⚠️ Low memory (${memStatus.percentage}%), reducing pool size`);
      this.config.poolSize = Math.min(this.config.poolSize, 2);  // 限制最多2个容器
    }
    
    // 预创建容器
    const initPromises = [];
    for (let i = 0; i < this.config.poolSize; i++) {
      initPromises.push(this._createContainer(i));
    }

    await Promise.all(initPromises);
    
    // 启动定时任务
    this._startMaintenance();
    
    // 启动内存监控（4G内存环境下必需）
    await this._startMemoryGuardian();
    
    console.log(`[ContainerPool] Ready with ${this.config.poolSize} containers`);
    console.log(`[ContainerPool] Memory guardian active`);
    this.emit('ready');
  }

  /**
   * 检查系统内存
   */
  async _checkSystemMemory() {
    try {
      const { exec } = require('child_process');
      const util = require('util');
      const execAsync = util.promisify(exec);
      
      const { stdout } = await execAsync("free | grep Mem | awk '{print $3/$2 * 100.0}'");
      const percentage = parseFloat(stdout.trim());
      
      return {
        percentage,
        sufficient: percentage < 70  // 70%以下认为足够
      };
    } catch (e) {
      return { percentage: 0, sufficient: true };  // 默认允许
    }
  }

  /**
   * 启动内存守护
   */
  async _startMemoryGuardian() {
    // 初始化内存监控器
    this.memoryMonitor = new MemoryMonitor({
      checkInterval: 5000,    // 5秒检查
      criticalInterval: 1000  // 紧急情况1秒检查
    });
    
    // 初始化智能扩缩容控制器
    this.scalingController = new SmartScalingController(
      this,
      this.memoryMonitor,
      { targetUtilization: 70 }
    );
    
    // 监听内存告警事件
    this.memoryMonitor.on('critical', async ({ memory }) => {
      this._recordAlert('CRITICAL', `内存告急！${memory.percentage}% - 已释放沙盒容器`);
      this.emit('memoryCritical', {
        message: '🚨 内存告急！已自动终止沙盒容器',
        percentage: memory.percentage,
        action: 'emergency_release'
      });
    });
    
    this.memoryMonitor.on('warning', ({ memory }) => {
      this._recordAlert('WARNING', `内存压力 ${memory.percentage}% - 缩减容器数量`);
      this.emit('memoryWarning', {
        message: `⚠️ 内存压力 ${memory.percentage}%，已缩减沙盒容器`,
        percentage: memory.percentage
      });
    });
    
    this.scalingController.on('emergency', ({ message }) => {
      this._recordAlert('EMERGENCY', message);
      this.emit('userNotification', {
        type: 'memory_emergency',
        title: '内存告急通知',
        message: '系统内存使用率超过90%，已自动释放沙盒容器。建议检查系统状态。'
      });
    });
    
    this.scalingController.on('scaled', ({ from, to, reason, memory }) => {
      console.log(`[ContainerPool] Scaled: ${from} -> ${to} (${reason}, memory: ${memory}%)`);
      this._recordAlert('SCALED', `容器数量 ${from} -> ${to}, 内存 ${memory}%`);
    });
    
    // 启动监控
    this.memoryMonitor.start();
  }

  /**
   * 记录告警
   */
  _recordAlert(level, message) {
    this.memoryAlerts.push({
      level,
      message,
      timestamp: Date.now()
    });
    
    // 只保留最近20条
    if (this.memoryAlerts.length > 20) {
      this.memoryAlerts.shift();
    }
  }

  /**
   * 执行任务
   */
  async execute(task) {
    const waitStart = Date.now();
    
    // 获取可用容器
    const container = await this._acquireContainer();
    const waitTime = Date.now() - waitStart;
    
    this.stats.totalTasks++;
    this.stats.avgWaitTime = 
      (this.stats.avgWaitTime * (this.stats.totalTasks - 1) + waitTime) / this.stats.totalTasks;

    try {
      const result = await container.execute(task);
      this.stats.successfulTasks++;
      this.stats.avgExecutionTime = 
        (this.stats.avgExecutionTime * (this.stats.successfulTasks - 1) + result.duration) / this.stats.successfulTasks;
      
      this._releaseContainer(container);
      return result;
    } catch (error) {
      this.stats.failedTasks++;
      this._releaseContainer(container);
      throw error;
    }
  }

  /**
   * 批量执行
   */
  async executeBatch(tasks, options = {}) {
    const { concurrency = 3 } = options;
    const results = [];
    
    for (let i = 0; i < tasks.length; i += concurrency) {
      const batch = tasks.slice(i, i + concurrency);
      const batchPromises = batch.map(task => 
        this.execute(task).catch(err => ({ error: err.message, task }))
      );
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }
    
    return results;
  }

  /**
   * 获取池状态
   */
  getStatus() {
    const states = { idle: 0, busy: 0, init: 0, unhealthy: 0 };
    this.containers.forEach(c => {
      states[c.state] = (states[c.state] || 0) + 1;
    });

    // 获取内存状态
    const memoryStatus = this.memoryMonitor 
      ? this.memoryMonitor.getStats()
      : null;
    
    const scalingStatus = this.scalingController
      ? this.scalingController.getStatus()
      : null;

    return {
      poolSize: this.config.poolSize,
      containers: states,
      waitQueue: this.waitQueue.length,
      stats: { ...this.stats },
      health: states.idle / this.config.poolSize,
      memory: memoryStatus,
      scaling: scalingStatus,
      recentAlerts: this.memoryAlerts.slice(-5)  // 最近5条告警
    };
  }

  /**
   * 关闭容器池
   */
  async shutdown() {
    this._stopMaintenance();
    
    // 等待队列中的任务
    if (this.waitQueue.length > 0) {
      console.log(`[ContainerPool] Waiting for ${this.waitQueue.length} queued tasks...`);
      await new Promise(resolve => {
        const check = setInterval(() => {
          if (this.waitQueue.length === 0) {
            clearInterval(check);
            resolve();
          }
        }, 100);
      });
    }

    // 停止内存监控
    if (this.memoryMonitor) {
      this.memoryMonitor.stop();
    }

    // 销毁所有容器
    const destroyPromises = [];
    this.containers.forEach(container => {
      destroyPromises.push(container.destroy());
    });
    
    await Promise.all(destroyPromises);
    console.log('[ContainerPool] Shutdown complete');
  }

  // ==========================================================================
  // 私有方法
  // ==========================================================================

  async _createContainer(index) {
    const container = new Container(index, this.config);
    this.containers.set(index, container);
    
    try {
      await container.start();
    } catch (error) {
      console.error(`[ContainerPool] Failed to create container ${index}:`, error.message);
      // 稍后重试
      setTimeout(() => this._createContainer(index), 5000);
    }
  }

  async _acquireContainer() {
    // 查找空闲容器
    for (const [id, container] of this.containers) {
      if (container.state === ContainerState.IDLE) {
        return container;
      }
    }

    // 没有空闲容器，等待
    return new Promise((resolve, reject) => {
      const waitEntry = {
        resolve,
        reject,
        timestamp: Date.now()
      };

      // 超时处理
      const timeout = setTimeout(() => {
        const idx = this.waitQueue.indexOf(waitEntry);
        if (idx > -1) {
          this.waitQueue.splice(idx, 1);
          reject(new Error(`Wait timeout after ${this.config.maxWaitMs}ms`));
        }
      }, this.config.maxWaitMs);

      waitEntry.timeout = timeout;
      this.waitQueue.push(waitEntry);
    });
  }

  _releaseContainer(container) {
    // 检查是否有等待的任务
    if (this.waitQueue.length > 0) {
      const next = this.waitQueue.shift();
      clearTimeout(next.timeout);
      next.resolve(container);
    }

    // 检查是否需要补充容器
    const idleCount = Array.from(this.containers.values())
      .filter(c => c.state === ContainerState.IDLE).length;
    
    if (idleCount < this.config.minIdle) {
      this._replenishPool();
    }
  }

  async _replenishPool() {
    // 补充不健康的容器
    for (const [id, container] of this.containers) {
      if (container.state === ContainerState.UNHEALTHY) {
        await container.destroy();
        this._createContainer(id);
      }
    }
  }

  _startMaintenance() {
    // 定时清理
    this._cleanupInterval = setInterval(() => {
      this._cleanup();
    }, this.config.cleanupInterval);

    // 定时健康检查
    this._healthCheckInterval = setInterval(() => {
      this._healthCheck();
    }, this.config.healthCheckInterval);
  }

  _stopMaintenance() {
    if (this._cleanupInterval) {
      clearInterval(this._cleanupInterval);
      this._cleanupInterval = null;
    }
    if (this._healthCheckInterval) {
      clearInterval(this._healthCheckInterval);
      this._healthCheckInterval = null;
    }
  }

  async _cleanup() {
    // 清理长时间运行的任务（僵尸任务）
    for (const container of this.containers.values()) {
      if (container.state === ContainerState.BUSY && container.currentTask) {
        const runningTime = Date.now() - container.lastUsedAt;
        if (runningTime > this.config.containerTimeout * 2) {
          console.warn(`[ContainerPool] Killing zombie task in container ${container.id}`);
          container._killProcess();
          container.state = ContainerState.UNHEALTHY;
        }
      }
    }
  }

  async _healthCheck() {
    for (const container of this.containers.values()) {
      if (container.state !== ContainerState.DESTROYED) {
        const isHealthy = await container.healthCheck();
        if (!isHealthy && container.state !== ContainerState.BUSY) {
          console.warn(`[ContainerPool] Container ${container.id} unhealthy, recreating...`);
          await container.destroy();
          this._createContainer(container.id);
        }
      }
    }
  }
}

// ============================================================================
// 导出
// ============================================================================

module.exports = {
  ContainerPool,
  Container,
  ContainerState
};

// CLI测试
if (require.main === module) {
  const pool = new ContainerPool({ poolSize: 3 });
  
  pool.initialize().then(async () => {
    console.log('Pool status:', pool.getStatus());
    
    // 测试任务
    const result = await pool.execute({
      code: 'console.log(JSON.stringify({ result: "Hello from sandbox", pid: process.pid }))'
    });
    
    console.log('Task result:', result);
    await pool.shutdown();
  });
}
