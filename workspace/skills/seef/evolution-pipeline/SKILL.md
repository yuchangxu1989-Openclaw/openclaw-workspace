---
name: seef-evolution-pipeline
description: EvoMap技能自动进化流水线 - 实现技能从开发到EvoMap发布的全自动化状态机驱动系统
version: "1.0.0"
status: active
layer: core
abbreviation: SEEF-EP
full_name: Skill Evolution Pipeline
chinese_name: 技能自动进化流水线
author: OpenClaw
created_at: 2026-02-28
tags: [seef, evolution, pipeline, evomap, isc, automation, state-machine]
dependencies:
  - isc-document-quality
  - evomap-a2a
---

# SEEF-Evolution-Pipeline 技能自动进化流水线

## 功能概述

SEEF-Evolution-Pipeline是连接技能开发、测试、审核、发布、同步的全自动化流水线系统，实现技能从开发到EvoMap发布的零人工干预闭环。

### 核心特性

- **状态机驱动**: 7种生命周期状态，严格的流转规则
- **ISC集成**: 自动调用isc-document-quality进行质量校验
- **EvoMap同步**: 自动调用evomap-a2a发布Gene
- **文件监控**: chokidar实时监控skills/目录变更
- **韧性执行**: 重试、降级、错误恢复机制

## 技能生命周期状态机

```
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│ DEVELOP │───▶│  TEST   │───▶│ REVIEW  │───▶│ RELEASE │───▶│  SYNC   │───▶│ ONLINE  │
│ (开发中) │    │ (测试中) │    │ (审核中) │    │ (已发布) │    │ (同步中) │    │ (已上线) │
└─────────┘    └────┬────┘    └────┬────┘    └─────────┘    └────┬────┘    └────┬────┘
     ▲              │              │                              │              │
     │              └──────────────┘                              │              │
     │                      ▼                                     │              │
     │                   FAILED ◀─────────────────────────────────┘              │
     │                                                                           │
     └───────────────────────────────────────────────────────────────────────────┘
```

### 状态说明

| 状态 | 说明 | 自动流转 | 超时 |
|:-----|:-----|:---------|:-----|
| DEVELOP | 开发中 | 是 -> TEST | 无 |
| TEST | 测试中(ISC校验) | 是 | 30min |
| REVIEW | 审核中 | 否(ISC≥80自动通过) | 24h |
| RELEASE | 已发布 | 是 -> SYNC | 10min |
| SYNC | 同步中(EvoMap) | 是 | 30min |
| ONLINE | 已上线 | 否 | 无 |
| FAILED | 失败 | 否 | 无 |

## 使用方法

### 命令行

```bash
# 启动监控模式（推荐）
node src/index.js watch

# 执行单次流水线
node src/index.js run

# 执行指定技能流水线
node src/index.js run isc-core

# 扫描所有技能
node src/index.js scan

# 查看状态
node src/index.js status
```

### 程序调用

```javascript
const { EvolutionPipeline } = require('./src/index');

const pipeline = new EvolutionPipeline();

// 初始化
await pipeline.initialize();

// 扫描技能
await pipeline.scanAllSkills();

// 执行流水线
await pipeline.runOnce();

// 或启动监控模式
await pipeline.startWatchMode();
```

## 配置

配置文件: `config/pipeline.config.json`

```json
{
  "watch": {
    "paths": ["/root/.openclaw/workspace/skills"],
    "debounceMs": 300000
  },
  "isc": {
    "minScore": 70
  },
  "evomap": {
    "autoSync": true,
    "maxRetries": 3
  }
}
```

## 依赖集成

### ISC文档质量校验

自动调用 `isc-document-quality` 进行多维度评分：
- 基础完整性(40分): SKILL.md字段、README.md结构
- 规范符合度(30分): 命名、格式、语言
- 内容准确性(20分): 描述匹配、示例可运行
- 扩展完整性(10分): 元数据、代码注释

### EvoMap A2A同步

自动调用 `evomap-a2a` 发布Gene：
- 读取EvoMap清单验证允许列表
- 构建Gene对象（包含SKILL.md、README.md内容）
- 发布到EvoMap Hub
- 支持离线模式（开发测试）

## 文件结构

```
skills/seef/evolution-pipeline/
├── SKILL.md                    # 本文件
├── README.md                   # 使用说明
├── package.json                # Node.js依赖
├── config/
│   └── pipeline.config.json    # 流水线配置
├── docs/
│   └── ARCHITECTURE.md         # 架构设计文档
├── src/
│   ├── index.js                # 主入口
│   ├── watcher.js              # 文件监控模块
│   ├── engine.js               # 流水线引擎
│   ├── state-manager.js        # 状态管理器
│   ├── validators/
│   │   └── isc-validator.js    # ISC校验器
│   └── uploaders/
│       └── evomap-uploader.js  # EvoMap上传器
└── .pipeline/                  # 运行时状态存储
    └── state/
```

## 版本历史

| 版本 | 时间 | 变更 |
|:-----|:-----|:-----|
| 1.0.0 | 2026-02-28 | 初始版本，完整状态机 + ISC集成 + EvoMap集成 |

---

**归属**: SEEF (技能生态进化工厂)  
**关联**: ISC | EvoMap A2A | 本地任务编排 | LEP
