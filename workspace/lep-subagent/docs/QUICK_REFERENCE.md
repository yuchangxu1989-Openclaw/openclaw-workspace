# LEP SubAgent 快速参考

## 配置速查

### 最小化配置

```typescript
import { SubAgentExecutionManager } from 'lep-subagent';

const config = {
  models: {
    kimi: {
      id: 'kimi',
      name: 'kimi-coding/k2p5',
      provider: 'moonshot',
      capabilities: ['coding'],
      endpoints: [{ url: 'https://api.moonshot.cn/v1' }],
      timeout: { short: 180, medium: 600, long: 1200 },
      rate_limits: { rpm: 60, tpm: 100000 },
      retry: { max_attempts: 3, backoff_base: 2, max_delay: 60 },
    },
  },
  routing: [{
    taskType: 'default',
    models: ['kimi'],
    strategy: 'priority',
    timeoutTier: 'medium',
  }],
  execution: {
    pool: { maxConcurrent: 10, maxQueueSize: 100, queueTimeout: 300 },
    priorities: { high: 10, medium: 5, low: 1 },
    retry: { maxAttempts: 3, backoffStrategy: 'exponential', baseDelay: 1, maxDelay: 60 },
  },
};

const manager = new SubAgentExecutionManager(config);
manager.start();
```

## API 速查

### 执行任务

```typescript
// 单个任务
const result = await manager.execute(task);

// 批量任务
const results = await manager.executeBatch([task1, task2]);

// 带选项
const result = await manager.execute(task, {
  priority: 'high',
  timeout: 300,
  retry: { maxAttempts: 5 },
});
```

### 模型管理

```typescript
// 注册模型
manager.registerModel(modelConfig);

// 更新模型
manager.updateModel('kimi', { timeout: { short: 60 } });

// 卸载模型
manager.unregisterModel('glm5');

// 查看状态
manager.getModelStatus('kimi');
manager.getAllModelStatus();
```

### 路由管理

```typescript
// 配置路由
manager.configureRouting([
  { taskType: 'code', models: ['kimi'], strategy: 'priority', timeoutTier: 'medium' },
]);
```

## 事件列表

| 事件 | 参数 | 说明 |
|------|------|------|
| `manager:started` | - | 管理器启动 |
| `manager:stopped` | - | 管理器停止 |
| `task:queued` | `Task` | 任务入队 |
| `task:started` | `Task` | 任务开始 |
| `task:completed` | `Task`, `ExecutionResult` | 任务完成 |
| `task:failed` | `Task`, `ExecutionResult` | 任务失败 |
| `model:registered` | `ModelConfig` | 模型注册 |
| `model:updated` | `{ id, updates }` | 模型更新 |
| `model:unregistered` | `string` | 模型卸载 |
| `model:health_changed` | `{ modelId, from, to }` | 健康状态变更 |
| `model:unhealthy` | `modelId`, `error` | 模型不健康 |
| `model:recovered` | `modelId` | 模型恢复 |
| `token:alert` | `TokenAlert` | Token告警 |

## 路由策略

| 策略 | 说明 |
|------|------|
| `priority` | 优先使用第一个可用模型 |
| `round_robin` | 轮流使用模型 |
| `random` | 随机选择 |
| `least_load` | 选择负载最低的模型 |
| `fastest_response` | 选择响应最快的模型 |
| `weighted_random` | 按权重随机选择 |

## 超时等级

| 等级 | 默认值 | 适用场景 |
|------|--------|----------|
| `short` | 180s | 快速对话、简单查询 |
| `medium` | 600s | 代码审查、一般分析 |
| `long` | 1200s | 深度分析、长文档处理 |

## 错误码

| 错误 | 说明 |
|------|------|
| `QUEUE_FULL` | 执行队列已满 |
| `QUEUE_TIMEOUT` | 任务在队列中等待超时 |
| `NO_HEALTHY_MODEL` | 没有可用的健康模型 |
| `CIRCUIT_BREAKER_OPEN` | 熔断器开启 |
| `TOKEN_QUOTA_EXCEEDED` | Token限额 exceeded |

## 配置项说明

### ModelConfig

```typescript
{
  id: string;                    // 模型唯一ID
  name: string;                  // 实际模型名称
  provider: string;              // 提供商
  capabilities: string[];        // 能力标签
  endpoints: [{                   // API端点
    url: string;
    priority?: number;
    weight?: number;
    headers?: Record<string, string>;
  }];
  timeout: {                     // 分层超时
    short: number;
    medium: number;
    long: number;
  };
  rate_limits: {                 // 速率限制
    rpm: number;                 // 每分钟请求数
    tpm: number;                 // 每分钟Token数
  };
  retry: {                       // 重试配置
    max_attempts: number;
    backoff_base: number;
    max_delay: number;
    retryable_statuses?: number[];
  };
}
```

### Task

```typescript
{
  id: string;                    // 任务ID
  type: string;                  // 任务类型（用于路由）
  priority: 'high' | 'medium' | 'low';
  payload: any;                  // 任务数据
  context: {                     // 上下文
    requestId: string;
    userId?: string;
    sessionId?: string;
    metadata?: Record<string, any>;
  };
}
```
