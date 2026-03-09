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
