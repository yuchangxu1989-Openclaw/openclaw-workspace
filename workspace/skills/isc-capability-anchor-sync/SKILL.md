---
name: isc-capability-anchor-sync
description: ISC锚点自动同步 - 从ISC规则自动生成能力锚点文档
version: "0.0.5"
status: active
tags: [isc, capability, anchor, sync, automation]
---

# ISC能力锚点同步器

distribution: internal


## 功能

- 从ISC规则自动读取能力定义
- 扫描技能目录获取核心能力
- 自动生成CAPABILITY-ANCHOR.md
- 支持每小时定时同步

## 使用

```bash
# 手动执行
node /root/.openclaw/workspace/skills/isc-capability-anchor-sync/index.js

# 查看生成的文档
cat /root/.openclaw/workspace/CAPABILITY-ANCHOR.md
```

## 定时任务

自动每小时执行（整点），无需手动操作。

## 数据来源

- ISC规则：`skills/isc-core/rules/*.json`
- 技能目录：`skills/`
- 输出文档：`CAPABILITY-ANCHOR.md`

## 强制读取机制（合并自 capability-anchor 技能）

**核心问题**：CAPABILITY-ANCHOR.md 存在 ≠ 被读取。没有强制读取机制 = 必定遗忘。

**设计意图**：
- AGENTS.md 第3条强制要求每次会话读取 CAPABILITY-ANCHOR.md
- 同步器不仅要生成文档，还要确保文档被消费
- 每次会话前应自动检查锚点文档是否过期

**验收标准**：
- [ ] CAPABILITY-ANCHOR.md 自动生成 ✅（已实现）
- [ ] AGENTS.md 强制读取条款存在
- [ ] 会话启动时自动检查锚点文档时效性
