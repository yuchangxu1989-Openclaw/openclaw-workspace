# LEP 子Agent执行管理模块 - 架构设计文档

## 1. 概述

### 1.1 设计目标
构建一个高度可配置、可扩展的子Agent执行管理系统，解决以下问题：
- 超时硬编码 → 分层超时策略
- 429无重试 → 智能重试机制
- Token无预警 → 用量监控
- 队列阻塞 → 并发控制
- 无健康检查 → 模型健康状态管理

### 1.2 核心原则
- **零硬编码**: 所有模型、超时、策略均可配置
- **插件化**: 模型可动态注册/卸载
- **高可用**: 自动故障转移、负载均衡
- **可观测**: 全链路监控与指标

## 2. 架构设计

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                      SubAgent Execution Manager                  │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ Task Router │  │  Load Balancer │  │    Health Monitor    │  │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘  │
│         │                │                     │                │
│  ┌──────▼────────────────▼─────────────────────▼──────┐        │
│  │              Model Registry (Configurable)          │        │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │        │
│  │  │  Kimi   │ │  GLM-5  │ │ Claude  │ │ Custom  │   │        │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘   │        │
│  └────────────────────────────────────────────────────┘        │
│                                │                               │
│  ┌─────────────────────────────▼──────────────────────────┐    │
│  │                Execution Pool (Concurrency Control)     │    │
│  │  ┌─────────────────────────────────────────────────┐   │    │
│  │  │              Priority Queue                      │   │    │
│  │  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌────────┐ │   │    │
│  │  │  │High     │ │Medium   │ │Low      │ │Retry   │ │   │    │
│  │  │  │Priority │ │Priority │ │Priority │ │Queue   │ │   │    │
│  │  │  └─────────┘ └─────────┘ └─────────┘ └────────┘ │   │    │
│  │  └─────────────────────────────────────────────────┘   │    │
│  │                                                         │    │
│  │  ┌─────────────────────────────────────────────────┐   │    │
│  │  │           Worker Pool (Semaphore)                │   │    │
│  │  │     Max Concurrent: N (configurable)             │   │    │
│  │  └─────────────────────────────────────────────────┘   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                 Retry Manager                            │  │
│  │  - Exponential Backoff                                   │  │
│  │  - Circuit Breaker                                       │  │
│  │  - Max Retry Limit                                       │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 组件职责

| 组件 | 职责 |
|------|------|
| ModelRegistry | 管理所有模型配置，支持动态注册/更新 |
| TaskRouter | 根据任务类型选择最优模型 |
| LoadBalancer | 在健康模型间分配负载 |
| HealthMonitor | 持续监控模型健康状态 |
| ExecutionPool | 管理并发执行，控制队列 |
| RetryManager | 处理失败重试，指数退避 |
| TokenMonitor | 监控Token使用，预警超限 |

## 3. 配置设计

### 3.1 配置分层

```yaml
# models.yaml - 模型配置
models:
  kimi:
    name: "kimi-coding/k2p5"
    provider: "moonshot"
    capabilities: ["coding", "analysis", "chat"]
    endpoints:
      - url: "https://api.moonshot.cn/v1"
        priority: 1
      - url: "https://backup.moonshot.cn/v1" 
        priority: 2
    timeout:
      short: 180
      medium: 600
      long: 1200
    rate_limits:
      rpm: 60
      tpm: 100000
    retry:
      max_attempts: 3
      backoff_base: 2
      max_delay: 60

  glm5:
    name: "glm-5"
    provider: "zhipu"
    capabilities: ["coding", "reasoning", "chat"]
    endpoints:
      - url: "https://open.bigmodel.cn/api/coding/paas/v4"
    timeout:
      short: 180
      medium: 600
      long: 1200
    rate_limits:
      rpm: 30
      tpm: 50000
    retry:
      max_attempts: 3
      backoff_base: 2

# routing.yaml - 路由策略
routing:
  # 任务类型到模型的映射
  task_mapping:
    code_review:
      models: ["kimi", "glm5"]
      strategy: "priority"  # priority/round_robin/random
      timeout_tier: "medium"
    
    deep_analysis:
      models: ["glm5", "claude"]
      strategy: "round_robin"
      timeout_tier: "long"
    
    quick_chat:
      models: ["kimi"]
      strategy: "priority"
      timeout_tier: "short"
  
  # 默认策略
  default:
    models: ["kimi", "glm5"]
    strategy: "round_robin"
    timeout_tier: "medium"

# execution.yaml - 执行池配置
execution:
  pool:
    max_concurrent: 10
    max_queue_size: 100
    queue_timeout: 300
  
  priorities:
    high: 10
    medium: 5
    low: 1
  
  retry:
    max_attempts: 3
    backoff_strategy: "exponential"  # exponential/fixed/linear
    base_delay: 1
    max_delay: 60
    circuit_breaker:
      failure_threshold: 5
      recovery_timeout: 60
  
  token_monitor:
    warning_threshold: 0.8  # 80% 预警
    critical_threshold: 0.95  # 95% 告警
```

## 4. 关键流程

### 4.1 任务执行流程

```
1. 提交任务
   ↓
2. TaskRouter 选择模型
   - 根据 task_type 查路由配置
   - 过滤不健康模型
   - LoadBalancer 选择具体模型实例
   ↓
3. 进入 ExecutionPool
   - 检查并发限制
   - 放入优先级队列
   ↓
4. Worker 获取任务
   - 获取模型配置
   - 应用分层超时
   ↓
5. 执行模型调用
   - TokenMonitor 监控
   - 异常处理
   ↓
6. 成功/失败处理
   - 成功: 返回结果
   - 失败: RetryManager 判断是否重试
```

### 4.2 健康检查流程

```
HealthMonitor (每30秒)
   ↓
1. 向每个模型发送健康探测
   - 轻量级请求
   - 测量响应时间
   ↓
2. 更新健康状态
   - healthy/unhealthy/degraded
   - 记录错误率、延迟
   ↓
3. 触发事件
   - 模型故障 → 移出路由池
   - 模型恢复 → 重新加入
```

### 4.3 故障转移流程

```
模型调用失败 (429/5xx/timeout)
   ↓
1. RetryManager 判断是否可重试
   - 检查重试次数
   - 计算退避延迟
   ↓
2. 可重试 → 指数退避后重试
   ↓
3. 不可重试 → 触发故障转移
   - TaskRouter 选择备用模型
   - 记录故障事件
   ↓
4. HealthMonitor 更新模型状态
   - 增加错误计数
   - 达到阈值标记为不健康
```

## 5. 接口设计

### 5.1 核心接口

```typescript
// 模型配置接口
interface ModelConfig {
  id: string;
  name: string;
  provider: string;
  capabilities: string[];
  endpoints: EndpointConfig[];
  timeout: TimeoutConfig;
  rate_limits: RateLimitConfig;
  retry: RetryConfig;
}

// 任务定义
interface Task {
  id: string;
  type: string;
  priority: 'high' | 'medium' | 'low';
  payload: any;
  context: TaskContext;
}

// 执行结果
interface ExecutionResult<T> {
  success: boolean;
  data?: T;
  error?: ExecutionError;
  metadata: ExecutionMetadata;
}

// 子Agent执行管理器
interface SubAgentManager {
  // 提交任务
  submit<T>(task: Task): Promise<ExecutionResult<T>>;
  
  // 批量提交
  submitBatch<T>(tasks: Task[]): Promise<ExecutionResult<T>[]>;
  
  // 注册模型
  registerModel(config: ModelConfig): void;
  
  // 更新模型配置
  updateModel(id: string, config: Partial<ModelConfig>): void;
  
  // 获取模型状态
  getModelStatus(id: string): ModelStatus;
  
  // 获取执行统计
  getStatistics(): ExecutionStatistics;
}
```

## 6. 扩展点

### 6.1 自定义路由策略

```typescript
interface RoutingStrategy {
  selectModel(models: ModelInstance[], task: Task): ModelInstance;
}

// 示例: 基于负载的路由
class LoadBasedStrategy implements RoutingStrategy {
  selectModel(models, task) {
    return models.sort((a, b) => a.currentLoad - b.currentLoad)[0];
  }
}
```

### 6.2 自定义健康检查

```typescript
interface HealthChecker {
  check(model: ModelInstance): Promise<HealthStatus>;
}
```

## 7. 监控指标

| 指标 | 说明 |
|------|------|
| execution_duration | 任务执行耗时 |
| queue_wait_time | 队列等待时间 |
| retry_count | 重试次数分布 |
| model_error_rate | 模型错误率 |
| token_usage | Token使用量 |
| active_workers | 活跃Worker数 |
| queue_depth | 队列深度 |

## 8. 部署建议

1. **配置热加载**: 配置文件变更自动生效
2. **灰度发布**: 新模型先小规模测试
3. **熔断策略**: 错误率过高自动熔断
4. **资源隔离**: 不同优先级任务资源隔离
