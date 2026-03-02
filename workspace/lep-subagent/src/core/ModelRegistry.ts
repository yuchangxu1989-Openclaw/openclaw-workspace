// 模型注册中心 - 完全可配置，零硬编码
import { ModelConfig, ModelHealth, ModelStats } from '../types';
import { EventEmitter } from 'events';

export interface RegisteredModel extends ModelConfig {
  id: string;
  health: ModelHealth;
  stats: ModelStats;
  registeredAt: number;
}

export class ModelRegistry extends EventEmitter {
  private models: Map<string, RegisteredModel> = new Map();
  private loadHistory: Map<string, number[]> = new Map();

  register(modelId: string, config: ModelConfig): RegisteredModel {
    if (this.models.has(modelId)) {
      console.warn(`[LEP] Model ${modelId} already registered, updating config`);
      return this.update(modelId, config);
    }

    const model: RegisteredModel = {
      id: modelId,
      ...config,
      health: {
        modelId,
        status: 'healthy',
        lastCheck: Date.now(),
        responseTime: 0,
        successRate: 1,
        consecutiveFailures: 0,
        load: 0
      },
      stats: {
        total: 0,
        success: 0,
        failed: 0,
        averageResponseTime: 0,
        currentLoad: 0
      },
      registeredAt: Date.now()
    };

    this.models.set(modelId, model);
    this.loadHistory.set(modelId, []);
    
    this.emit('model:registered', { modelId, model });
    console.log(`[LEP] Model registered: ${modelId} (${config.name})`);
    
    return model;
  }

  update(modelId: string, config: Partial<ModelConfig>): RegisteredModel {
    const model = this.models.get(modelId);
    if (!model) {
      throw new Error(`Model ${modelId} not found`);
    }

    const updated: RegisteredModel = {
      ...model,
      ...config,
      id: modelId,
      health: model.health,
      stats: model.stats,
      registeredAt: model.registeredAt
    };

    this.models.set(modelId, updated);
    this.emit('model:updated', { modelId, model: updated });
    
    return updated;
  }

  unregister(modelId: string): boolean {
    const existed = this.models.delete(modelId);
    this.loadHistory.delete(modelId);
    
    if (existed) {
      this.emit('model:unregistered', { modelId });
      console.log(`[LEP] Model unregistered: ${modelId}`);
    }
    
    return existed;
  }

  get(modelId: string): RegisteredModel | undefined {
    return this.models.get(modelId);
  }

  getAll(): RegisteredModel[] {
    return Array.from(this.models.values());
  }

  getEnabled(): RegisteredModel[] {
    return this.getAll().filter(m => m.enabled !== false);
  }

  getHealthy(): RegisteredModel[] {
    return this.getEnabled().filter(m => m.health.status === 'healthy');
  }

  getAvailable(): RegisteredModel[] {
    return this.getEnabled().filter(m => 
      m.health.status === 'healthy' || m.health.status === 'degraded'
    );
  }

  updateHealth(modelId: string, health: Partial<ModelHealth>): void {
    const model = this.models.get(modelId);
    if (!model) return;

    const oldStatus = model.health.status;
    model.health = { ...model.health, ...health, modelId };

    if (oldStatus !== model.health.status) {
      this.emit('model:health_change', { 
        modelId, 
        oldStatus, 
        newStatus: model.health.status,
        health: model.health
      });
    }
  }

  updateStats(modelId: string, stats: Partial<ModelStats>): void {
    const model = this.models.get(modelId);
    if (!model) return;

    model.stats = { ...model.stats, ...stats };
  }

  recordExecution(modelId: string, success: boolean, duration: number): void {
    const model = this.models.get(modelId);
    if (!model) return;

    model.stats.total++;
    if (success) {
      model.stats.success++;
      model.health.consecutiveFailures = 0;
    } else {
      model.stats.failed++;
      model.health.consecutiveFailures++;
    }

    // 更新平均响应时间
    const oldAvg = model.stats.averageResponseTime;
    model.stats.averageResponseTime = 
      (oldAvg * (model.stats.total - 1) + duration) / model.stats.total;

    // 更新健康状态
    this.updateHealthStatus(modelId);
  }

  private updateHealthStatus(modelId: string): void {
    const model = this.models.get(modelId);
    if (!model) return;

    const failureRate = model.stats.total > 0 
      ? model.stats.failed / model.stats.total 
      : 0;

    let newStatus: ModelHealth['status'] = 'healthy';

    if (failureRate > 0.5 || model.health.consecutiveFailures >= 5) {
      newStatus = 'unhealthy';
    } else if (failureRate > 0.2 || model.health.consecutiveFailures >= 3) {
      newStatus = 'degraded';
    }

    if (newStatus !== model.health.status) {
      this.updateHealth(modelId, { status: newStatus });
    }
  }

  updateLoad(modelId: string, load: number): void {
    const model = this.models.get(modelId);
    if (!model) return;

    model.stats.currentLoad = load;
    
    // 记录负载历史
    const history = this.loadHistory.get(modelId);
    if (history) {
      history.push(load);
      if (history.length > 100) history.shift();
    }
  }

  getAverageLoad(modelId: string): number {
    const history = this.loadHistory.get(modelId);
    if (!history || history.length === 0) return 0;
    
    return history.reduce((a, b) => a + b, 0) / history.length;
  }

  has(modelId: string): boolean {
    return this.models.has(modelId);
  }

  count(): number {
    return this.models.size;
  }

  clear(): void {
    this.models.clear();
    this.loadHistory.clear();
    this.emit('registry:cleared');
  }

  // 批量注册（从配置）
  registerFromConfig(configs: Record<string, ModelConfig>): void {
    for (const [id, config] of Object.entries(configs)) {
      this.register(id, config);
    }
  }

  // 获取模型ID列表
  getModelIds(): string[] {
    return Array.from(this.models.keys());
  }

  // 按优先级排序获取模型
  getModelsByPriority(): RegisteredModel[] {
    return this.getEnabled().sort((a, b) => {
      const priorityA = a.priority || 999;
      const priorityB = b.priority || 999;
      return priorityA - priorityB;
    });
  }
}

export default ModelRegistry;
