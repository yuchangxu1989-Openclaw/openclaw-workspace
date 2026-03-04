---
name: seef
description: SEEF技能生态进化工厂 - 高度自治、可被云端大模型动态发现与自由编排的独立子技能集合，具备自主执行完整PDCA闭环能力
version: "3.0.12""
status: active
layer: core
abbreviation: SEEF
full_name: Skill Ecosystem Evolution Foundry
chinese_name: 技能生态进化工厂
---

# SEEF 技能生态进化工厂 v3.0.3

## 核心定位

SEEF 是技能治理的**基础设施层能力**，由**七个独立子技能**构成。每个子技能均为自治单元，拥有：
- 唯一功能边界
- 明确定义的输入输出契约
- 与 ISC 和 DTO 的标准化交互协议

**运行模式**：
- 可被 DTO 按预设流程调用（如每日凌晨 2:00 执行全量进化）
- 可被云端大模型根据实时上下文动态组合调用（如仅启动 evaluator + discoverer 进行需求探查）

**核心原则**：所有运行必须满足**"标准合规"**与**"调度许可"**双重条件。

## 核心价值

| 维度 | 价值 |
|:-----|:-----|
| **对内** | 让技能资产持续自检、自修、自适应、自生长 |
| **对外** | 向 DTO 与大模型提供标准化接口，支持固定流程调度或高自由度混合编排 |
| **对齐** | 所有子技能的准入与准出，必须显式依赖 ISC 提供的规范阈值，并响应 DTO 的触发指令 |

## 七大子技能概览

| 序号 | 子技能 | 英文名称 | 核心职责 |
|:---:|:---|:---|:---|
| 1 | 技能评估器 | skill-evaluator | 多维质量诊断，融合 CRAS 用户意图洞察 |
| 2 | 技能发现器 | skill-discoverer | 识别能力空白、冗余建设及潜在协同机会 |
| 3 | 技能优化器 | skill-optimizer | 自动生成安全、可逆、低风险的修复方案 |
| 4 | 技能创造器 | skill-creator | 自动生成符合规范的新技能原型 |
| 5 | 全局标准化对齐器 | skill-aligner | 监听标准变更，自动触发全链路对齐 |
| 6 | 技能验证器 | skill-validator | 功能、质量与规范三重达标的最终裁决 |
| 7 | 技能记录器 | skill-recorder | 构建可追溯的进化知识库 |

## 整体运行模式

### 1. 自由编排模式

由云端大模型根据上下文动态调用任意子技能组合：

```
evaluator → discoverer → creator
```

**约束**：
- 每次调用必须校验 ISC 提供的准入准出标准
- 必须向 DTO 注册本次调用上下文（trace_id, caller_type: llm）

### 2. 固定闭环模式

由 DTO 调用主入口 `seef.run(mode='fixed')`，自动按顺序执行：

```
evaluator → discoverer → optimizer → creator → aligner → validator → recorder
```

**特性**：
- 每一环节失败时暂停并告警
- 支持人工介入后继续

## 标准与调度咬合原则

所有子技能的**准入与准出**均为硬性关卡，必须同时满足：

1. **ISC 提供的标准判据**（阈值、模式、兼容性）
2. **DTO 提供的调度许可**（显式指令或隐式策略）

> ⚠️ **任何子技能不得绕过 ISC 标准或 DTO 调度直接流转，杜绝"黑箱"**

## 依赖与边界声明

| 项目 | 说明 |
|:-----|:-----|
| **不包含** | capability-evolver（独立技能，可被 DTO 单独编排调用） |
| **输出格式** | 均携带 `isc_ref: <version: "3.0.4"
| **向量化** | 底层技术实现，对外仅以"标准符合性分数""语义偏移值"等形式呈现 |

## 使用方式

### 命令行

```bash
# 固定闭环模式
python3 /root/.openclaw/workspace/skills/seef/seef.py --mode fixed

# 自由编排模式 - 仅评估和发现
python3 /root/.openclaw/workspace/skills/seef/seef.py --mode flexible --steps evaluator,discoverer

# 指定目标技能
python3 /root/.openclaw/workspace/skills/seef/seef.py --target isc-core --mode fixed
```

### Python API

```python
from seef import SEEF

# 初始化
seef = SEEF()

# 固定闭环模式
result = seef.run_fixed_loop(target_skill='isc-core')

# 自由编排模式
result = seef.run_flexible_chain(
    steps=['evaluator', 'discoverer', 'creator'],
    context={'cras_report': {...}}
)
```

## 版本历史

| 版本 | 时间 | 变更 |
|:-----|:-----|:-----|
| 3.0.3 | 2026-02-23 | 初始版本，七大子技能完整定义 |

---

**归属**: PCEC (周期性认知进化周期) - 核心层  
**关联**: ISC (智能标准中心) | DTO (可控任务调度中心) | CRAS (认知进化伙伴)
