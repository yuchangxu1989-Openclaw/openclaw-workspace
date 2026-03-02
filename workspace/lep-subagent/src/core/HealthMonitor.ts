// 健康监控器 - 模型健康检查和故障转移
import { ModelHealth, ModelConfig } from '../types';
import { ModelRegistry } from './ModelRegistry';
import { EventEmitter } from 'events';

export interface HealthCheckConfig {
  interval: number;
  timeout: number;
  failureThreshold: number;
}

export class HealthMonitor extends EventEmitter {
  private registry: ModelRegistry;
  private config: HealthCheckConfig;
  private timer: NodeJS.Timer | null = null;
  private isRunning: boolean = false;

  constructor(registry: ModelRegistry, config: HealthCheckConfig) {
    super();
    this.registry = registry;
    this.config = config;
  }

  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.scheduleCheck();
    
    console.log('[LEP] Health monitor started');
    this.emit('monitor:started');
  }

  stop(): void {
    this.isRunning = false;
    
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    
    console.log('[LEP] Health monitor stopped');
    this.emit('monitor:stopped');
  }

  private scheduleCheck(): void {
    if (!this.isRunning) return;
    
    this.timer = setTimeout(async () => {
      await this.runHealthCheck();
      this.scheduleCheck();
    }, this.config.interval);
  }

  private async runHealthCheck(): Promise<void> {
    const models = this.registry.getAll();
    
    for (const model of models) {
      if (model.enabled === false) continue;
      
      try {
        const health = await this.checkModelHealth(model);
        this.registry.updateHealth(model.id, health);
        
        if (health.status === 'unhealthy') {
          this.emit('model:unhealthy', { modelId: model.id, health });
        }
      } catch (error) {
        console.error(`[LEP] Health check failed for ${model.id}:`, error);
        
        // 标记为不健康
        this.registry.updateHealth(model.id, {
          status: 'unhealthy',
          lastCheck: Date.now()
        });
      }
    }
  }

  private async checkModelHealth(model: ModelConfig & { id: string }): Promise<Partial<ModelHealth>> {
    const startTime = Date.now();
    
    try {
      // 发送一个简单的健康检查请求
      // 这里应该调用实际的模型API进行探测
      const isHealthy = await this.probeModel(model);
      
      const responseTime = Date.now() - startTime;
      const currentHealth = this.registry.get(model.id)?.health;
      
      if (isHealthy) {
        return {
          status: 'healthy',
          lastCheck: Date.now(),
          responseTime,
          consecutiveFailures: 0
        };
      } else {
        const consecutiveFailures = (currentHealth?.consecutiveFailures || 0) + 1;
        const status = consecutiveFailures >= this.config.failureThreshold 
          ? 'unhealthy' 
          : 'degraded';
        
        return {
          status,
          lastCheck: Date.now(),
          responseTime,
          consecutiveFailures
        };
      }
      
    } catch (error) {
      const currentHealth = this.registry.get(model.id)?.health;
      const consecutiveFailures = (currentHealth?.consecutiveFailures || 0) + 1;
      
      return {
        status: consecutiveFailures >= this.config.failureThreshold ? 'unhealthy' : 'degraded',
        lastCheck: Date.now(),
        responseTime: Date.now() - startTime,
        consecutiveFailures
      };
    }
  }

  private async probeModel(model: ModelConfig & { id: string }): Promise<boolean> {
    // 这里实现实际的模型健康检查
    // 可以是一个简单的ping请求或轻量级任务
    
    // 示例：检查模型是否可连接
    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(false), this.config.timeout);
      
      // 实际实现中这里应该调用模型API
      // 例如：发送一个空的或简单的请求
      this.pingModel(model)
        .then(() => {
          clearTimeout(timeout);
          resolve(true);
        })
        .catch(() => {
          clearTimeout(timeout);
          resolve(false);
        });
    });
  }

  private async pingModel(model: ModelConfig & { id: string }): Promise<void> {
    // 实际的ping实现
    // 这里只是一个占位符，实际应该调用模型API
    // 比如发送一个"hello"或获取模型状态
    
    // 模拟成功
    return Promise.resolve();
  }

  // 手动触发健康检查
  async checkNow(modelId?: string): Promise<void> {
    if (modelId) {
      const model = this.registry.get(modelId);
      if (model) {
        const health = await this.checkModelHealth(model);
        this.registry.updateHealth(modelId, health);
      }
    } else {
      await this.runHealthCheck();
    }
  }

  // 获取健康状态摘要
  getHealthSummary(): {
    healthy: number;
    degraded: number;
    unhealthy: number;
    total: number;
  } {
    const models = this.registry.getAll();
    
    return {
      healthy: models.filter(m => m.health.status === 'healthy').length,
      degraded: models.filter(m => m.health.status === 'degraded').length,
      unhealthy: models.filter(m => m.health.status === 'unhealthy').length,
      total: models.length
    };
  }
}

export default HealthMonitor;
