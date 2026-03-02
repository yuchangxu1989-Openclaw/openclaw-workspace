/**
 * Process Sandbox - 进程级沙盒（无Docker方案）
 * @version 1.0.0
 * @description 使用Node.js vm模块实现轻量级沙盒，无需Docker
 */

const { EventEmitter } = require('events');
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

// 资源限制
const RESOURCE_LIMITS = {
  maxExecutionTime: 30000,    // 30秒超时
  maxOutputSize: 100 * 1024,  // 100KB输出限制
  maxMemoryMB: 256            // 256MB内存限制
};

/**
 * 进程级沙盒执行器
 */
class ProcessSandbox extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = {
      poolSize: config.poolSize || 3,
      timeout: config.timeout || RESOURCE_LIMITS.maxExecutionTime,
      ...config
    };
    this.runningTasks = new Map();
    this.stats = {
      totalTasks: 0,
      successfulTasks: 0,
      failedTasks: 0
    };
  }

  /**
   * 初始化（无需预创建容器）
   */
  async initialize() {
    console.log('[ProcessSandbox] Initialized (no container overhead)');
    this.emit('ready');
    return this;
  }

  /**
   * 执行任务
   */
  async execute(task) {
    const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    
    console.log(`[ProcessSandbox] Executing task: ${taskId}`);
    this.stats.totalTasks++;

    try {
      const result = await this._runInSandbox(task, taskId);
      this.stats.successfulTasks++;
      
      return {
        taskId,
        status: 'success',
        result: result.result,
        output: result.output,
        executionTime: Date.now() - startTime,
        timestamp: Date.now()
      };
      
    } catch (error) {
      this.stats.failedTasks++;
      
      return {
        taskId,
        status: 'failed',
        error: error.message,
        executionTime: Date.now() - startTime,
        timestamp: Date.now()
      };
    }
  }

  /**
   * 在沙盒中运行代码
   */
  _runInSandbox(task, taskId) {
    return new Promise((resolve, reject) => {
      // 设置超时
      const timeout = setTimeout(() => {
        this._cleanupTask(taskId);
        reject(new Error(`Task timeout after ${this.config.timeout}ms`));
      }, this.config.timeout);

      // 创建隔离上下文
      const sandbox = {
        console: {
          log: (...args) => {
            const line = args.map(a => 
              typeof a === 'object' ? JSON.stringify(a) : String(a)
            ).join(' ');
            output.push(line);
          },
          error: (...args) => {
            const line = args.map(a => 
              typeof a === 'object' ? JSON.stringify(a) : String(a)
            ).join(' ');
            errors.push(line);
          }
        },
        require: (module) => {
          // 白名单模块
          const allowedModules = ['fs', 'path', 'util', 'crypto', 'url', 'querystring'];
          if (allowedModules.includes(module)) {
            return require(module);
          }
          throw new Error(`Module '${module}' is not allowed in sandbox`);
        },
        Buffer,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        Date,
        Math,
        JSON,
        Object,
        Array,
        String,
        Number,
        Boolean,
        Error,
        Promise,
        // 任务输入
        input: task.input || {}
      };

      const output = [];
      const errors = [];

      try {
        // 创建VM上下文
        const context = vm.createContext(sandbox);
        
        // 包装用户代码
        const wrappedCode = `
          (async function() {
            ${task.code}
          })()
        `;
        
        // 执行代码
        const script = new vm.Script(wrappedCode, {
          timeout: this.config.timeout,
          displayErrors: true
        });
        
        const result = script.runInContext(context, {
          timeout: this.config.timeout
        });

        clearTimeout(timeout);
        this._cleanupTask(taskId);

        resolve({
          result,
          output: output.join('\n'),
          errors: errors.join('\n')
        });
        
      } catch (error) {
        clearTimeout(timeout);
        this._cleanupTask(taskId);
        
        if (error.message.includes('Script execution timed out')) {
          reject(new Error('Execution timeout'));
        } else {
          reject(error);
        }
      }
    });
  }

  /**
   * 执行测试用例（调用外部进程）
   */
  async executeTests(testConfig) {
    const { skillPath, testFiles = [] } = testConfig;
    
    return new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Test execution timeout'));
      }, RESOURCE_LIMITS.maxExecutionTime);

      try {
        // 使用子进程执行测试（带资源限制）
        const testCommand = testFiles.length > 0 
          ? `node --max-old-space-size=${RESOURCE_LIMITS.maxMemoryMB} node_modules/.bin/mocha ${testFiles.join(' ')} --reporter=json --timeout=10000`
          : `node --max-old-space-size=${RESOURCE_LIMITS.maxMemoryMB} node_modules/.bin/mocha '__tests__/**/*.test.js' --reporter=json --timeout=10000`;
        
        const { stdout, stderr } = await execAsync(
          testCommand,
          { 
            cwd: skillPath,
            timeout: RESOURCE_LIMITS.maxExecutionTime,
            env: { ...process.env, NODE_ENV: 'test' }
          }
        );

        clearTimeout(timeout);

        // 解析Mocha JSON输出
        let testResults;
        try {
          testResults = JSON.parse(stdout);
        } catch {
          testResults = { raw: stdout };
        }

        resolve({
          tests: testResults,
          stderr,
          passed: !stderr.includes('failing')
        });
        
      } catch (error) {
        clearTimeout(timeout);
        
        // 即使有错误，也可能有测试结果
        let testResults = null;
        try {
          if (error.stdout) {
            testResults = JSON.parse(error.stdout);
          }
        } catch {}

        resolve({
          tests: testResults,
          error: error.message,
          stderr: error.stderr,
          passed: false
        });
      }
    });
  }

  /**
   * 清理任务
   */
  _cleanupTask(taskId) {
    this.runningTasks.delete(taskId);
  }

  /**
   * 获取状态
   */
  getStatus() {
    return {
      type: 'process-sandbox',
      runningTasks: this.runningTasks.size,
      stats: { ...this.stats },
      limits: RESOURCE_LIMITS
    };
  }

  /**
   * 关闭
   */
  async shutdown() {
    console.log('[ProcessSandbox] Shutting down...');
    // 终止所有运行中的任务
    for (const [taskId, task] of this.runningTasks) {
      // 进程级沙盒无法强制终止，依赖超时机制
    }
    this.runningTasks.clear();
    console.log('[ProcessSandbox] Shutdown complete');
  }
}

// ============================================================================
// 导出一个兼容 ContainerPool 接口的类
// ============================================================================

class ContainerPoolAdapter extends EventEmitter {
  constructor(config = {}) {
    super();
    this.processSandbox = new ProcessSandbox(config);
    this.config = config;
    
    // 模拟 ContainerPool 的事件接口
    this.processSandbox.on('ready', () => this.emit('ready'));
  }

  async initialize() {
    await this.processSandbox.initialize();
    
    // 模拟内存监控事件（进程级沙盒无真实容器内存占用）
    this._startMemorySimulation();
    
    return this;
  }

  async execute(task) {
    return this.processSandbox.execute(task);
  }

  getStatus() {
    const status = this.processSandbox.getStatus();
    
    // 获取真实系统内存
    const memUsage = process.memoryUsage();
    const systemTotal = require('os').totalmem();
    
    return {
      type: 'process-sandbox',
      poolSize: this.config.poolSize || 3,
      containers: {
        idle: Math.max(0, (this.config.poolSize || 3) - status.runningTasks),
        busy: status.runningTasks,
        init: 0,
        unhealthy: 0
      },
      waitQueue: 0,
      stats: status.stats,
      memory: {
        current: {
          system: {
            percentage: Math.round((memUsage.rss / systemTotal) * 100),
            used: memUsage.rss,
            total: systemTotal
          }
        }
      },
      recentAlerts: []
    };
  }

  _startMemorySimulation() {
    // 每10秒检查一次内存
    setInterval(() => {
      const memUsage = process.memoryUsage();
      const systemTotal = require('os').totalmem();
      const percentage = Math.round((memUsage.rss / systemTotal) * 100);
      
      if (percentage > 80) {
        this.emit('memoryWarning', {
          percentage,
          message: `High memory usage: ${percentage}%`
        });
      }
    }, 10000);
  }

  async shutdown() {
    await this.processSandbox.shutdown();
  }
}

// ============================================================================
// 导出
// ============================================================================

module.exports = {
  ProcessSandbox,
  ContainerPoolAdapter
};

// 测试
if (require.main === module) {
  const sandbox = new ProcessSandbox({ poolSize: 3 });
  
  sandbox.initialize().then(async () => {
    const result = await sandbox.execute({
      code: `
        console.log('Hello from sandbox');
        console.log('Input:', JSON.stringify(input));
        return { result: 'success', pid: 'simulated' };
      `,
      input: { test: 'data' }
    });
    
    console.log('Result:', result);
    await sandbox.shutdown();
  });
}
