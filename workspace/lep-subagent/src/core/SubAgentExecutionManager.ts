// 子Agent执行管理器 - 主入口
import { 
  ExecutionTask, 
  ExecutionResult, 
  LEPConfig,
  ModelConfig 
} from '../types';
import { ConfigLoader } from '../config/ConfigLoader';
import { ModelRegistry } from './ModelRegistry';
import { TaskRouter } from './TaskRouter';
import { ExecutionPool } from './ExecutionPool';
import { RetryManager, CircuitBreaker } from './RetryManager';
import { HealthMonitor } from './HealthMonitor';
import { EventEmitter } from 'events';

export interface SubAgentExecutionOptions {
  model?: string;
  timeout?: number;
  priority?: 'high' | 'medium' | 'low';
  retryPolicy?: 'default' | 'aggressive' | 'none';
}

export class SubAgentExecutionManager extends EventEmitter {
  private config: LEPConfig;
  private registry: ModelRegistry;
  private router: TaskRouter;
  private pool: ExecutionPool;
  private healthMonitor: HealthMonitor;
  private retryManagers: Map<string, RetryManager> = new Map();
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();

  constructor(config?: LEPConfig) {
    super();
    
    this.config = config || new ConfigLoader().getDefaultConfig();
    this.registry = new ModelRegistry();
    this.router = new TaskRouter(this.registry, this.config.routing);
    this.pool = new ExecutionPool(this.config.executionPool);
    this.healthMonitor = new HealthMonitor(this.registry, this.config.healthCheck);

    this.initialize();
  }

  static async create(configPath?: string): Promise<SubAgentExecutionManager> {
    const loader = new ConfigLoader(configPath);
    const config = await loader.load();
    return new SubAgentExecutionManager(config);
  }

  private initialize(): void {
    // 注册模型
    this.registry.registerFromConfig(this.config.models);
    
    // 为每个模型创建熔断器
    for (const modelId of this.registry.getModelIds()) {
      this.circuitBreakers.set(
        modelId, 
        new CircuitBreaker(this.config.healthCheck)
      );
      
      this.retryManagers.set(
        modelId,
        new RetryManager(this.config.tasks.default?.retryPolicy || {
          maxRetries: 3,
          backoff: 'exponential',
          baseDelay: 1000,
          maxDelay: 30000
        })
      );
    }

    // 启动健康监控
    this.healthMonitor.start();
    
    // 监听模型健康变化
    this.registry.on('model:health_change', ({ modelId, newStatus }) => {
      console.log(`[LEP] Model ${modelId} health changed to ${newStatus}`);
      this.emit('model:health_change', { modelId, newStatus });
    });

    console.log('[LEP] SubAgentExecutionManager initialized');
  }

  async execute(
    prompt: string, 
    options: SubAgentExecutionOptions = {}
  ): Promise<ExecutionResult> {
    const taskId = this.generateTaskId();
    
    const task: ExecutionTask = {
      id: taskId,
      type: 'subagent',
      prompt,
      model: options.model,
      timeout: options.timeout,
      priority: options.priority,
      createdAt: Date.now()
    };

    return this.executeTask(task);
  }

  async executeTask(task: ExecutionTask): Promise<ExecutionResult> {
    // 路由选择模型
    const taskConfig = this.config.tasks[task.type] || this.config.tasks.default;
    const model = this.router.route(task, taskConfig);
    
    if (!model) {
      throw new Error('No available model for task execution');
    }

    // 检查熔断器
    const circuitBreaker = this.circuitBreakers.get(model.id);
    if (circuitBreaker && !circuitBreaker.canExecute()) {
      // 尝试故障转移到其他模型
      const alternative = this.findAlternativeModel(model.id);
      if (!alternative) {
        throw new Error(`Model ${model.id} circuit breaker is open and no alternative available`);
      }
      return this.executeWithModel(task, alternative, taskConfig);
    }

    return this.executeWithModel(task, model, taskConfig);
  }

  private async executeWithModel(
    task: ExecutionTask, 
    model: ModelConfig & { id: string, health: any },
    taskConfig: any
  ): Promise<ExecutionResult> {
    const executeFn = async (): Promise<ExecutionResult> => {
      return this.runWithRetry(task, model, taskConfig);
    };

    return this.pool.submit(task, executeFn);
  }

  private async runWithRetry(
    task: ExecutionTask,
    model: ModelConfig & { id: string },
    taskConfig: any
  ): Promise<ExecutionResult> {
    const retryManager = this.retryManagers.get(model.id)!;
    const circuitBreaker = this.circuitBreakers.get(model.id)!;
    
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= (taskConfig?.retryPolicy?.maxRetries || 3) + 1; attempt++) {
      try {
        const startTime = Date.now();
        
        // 实际执行子Agent调用
        const result = await this.callModel(model, task);
        
        const duration = Date.now() - startTime;
        
        // 记录成功
        circuitBreaker.recordSuccess();
        this.registry.recordExecution(model.id, true, duration);
        
        return {
          taskId: task.id,
          status: 'success',
          model: model.id,
          output: result,
          duration,
          retries: attempt - 1,
          timestamp: Date.now()
        };
        
      } catch (error) {
        lastError = error as Error;
        
        // 记录失败
        circuitBreaker.recordFailure();
        
        const retryContext = {
          attempt,
          error: lastError,
          lastDelay: 0
        };
        
        if (!retryManager.shouldRetry(retryContext)) {
          break;
        }
        
        // 等待重试
        await retryManager.waitForRetry(retryContext);
      }
    }

    // 所有重试失败
    this.registry.recordExecution(model.id, false, 0);
    
    return {
      taskId: task.id,
      status: 'failed',
      model: model.id,
      error: lastError?.message || 'Unknown error',
      duration: 0,
      retries: (taskConfig?.retryPolicy?.maxRetries || 3),
      timestamp: Date.now()
    };
  }

  private async callModel(
    model: ModelConfig & { id: string },
    task: ExecutionTask
  ): Promise<string> {
    // 这里实现实际的模型调用
    // 根据model.name调用对应的API
    
    // 示例实现（需要根据实际情况替换）
    console.log(`[LEP] Calling model ${model.name} for task ${task.id}`);
    
    // 实际应该调用sessions_spawn或其他模型调用方式
    // 这里只是一个占位符
    return `Result from ${model.name}`;
  }

  private findAlternativeModel(excludeModelId: string): (ModelConfig & { id: string }) | null {
    const alternatives = this.registry.getHealthy()
      .filter(m => m.id !== excludeModelId);
    
    return alternatives.length > 0 ? alternatives[0] : null;
  }

  // 注册新模型（运行时动态添加）
  registerModel(modelId: string, config: ModelConfig): void {
    this.registry.register(modelId, config);
    
    // 为新模型创建熔断器和重试管理器
    this.circuitBreakers.set(
      modelId,
      new CircuitBreaker(this.config.healthCheck)
    );
    
    this.retryManagers.set(
      modelId,
      new RetryManager(this.config.tasks.default?.retryPolicy || {
        maxRetries: 3,
        backoff: 'exponential',
        baseDelay: 1000,
        maxDelay: 30000
      })
    );
  }

  // 获取状态
  getStatus(): {
    models: number;
    healthy: number;
    pool: { queued: number; running: number };
  } {
    const summary = this.healthMonitor.getHealthSummary();
    const poolStatus = this.pool.getStatus();
    
    return {
      models: summary.total,
      healthy: summary.healthy,
      pool: {
        queued: poolStatus.queued,
        running: poolStatus.running
      }
    };
  }

  // 获取统计
  getStats() {
    return this.pool.getStats();
  }

  // 关闭
  async shutdown(): Promise<void> {
    this.healthMonitor.stop();
    await this.pool.drain();
    console.log('[LEP] SubAgentExecutionManager shutdown complete');
  }

  private generateTaskId(): string {
    return `lep_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export default SubAgentExecutionManager;
