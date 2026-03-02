---
name: lep-subagent-manager
description: LEP子Agent执行管理器 - 完全可配置的子Agent执行管理模块，支持动态模型更换、智能路由、熔断器和健康监控
version: "1.0.0"
status: active
priority: critical
tags: [lep, subagent, execution, resilience, infrastructure]
---

# LEP子Agent执行管理器

## 定位
- **层级**: 基础设施 (infrastructure)
- **所属系统**: LEP (Local Execution Protocol) 韧性执行中心
- **用途**: 统一管理子Agent执行，解决模型路由、并发控制、故障转移等问题

## 核心能力

### 1. 零硬编码模型配置
- 所有模型通过配置文件定义
- 运行时动态添加/删除/修改模型
- 支持任意模型提供商（Kimi、GLM、Claude、GPT等）

### 2. 智能路由（6种策略）
- `priority` - 按优先级选择
- `round_robin` - 轮询负载均衡
- `least_load` - 最小负载优先
- `fastest_response` - 最快响应优先
- `random` - 随机选择
- `weighted_random` - 加权随机

### 3. 韧性执行
- **执行池**: 全局并发限制 + 优先级队列
- **重试机制**: 指数退避，支持429/超时等错误重试
- **熔断器**: 自动故障检测和恢复
- **故障转移**: 模型故障时自动切换到备用模型

### 4. 健康监控
- 30秒间隔健康检查
- 自动标记不健康模型
- 负载历史追踪

## 使用方法

### 基本使用
```typescript
import { SubAgentExecutionManager } from './lep-subagent';

// 创建管理器
const manager = await SubAgentExecutionManager.create('./lep.config.js');

// 执行子Agent
const result = await manager.execute('提示词', {
  model: 'glm5',      // 可选：指定模型
  timeout: 600,       // 可选：超时（秒）
  priority: 'high'    // 可选：优先级
});
```

### 动态模型管理
```typescript
// 运行时添加模型
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

## 配置文件

```javascript
// lep.config.js
module.exports = {
  models: {
    kimi: {
      name: 'kimi-coding/k2p5',
      timeout: { short: 180, medium: 600, long: 1200 },
      priority: 1,
      enabled: true
    },
    glm5: {
      name: 'glm-5',
      timeout: { short: 180, medium: 600, long: 1200 },
      priority: 2,
      enabled: true
    }
    // 可随意添加更多模型
  },
  
  routing: {
    type: 'priority'  // 路由策略
  },
  
  executionPool: {
    maxConcurrency: 5,
    queueSize: 100
  },
  
  healthCheck: {
    interval: 30000,
    failureThreshold: 3
  }
};
```

## 文件结构

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
└── package.json
```

## 与LEP整合

本模块是LEP韧性执行中心的子模块：

```
LEP 韧性执行中心
├── LEPExecutor (核心执行器)
├── N016/N017/N018 规则执行器
└── SubAgentExecutionManager (本模块)
    ├── 模型管理
    ├── 智能路由
    ├── 执行池
    └── 故障转移
```

## CLI使用

```bash
# 编译
npm run build

# 测试
npm test

# 开发模式
npm run dev
```

## 版本历史

| 版本 | 日期 | 变更 |
|:---|:---|:---|
| 1.0.0 | 2026-02-26 | 初始版本，实现完整子Agent执行管理 |

## 依赖

- Node.js >= 16
- TypeScript >= 4.9
- glob ^8.0.3

## 相关技能

- `lep-executor` - LEP核心执行器
- `parallel-subagent` - 并行子Agent v3.0.1
- `cras` - 认知反思与自主系统
