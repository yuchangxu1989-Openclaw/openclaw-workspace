# LEP SubAgent Manager

**本地执行协议 - 子Agent执行管理模块**

完全可配置的子Agent执行管理，支持动态模型更换、智能路由、熔断器和健康监控。

## 核心特性

- ✅ **零硬编码模型** - 所有模型通过配置定义，可随意添加/删除/修改
- ✅ **智能路由** - 6种路由策略（优先级、轮询、最小负载、最快响应、随机、加权随机）
- ✅ **故障转移** - 模型故障时自动切换到备用模型
- ✅ **执行池** - 并发控制 + 优先级队列，防止队列阻塞
- ✅ **重试机制** - 指数退避 + 熔断器，自动处理429/超时等错误
- ✅ **健康监控** - 30秒间隔健康检查，自动故障检测

## 快速开始

```typescript
import { SubAgentExecutionManager } from 'lep-subagent-manager';

// 从配置文件创建
const manager = await SubAgentExecutionManager.create('./lep.config.js');

// 执行子Agent任务
const result = await manager.execute('你的提示词', {
  model: 'glm5',        // 可选：指定模型
  timeout: 600,         // 可选：自定义超时（秒）
  priority: 'high'      // 可选：优先级
});

console.log(result.output);
```

## 配置示例

```javascript
// lep.config.js
module.exports = {
  models: {
    // 随意添加模型，无需改代码
    kimi: {
      name: 'kimi-coding/k2p5',
      timeout: { short: 180, medium: 600, long: 1200 },
      priority: 1
    },
    glm5: {
      name: 'glm-5',
      timeout: { short: 180, medium: 600, long: 1200 },
      priority: 2
    }
    // 可以继续添加 claude、gpt4 等任意模型
  },
  
  routing: {
    type: 'priority'  // 可选：priority/round_robin/least_load/fastest_response/random/weighted_random
  },
  
  executionPool: {
    maxConcurrency: 5,
    queueSize: 100
  }
};
```

## 路由策略

| 策略 | 说明 |
|:---|:---|
| `priority` | 按优先级选择，同优先级选健康状态最好的 |
| `round_robin` | 轮询，轮流使用每个模型 |
| `least_load` | 选择当前负载最低的模型 |
| `fastest_response` | 选择平均响应时间最短的模型 |
| `random` | 随机选择 |
| `weighted_random` | 按权重随机选择 |

## 动态模型管理

```typescript
// 运行时添加新模型
manager.registerModel('claude', {
  name: 'claude-3-5-sonnet',
  timeout: { short: 120, medium: 300, long: 600 },
  priority: 3
});

// 禁用模型
manager.registry.update('glm5', { enabled: false });

// 删除模型
manager.registry.unregister('kimi');
```

## 项目结构

```
lep-subagent/
├── src/
│   ├── core/
│   │   ├── SubAgentExecutionManager.ts   # 主管理器
│   │   ├── ModelRegistry.ts              # 模型注册中心
│   │   ├── TaskRouter.ts                 # 任务路由器
│   │   ├── ExecutionPool.ts              # 执行池
│   │   ├── RetryManager.ts               # 重试管理器
│   │   └── HealthMonitor.ts              # 健康监控
│   ├── config/
│   │   └── ConfigLoader.ts               # 配置加载器
│   └── types/
│       └── index.ts                      # 类型定义
├── lep.config.example.js                 # 配置示例
└── README.md                             # 本文件
```

## 与LEP整合

本模块是LEP（Local Execution Protocol）的一部分，负责子Agent执行管理：

```
LEP 韧性执行中心
├── LEPExecutor (核心执行器)
├── N016/N017/N018 规则执行器
└── SubAgentExecutionManager (本模块) ← 你在这里
    ├── 模型管理
    ├── 智能路由
    ├── 执行池
    └── 故障转移
```

## License

MIT
