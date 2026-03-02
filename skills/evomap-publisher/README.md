# EvoMap极简发布器

## 一句话说明

**只干一件事**：把SEEF+DTO生成的技能，发布到EvoMap网络上。

## 架构

```
┌─────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────┐
│  SEEF   │────▶│   DTO       │────▶│   EP        │────▶│ EvoMap  │
│ (进化)  │     │ (调度)      │     │ (发布)      │     │  Hub    │
└─────────┘     └─────────────┘     └─────────────┘     └─────────┘

SEEF负责：开发、测试、验证
DTO负责：调度、工作流
EP负责：发布（本组件）
```

## 状态机

```
IDLE ──publish()──▶ PUBLISHING ──success──▶ PUBLISHED
                          │
                          └─fail(3x)──▶ FAILED
```

## 安装

```bash
cd /root/.openclaw/workspace/skills/evomap-publisher
npm install
```

## 使用

### 命令行

```bash
# 发布技能
node index.js publish isc-core --version 3.0.11

# 查看状态
node index.js status

# 清空失败计数
node index.js clear-failed
```

### JavaScript API

```javascript
const EvoMapPublisher = require('./index.js');

const publisher = new EvoMapPublisher();

// 发布技能
await publisher.publish({
  skillId: 'isc-core',
  version: '3.0.11',
  priority: 'high'
});

// 监听结果
publisher.on('published', (result) => {
  console.log('发布成功:', result.geneId);
});

publisher.on('failed', (error) => {
  console.error('发布失败:', error.message);
});
```

## 配置

```bash
# .env
EVOMAP_HUB_URL=wss://hub.evomap.network
EP_MAX_RETRIES=3
EP_BACKOFF_BASE=1000
```

## 接口

### 输入（DTO调用）

```javascript
{
  skillId: "isc-core",
  version: "3.0.11",
  priority: "high",  // high | normal | low
  retryPolicy: {
    maxRetries: 3,
    backoff: [1000, 2000, 4000]
  }
}
```

### 输出（回调DTO）

成功：
```javascript
{
  status: "PUBLISHED",
  skillId: "isc-core",
  version: "3.0.11",
  geneId: "gene_isc-core_3.0.11_1234567890",
  capsuleId: "capsule_isc-core_3.0.11_1234567890",
  timestamp: "2026-03-01T01:00:00Z"
}
```

失败：
```javascript
{
  status: "FAILED",
  skillId: "isc-core",
  version: "3.0.11",
  error: {
    code: "UPLOAD_FAILED",
    message: "...",
    stage: "UPLOAD",
    retries: 3
  }
}
```

## 流程

1. **ISC最终检查** - 快速验证（<1秒）
2. **打包** - 生成Gene/Capsule
3. **WebSocket上传** - 通过evomap-a2a
4. **重试** - 最多3次，指数退避

## 依赖

- `evomap-a2a` - WebSocket连接
- `ws` - WebSocket客户端
