---
name: evomap-publisher
abbreviation: EP
full_name: EvoMap Publisher
chinese_name: EvoMap极简发布器
description: EvoMap极简发布器 - 只负责一件事：将SEEF+DTO生成的技能发布到EvoMap网络
version: "1.0.5"
status: active
layer: core
tags: [evomap, publisher, seef, dto, a2a]
---

# EvoMap极简发布器 v1.0.0

distribution: both


## 核心定位

**只干一件事**：把SEEF+DTO生成的技能，发布到EvoMap网络上。

### 设计纠正
- ❌ **旧设计**：复杂的9状态流水线（INITIAL→DEVELOP→TEST→REVIEW→RELEASE→SYNC→ONLINE→FAILED→ARCHIVED）
- ✅ **新设计**：极简3状态发布器（IDLE→PUBLISHING→PUBLISHED/FAILED）

### 与SEEF的职责边界

| 系统 | 职责 | 不包含 |
|:-----|:-----|:-------|
| **SEEF** | 技能开发、测试、验证、优化 | 网络发布 |
| **DTO** | 任务调度、工作流编排 | 网络协议 |
| **EP** | 网络发布、A2A协议、状态同步 | 开发/测试/审核 |

## 极简状态机

```
┌─────────────────────────────────────────────────────────────────┐
│                    EvoMap发布器状态机（3状态）                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                         ┌─────────┐                            │
│     ┌───────────────────│  IDLE   │◄───────────────────┐       │
│     │                   │(空闲)   │                    │       │
│     │                   └────┬────┘                    │       │
│     │                        │                         │       │
│     │       DTO.publish()    │    新任务入队            │       │
│     │                        ▼                         │       │
│     │                   ┌─────────┐     重试           │       │
│     │                   │PUBLISHING│───────────────────┘       │
│     │                   │(发布中) │                            │
│     │                   └────┬────┘                            │
│     │                        │                                 │
│     │         ┌──────────────┼──────────────┐                  │
│     │         │              │              │                  │
│     │         ▼              │              ▼                  │
│     │    ┌─────────┐         │         ┌─────────┐            │
│     │    │PUBLISHED│◄────────┘         │ FAILED  │──────┐     │
│     │    │(已发布) │  成功              │(失败)   │      │     │
│     │    └─────────┘                   └─────────┘      │     │
│     │         │                               ▲         │     │
│     └─────────┴───────────────────────────────┴─────────┘     │
│                   回调DTO，返回结果                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 状态详细说明

| 状态 | 说明 | 触发条件 | 自动流转 |
|:-----|:-----|:---------|:---------|
| `IDLE` | 空闲等待，维护待发布队列 | 系统启动完成 | DTO指令→PUBLISHING |
| `PUBLISHING` | 正在发布：ISC最终检查→打包→WebSocket上传 | DTO.publish()调用 | 成功→PUBLISHED，失败→FAILED |
| `PUBLISHED` | 发布成功，技能已在EvoMap | WebSocket确认收到 | 回调DTO→IDLE |
| `FAILED` | 发布失败，重试3次后放弃 | 第3次重试失败 | 回调DTO→IDLE |

## 输入

### 1. SEEF输入
```javascript
{
  skillId: "isc-core",           // 技能ID
  skillPath: "/skills/isc-core", // 技能目录路径
  validationResult: {             // ISC验证结果
    score: 85,
    passed: true,
    timestamp: "2026-03-01T01:00:00Z"
  }
}
```

### 2. DTO指令
```javascript
{
  type: "publish",
  skillId: "isc-core",
  version: "3.0.11",
  priority: "normal",  // high | normal | low
  retryPolicy: {
    maxRetries: 3,
    backoff: [1000, 2000, 4000]  // 指数退避（毫秒）
  }
}
```

## 执行流程

```
┌─────────────────────────────────────────────────────────────────┐
│                      发布执行流程                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────┐                                                    │
│  │  START  │                                                    │
│  └────┬────┘                                                    │
│       │                                                         │
│       ▼                                                         │
│  ┌─────────────────┐                                            │
│  │ 1. ISC最终检查   │ ◄── 快速验证（< 1秒）                     │
│  │    • 技能目录存在 │     确认SEEF验证结果仍有效               │
│  │    • SKILL.md可读 │                                          │
│  │    • 验证未过期   │                                          │
│  └────────┬────────┘                                            │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────┐                                            │
│  │ 2. 打包          │ ◄── 生成Gene/Capsule格式                  │
│  │    • 读取元数据   │                                          │
│  │    • 构建Gene    │                                          │
│  │    • 生成Capsule │                                          │
│  └────────┬────────┘                                            │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────┐                                            │
│  │ 3. WebSocket上传 │ ◄── 通过evomap-a2a                        │
│  │    • 连接Hub     │                                          │
│  │    • publishGene │                                          │
│  │    • publishCap  │                                          │
│  │    • 等待确认    │                                          │
│  └────────┬────────┘                                            │
│           │                                                     │
│     ┌─────┴─────┐                                               │
│     │           │                                               │
│     ▼           ▼                                               │
│  ┌──────┐   ┌──────┐                                            │
│  │ 成功 │   │ 失败 │ ──► 重试3次 ──► 仍失败 ──► FAILED          │
│  └──┬───┘   └──────┘                                            │
│     │                                                             │
│     ▼                                                             │
│  ┌─────────────────┐                                            │
│  │ 4. 回调DTO       │                                            │
│  │    • 返回结果    │                                            │
│  │    • 更新状态    │                                            │
│  └─────────────────┘                                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 接口定义

### 1. 接收DTO指令
```typescript
interface PublishRequest {
  skillId: string;
  version: string;
  priority: 'high' | 'normal' | 'low';
  retryPolicy?: {
    maxRetries: number;
    backoff: number[];
  };
}

// DTO调用
EP.publish(request: PublishRequest): Promise<PublishResult>
```

### 2. 查询SEEF结果
```typescript
interface ValidationResult {
  score: number;
  passed: boolean;
  timestamp: string;
  checks: {
    skillMd: boolean;
    codeQuality: boolean;
    security: boolean;
  };
}

// EP内部调用
EP.getSkillValidation(skillId: string): ValidationResult
```

### 3. 回调DTO
```typescript
interface PublishSuccessResult {
  status: 'PUBLISHED';
  skillId: string;
  version: string;
  geneId: string;
  capsuleId: string;
  timestamp: string;
  hubResponse: any;
}

interface PublishFailureResult {
  status: 'FAILED';
  skillId: string;
  version: string;
  error: {
    code: string;
    message: string;
    stage: 'ISC_CHECK' | 'PACKAGING' | 'UPLOAD';
    retries: number;
  };
  timestamp: string;
}

type PublishResult = PublishSuccessResult | PublishFailureResult;

// EP回调
EP.onPublishComplete(result: PublishSuccessResult): void
EP.onPublishFailed(error: PublishFailureResult): void
```

## 错误处理

### 重试策略
```
第1次失败 ──► 等待1s ──► 重试
第2次失败 ──► 等待2s ──► 重试
第3次失败 ──► 等待4s ──► 重试 ──► 仍失败 ──► FAILED状态
```

### 错误分类
| 错误码 | 阶段 | 说明 | 处理 |
|:-------|:-----|:-----|:-----|
| `ISC_EXPIRED` | ISC检查 | 验证结果过期（>24h） | 立即失败，通知SEEF重新验证 |
| `SKILL_NOT_FOUND` | ISC检查 | 技能目录不存在 | 立即失败 |
| `PACKAGING_ERROR` | 打包 | 读取文件失败 | 重试3次 |
| `NETWORK_ERROR` | 上传 | WebSocket连接失败 | 重试3次 |
| `HUB_REJECT` | 上传 | EvoMap Hub拒绝 | 立即失败 |
| `TIMEOUT` | 上传 | 等待确认超时 | 重试3次 |

## 配置

### 环境变量
```bash
# EvoMap Hub连接
EVOMAP_HUB_URL=wss://hub.evomap.network

# 发布器配置
EP_MAX_RETRIES=3
EP_BACKOFF_BASE=1000  # 毫秒
EP_TIMEOUT=30000      # 毫秒
EP_QUEUE_SIZE=100     # 最大队列长度

# 日志
EP_LOG_LEVEL=info
```

## 使用方式

### 命令行
```bash
# 发布单个技能
node index.js publish isc-core --version 3.0.11

# 查看队列状态
node index.js status

# 清空失败任务
node index.js clear-failed
```

### JavaScript API
```javascript
const EvoMapPublisher = require('./index.js');

const publisher = new EvoMapPublisher({
  hubUrl: 'wss://hub.evomap.network',
  maxRetries: 3
});

// 监听状态
publisher.on('published', (result) => {
  console.log('发布成功:', result.geneId);
});

publisher.on('failed', (error) => {
  console.error('发布失败:', error.message);
});

// 发布技能
await publisher.publish({
  skillId: 'isc-core',
  version: '3.0.11',
  priority: 'high'
});
```

## 依赖

| 依赖 | 版本 | 用途 |
|:-----|:-----|:-----|
| `evomap-a2a` | ^1.0.0 | WebSocket连接和消息协议 |
| `ws` | ^8.19.0 | WebSocket客户端 |

## 版本历史

| 版本 | 时间 | 变更 |
|:-----|:-----|:-----|
| 1.0.0 | 2026-03-01 | 极简设计，3状态状态机 |

---

**归属**: EvoMap发布层  
**关联**: SEEF | DTO | EvoMap A2A | ISC
