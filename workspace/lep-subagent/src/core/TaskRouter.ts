// 任务路由器 - 6种智能路由策略
import { 
  ExecutionTask, 
  RegisteredModel, 
  RoutingStrategy, 
  RoutingStrategyType,
  TaskConfig 
} from '../types';
import { ModelRegistry } from './ModelRegistry';

export class TaskRouter {
  private registry: ModelRegistry;
  private strategy: RoutingStrategy;
  private roundRobinIndex: number = 0;

  constructor(registry: ModelRegistry, strategy: RoutingStrategy) {
    this.registry = registry;
    this.strategy = strategy;
  }

  updateStrategy(strategy: RoutingStrategy): void {
    this.strategy = strategy;
  }

  route(task: ExecutionTask, taskConfig?: TaskConfig): RegisteredModel | null {
    const availableModels = this.registry.getAvailable();
    
    if (availableModels.length === 0) {
      console.error('[LEP] No available models for routing');
      return null;
    }

    // 如果任务指定了特定模型
    if (task.model) {
      const specificModel = this.registry.get(task.model);
      if (specificModel && specificModel.enabled !== false) {
        return specificModel;
      }
      console.warn(`[LEP] Specified model ${task.model} not available, using routing strategy`);
    }

    // 如果任务配置指定了默认模型
    if (taskConfig?.defaultModel) {
      const defaultModel = this.registry.get(taskConfig.defaultModel);
      if (defaultModel && defaultModel.enabled !== false) {
        return defaultModel;
      }
    }

    // 使用路由策略选择模型
    const strategyType = taskConfig?.routingStrategy || this.strategy.type;
    
    switch (strategyType) {
      case 'priority':
        return this.routeByPriority(availableModels);
      case 'round_robin':
        return this.routeByRoundRobin(availableModels);
      case 'least_load':
        return this.routeByLeastLoad(availableModels);
      case 'fastest_response':
        return this.routeByFastestResponse(availableModels);
      case 'random':
        return this.routeByRandom(availableModels);
      case 'weighted_random':
        return this.routeByWeightedRandom(availableModels);
      default:
        return this.routeByPriority(availableModels);
    }
  }

  // 1. 优先级路由 - 选择优先级最高的健康模型
  private routeByPriority(models: RegisteredModel[]): RegisteredModel {
    return models.sort((a, b) => {
      const priorityA = a.priority || 999;
      const priorityB = b.priority || 999;
      
      // 健康状态优先
      if (a.health.status === 'healthy' && b.health.status !== 'healthy') return -1;
      if (a.health.status !== 'healthy' && b.health.status === 'healthy') return 1;
      
      return priorityA - priorityB;
    })[0];
  }

  // 2. 轮询路由 - 轮流使用每个模型
  private routeByRoundRobin(models: RegisteredModel[]): RegisteredModel {
    const healthyModels = models.filter(m => m.health.status === 'healthy');
    if (healthyModels.length === 0) return models[0];

    this.roundRobinIndex = (this.roundRobinIndex + 1) % healthyModels.length;
    return healthyModels[this.roundRobinIndex];
  }

  // 3. 最小负载路由 - 选择负载最低的模型
  private routeByLeastLoad(models: RegisteredModel[]): RegisteredModel {
    return models.sort((a, b) => {
      // 优先健康状态
      if (a.health.status === 'healthy' && b.health.status !== 'healthy') return -1;
      if (a.health.status !== 'healthy' && b.health.status === 'healthy') return 1;
      
      // 然后比较负载
      return a.stats.currentLoad - b.stats.currentLoad;
    })[0];
  }

  // 4. 最快响应路由 - 选择平均响应时间最短的模型
  private routeByFastestResponse(models: RegisteredModel[]): RegisteredModel {
    return models.sort((a, b) => {
      // 优先健康状态
      if (a.health.status === 'healthy' && b.health.status !== 'healthy') return -1;
      if (a.health.status !== 'healthy' && b.health.status === 'healthy') return 1;
      
      // 然后比较响应时间
      return a.stats.averageResponseTime - b.stats.averageResponseTime;
    })[0];
  }

  // 5. 随机路由 - 随机选择模型
  private routeByRandom(models: RegisteredModel[]): RegisteredModel {
    const healthyModels = models.filter(m => m.health.status === 'healthy');
    const pool = healthyModels.length > 0 ? healthyModels : models;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // 6. 加权随机路由 - 按权重随机选择
  private routeByWeightedRandom(models: RegisteredModel[]): RegisteredModel {
    const weights = this.strategy.weights || {};
    
    // 为没有权重的模型分配默认权重
    const modelWeights = models.map(m => ({
      model: m,
      weight: weights[m.id] || (m.priority ? 100 / m.priority : 50)
    }));

    const totalWeight = modelWeights.reduce((sum, mw) => sum + mw.weight, 0);
    let random = Math.random() * totalWeight;

    for (const mw of modelWeights) {
      random -= mw.weight;
      if (random <= 0) {
        return mw.model;
      }
    }

    return modelWeights[modelWeights.length - 1].model;
  }

  // 获取路由决策信息（用于调试）
  getRoutingInfo(task: ExecutionTask, taskConfig?: TaskConfig): {
    strategy: RoutingStrategyType;
    availableModels: number;
    selectedModel: string | null;
    alternatives: string[];
  } {
    const availableModels = this.registry.getAvailable();
    const selected = this.route(task, taskConfig);
    
    return {
      strategy: taskConfig?.routingStrategy || this.strategy.type,
      availableModels: availableModels.length,
      selectedModel: selected?.id || null,
      alternatives: availableModels
        .filter(m => m.id !== selected?.id)
        .map(m => m.id)
    };
  }
}

export default TaskRouter;
