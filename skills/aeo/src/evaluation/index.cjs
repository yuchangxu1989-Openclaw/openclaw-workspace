/**
 * AEO 评测执行引擎主入口
 * 整合调度器、执行器、评分器
 * @version 1.0.0
 */

const { EvaluationScheduler, EvaluationStatus } = require('./scheduler.cjs');
const { EvaluationExecutor } = require('./executor.cjs');
const { EvaluationScorer, Dimensions } = require('./scorer.cjs');

/**
 * AEO 评测引擎
 */
class EvaluationEngine {
  constructor(options = {}) {
    this.options = {
      maxConcurrent: options.maxConcurrent || 3,
      timeout: options.timeout || 300000,
      autoSave: options.autoSave !== false,
      ...options
    };
    
    // 初始化组件
    this.scheduler = new EvaluationScheduler(this.options);
    this.executor = new EvaluationExecutor(this.options);
    this.scorer = new EvaluationScorer(this.options);
    
    // 绑定事件
    this._bindEvents();
    
    // 状态
    this.isRunning = false;
  }
  
  /**
   * 初始化引擎
   */
  async init() {
    console.log('[EvaluationEngine] Initializing...');
    
    // 启动调度器
    this.scheduler.start();
    this.isRunning = true;
    
    console.log('[EvaluationEngine] Ready');
    return this;
  }
  
  /**
   * 关闭引擎
   */
  async shutdown() {
    console.log('[EvaluationEngine] Shutting down...');
    
    this.scheduler.stop();
    this.isRunning = false;
    
    console.log('[EvaluationEngine] Shutdown complete');
  }
  
  /**
   * 创建并执行评测任务
   * @param {Object} config - 评测配置
   * @returns {Promise<Object>} 评测结果
   */
  async evaluate(config) {
    console.log(`[EvaluationEngine] Starting evaluation: ${config.name}`);
    
    // 1. 创建任务
    const taskId = this.scheduler.createTask(config);
    
    // 2. 等待执行完成
    return new Promise((resolve, reject) => {
      // 监听完成事件
      const onCompleted = (data) => {
        if (data.taskId === taskId) {
          this.scheduler.off('task:completed', onCompleted);
          this.scheduler.off('task:failed', onFailed);
          resolve(data.task);
        }
      };
      
      const onFailed = (data) => {
        if (data.taskId === taskId) {
          this.scheduler.off('task:completed', onCompleted);
          this.scheduler.off('task:failed', onFailed);
          reject(new Error(`Evaluation failed: ${data.error}`));
        }
      };
      
      this.scheduler.on('task:completed', onCompleted);
      this.scheduler.on('task:failed', onFailed);
      
      // 3. 调度任务
      this.scheduler.schedule(taskId);
      
      // 4. 立即开始执行（不走调度队列）
      this._executeEvaluation(taskId, config);
    });
  }
  
  /**
   * 执行评测
   * @param {string} taskId - 任务ID
   * @param {Object} config - 评测配置
   */
  async _executeEvaluation(taskId, config) {
    try {
      // 更新状态为运行中
      this.scheduler._startTask(taskId);
      
      const startTime = Date.now();
      
      // 1. 批量执行测试用例
      const results = await this.executor.executeBatch(config.testCases, {
        batchSize: config.batchSize || 5,
        timeout: config.timeout || this.options.timeout,
        skillPath: config.target
      });
      
      // 2. 记录所有结果
      for (const result of results) {
        this.scheduler.recordResult(taskId, result);
      }
      
      // 3. 生成评分报告
      const reportData = {
        taskId,
        taskName: config.name,
        target: config.target,
        results,
        dimensions: config.dimensions || Object.values(Dimensions),
        tracks: config.tracks || ['aiEffect', 'functionalQuality'],
        metadata: {
          duration: Date.now() - startTime,
          testCaseCount: config.testCases.length
        }
      };
      
      const report = this.scorer.generateReport(reportData);
      
      // 4. 保存报告
      const savedPaths = this.scorer.saveReport(report);
      
      // 5. 完成任务
      this.scheduler.completeTask(taskId, {
        report,
        savedPaths,
        duration: Date.now() - startTime
      });
      
      console.log(`[EvaluationEngine] Evaluation completed: ${taskId}`);
      console.log(`[EvaluationEngine] Report saved: ${savedPaths.textPath}`);
      
    } catch (error) {
      console.error(`[EvaluationEngine] Evaluation failed: ${error.message}`);
      this.scheduler.failTask(taskId, error);
    }
  }
  
  /**
   * 快速评测 - 简化接口
   * @param {string} target - 评测目标
   * @param {Array} testCases - 测试用例
   * @param {Object} options - 选项
   */
  async quickEvaluate(target, testCases, options = {}) {
    const config = {
      name: options.name || `Quick Evaluation - ${target}`,
      target,
      testCases,
      dimensions: options.dimensions,
      tracks: options.tracks,
      ...options
    };
    
    return this.evaluate(config);
  }
  
  /**
   * 获取任务状态
   */
  getTaskStatus(taskId) {
    return this.scheduler.getTaskStatus(taskId);
  }
  
  /**
   * 获取所有任务
   */
  getAllTasks() {
    return this.scheduler.getAllTasks();
  }
  
  /**
   * 获取统计信息
   */
  getStats() {
    return {
      scheduler: this.scheduler.getStats(),
      executor: this.executor.getStats()
    };
  }
  
  /**
   * 绑定事件
   */
  _bindEvents() {
    // 调度器事件
    this.scheduler.on('task:created', (data) => {
      console.log(`[EvaluationEngine] Task created: ${data.taskId}`);
    });
    
    this.scheduler.on('task:started', (data) => {
      console.log(`[EvaluationEngine] Task started: ${data.taskId}`);
    });
    
    this.scheduler.on('task:completed', (data) => {
      console.log(`[EvaluationEngine] Task completed: ${data.taskId}`);
    });
    
    this.scheduler.on('task:failed', (data) => {
      console.error(`[EvaluationEngine] Task failed: ${data.taskId}`);
    });
    
    // 执行器事件
    this.executor.on('batch:completed', (data) => {
      console.log(`[EvaluationEngine] Batch ${data.batchNumber}/${data.totalBatches} completed`);
    });
    
    this.executor.on('test:error', (data) => {
      console.warn(`[EvaluationEngine] Test error: ${data.testCaseId}`);
    });
  }
}

// 导出模块
module.exports = {
  EvaluationEngine,
  EvaluationScheduler,
  EvaluationStatus,
  EvaluationExecutor,
  EvaluationScorer,
  Dimensions
};
