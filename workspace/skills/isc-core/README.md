# ISC智能标准中心核心系统

## 功能概述

ISC-Core 是OpenClaw生态的智能标准中枢，实现四大核心能力：

1. **标准定义** - 自主决策规则、检测标准、命名规范
2. **标准生成** - 从问题洞察新规则
3. **标准分发** - 自动分发到LEP/Evolver/PDCA
4. **反思改进** - 发现反复问题，生成长效机制

## 快速开始

```bash
# 启动ISC核心并执行完整周期
cd /root/.openclaw/workspace/skills/isc-core
node index.js

# 或执行特定能力
node index.js --full-cycle    # 完整周期
node index.js --generate      # 仅标准生成
node index.js --distribute    # 仅标准分发
node index.js --reflect       # 仅反思改进
```

## 四大能力详解

### 1. 标准定义 (Standard Definition)

自动维护三类标准：
- **决策规则** - 条件-动作规则库
- **检测标准** - 问题检测阈值
- **命名规范** - 目录/文件/常量命名

### 2. 标准生成 (Standard Generation)

从问题中提取模式，自动生成规则：
- 问题信号提取
- 模式分类与严重度评估
- 规则自动生成

### 3. 标准分发 (Standard Distribution)

自动将规则分发到执行层：
- LEP韧性执行层
- Evolver进化循环
- PDCA流水线

### 4. 反思改进 (Reflective Improvement)

追踪反复问题，生成长效机制：
- 问题追踪与统计
- 反复问题检测
- 长效机制自动生成

## 架构

```
ISC-Core
├── StandardDefinitionLayer    # 标准定义层
├── StandardGenerationLayer    # 标准生成层
├── StandardDistributionLayer  # 标准分发层
└── ReflectiveImprovementLayer # 反思改进层
```

## 配置

标准文件存储位置：
- 决策规则: `rules/*.json`
- 长效机制: `assets/mechanisms/*.json`
- LEP配置: `/root/.openclaw/workspace/lep-config.json`
- Evolver规则: `/root/.openclaw/workspace/evolver/assets/isc-rules.json`

## 许可证

MIT
