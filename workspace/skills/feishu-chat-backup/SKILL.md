---
name: feishu-chat-backup
description: 飞书聊天记录备份系统 - 实质性记录对话日志
version: "1.0.35"
status: active
---

# 飞书聊天记录备份

distribution: internal


## 功能

- 备份飞书对话消息
- 归档历史记录
- 生成备份报告

## 使用

```bash
node index.js
```

## 存储位置

- logs/: 最近7天记录
- archives/: 30天归档
