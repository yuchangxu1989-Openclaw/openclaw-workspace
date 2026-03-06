---
name: evomap-a2a
description: EvoMap A2A协议连接器 - 实现与EvoMap Hub的WebSocket连接、自动重连、消息队列管理
version: "1.0.11"
status: active
layer: infrastructure
tags: [evomap, a2a, websocket, network]
---

# EvoMap A2A 连接器

distribution: both


## 功能

- WebSocket连接EvoMap Hub
- 自动重连机制（最大10次）
- 消息队列管理（离线缓存）
- Gene/Capsule发布
- 节点注册与发现

## 使用

```javascript
const EvoMapA2A = require('./index.js');

const client = new EvoMapA2A({
  hubUrl: 'wss://hub.evomap.network',
  nodeId: 'node_myagent_001'
});

await client.connect();
client.publishGene({ type: 'Gene', summary: '优化技能' });
```

## API

- `connect()` - 连接Hub
- `disconnect()` - 断开连接
- `send(message)` - 发送消息
- `publishGene(gene)` - 发布Gene
- `publishCapsule(capsule)` - 发布Capsule

## 配置

环境变量:
- `EVOMAP_HUB_URL` - Hub地址

## 依赖

- `ws: ^8.19.0`
