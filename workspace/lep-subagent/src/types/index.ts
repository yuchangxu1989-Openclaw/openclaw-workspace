// LEP SubAgent Manager - TypeScript类型定义
// 完全可配置的子Agent执行管理模块

export interface ModelConfig {
  name: string;
  provider?: string;
  timeout: {
    short: number;
    medium: number;
    long: number;
  };
  maxTokens?: number;
  priority?: number;
  enabled?: boolean;
  metadata?: Record<string, any>;
}

export interface TaskConfig {
  type: string;
  defaultModel?: string;
  timeout?: 'short' | 'medium' | 'long' | number;
  priority?: 'high' | 'medium' | 'low';
  retryPolicy?: RetryPolicy;
  routingStrategy?: RoutingStrategyType;
}

export interface RetryPolicy {
  maxRetries: number;
  backoff: 'fixed' | 'exponential' | 'linear';
  baseDelay: number;
  maxDelay: number;
  retryableErrors?: string[];
}

export type RoutingStrategyType = 
  | 'priority' 
  | 'round_robin' 
  | 'least_load' 
  | 'fastest_response' 
  | 'random' 
  | 'weighted_random';

export interface RoutingStrategy {
  type: RoutingStrategyType;
  weights?: Record<string, number>;
}

export interface LEPConfig {
  models: Record<string, ModelConfig>;
  tasks: Record<string, TaskConfig>;
  routing: RoutingStrategy;
  executionPool: {
    maxConcurrency: number;
    queueSize: number;
    defaultPriority: 'high' | 'medium' | 'low';
  };
  healthCheck: {
    interval: number;
    timeout: number;
    failureThreshold: number;
  };
  tokenMonitor: {
    warningThreshold: number;
    alertThreshold: number;
  };
}

export interface ModelHealth {
  modelId: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastCheck: number;
  responseTime: number;
  successRate: number;
  consecutiveFailures: number;
  load: number;
}

export interface ExecutionTask {
  id: string;
  type: string;
  prompt: string;
  model?: string;
  timeout?: number;
  priority?: 'high' | 'medium' | 'low';
  metadata?: Record<string, any>;
  createdAt: number;
}

export interface ExecutionResult {
  taskId: string;
  status: 'success' | 'failed' | 'timeout' | 'cancelled';
  model: string;
  output?: string;
  error?: string;
  duration: number;
  tokens?: {
    input: number;
    output: number;
  };
  retries: number;
  timestamp: number;
}

export interface ExecutionStats {
  total: number;
  success: number;
  failed: number;
  timeout: number;
  averageDuration: number;
  averageTokens: number;
  byModel: Record<string, ModelStats>;
}

export interface ModelStats {
  total: number;
  success: number;
  failed: number;
  averageResponseTime: number;
  currentLoad: number;
}

export type EventType = 
  | 'execution:start'
  | 'execution:complete'
  | 'execution:failed'
  | 'execution:timeout'
  | 'model:health_change'
  | 'model:overload'
  | 'token:warning'
  | 'token:alert';

export interface LEPEvent {
  type: EventType;
  timestamp: number;
  data: any;
}

export type EventHandler = (event: LEPEvent) => void | Promise<void>;
