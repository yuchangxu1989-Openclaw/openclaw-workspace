---
name: rule-hygiene
description: ISC规则治理——去重、命名统一、三维分析（意图/事件/执行），输出规则-事件-DTO对齐矩阵
version: "0.0.1"
status: active
tags: [isc, governance, quality, rules]
author: OpenClaw
created_at: 2026-03-05
---

# Rule Hygiene - ISC规则治理

distribution: agent-only

## 功能概述

ISC规则治理工具，负责规则生态的健康维护：去重、命名统一、三维分析、缺口扫描。

## 核心能力

### 一、规则去重

**不用文本相似度**，按三维展开判断：

| 维度 | 含义 | 判断标准 |
|------|------|---------|
| 意图（Intent） | 这条规则要解决什么问题？ | 意图相同=疑似重复 |
| 事件（Event） | 监听什么事件触发？ | 事件相同+意图相同=高度重复 |
| 执行（Action） | 触发后做什么？ | 三维全同=确认重复 |

去重流程：
1. 扫描 `skills/isc-core/rules/` 下所有 `.json` 文件
2. 提取每条规则的 intent（从description/rationale推断）、events、actions
3. 两两比对三维向量，输出重复度矩阵
4. 高度重复的规则给出合并建议

### 二、命名统一

强制统一为标准格式：`rule.{domain}-{name}-{seq}.json`

检查项：
- 文件名是否符合 `rule.` 前缀
- domain 是否在已知域列表中
- seq 是否为三位数字
- 存在非标命名时输出重命名映射表

### 三、规则盘点（对齐矩阵）

输出规则-事件-DTO对齐矩阵：

```
规则ID | 监听事件 | 触发动作 | DTO绑定 | 感知层 | 认知层 | 执行层
-------|---------|---------|---------|--------|--------|-------
rule.xxx | event.a | action.b | dto.c | ✅ | ✅ | ✅
rule.yyy | event.d | action.e | ❌缺失 | ✅ | ❌ | ✅
```

### 四、缺口扫描

按领域分析规则覆盖缺口：

1. 列出所有已知领域（quality, naming, pipeline, security, architecture...）
2. 统计每个领域的规则数量和覆盖事件
3. 识别无规则覆盖的关键事件
4. 输出缺口报告和建议补充的规则清单

## 使用方法

```bash
# 在主Agent中调用
"请执行规则治理盘点"
"检查ISC规则去重"
"输出规则-事件-DTO对齐矩阵"
"扫描规则命名合规性"
"分析规则覆盖缺口"
```

## 输出格式

所有输出使用文本行格式（遵循ISC规范，禁用Markdown表格对外输出）。

## 依赖

- ISC规则目录：`skills/isc-core/rules/`
- DTO任务定义：`skills/dto-core/`（用于对齐矩阵）
