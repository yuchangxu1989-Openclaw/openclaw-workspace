# P3-1 CRAS→ISC 规则自动生成 — 执行报告

## 状态：✅ 完成

## 概述

实现了 CRAS 规则建议器（`rule-suggester.js`），完成闭环最后一环：CRAS 洞察自动建议新的 ISC 规则或修改现有规则。

## 创建的文件

| 文件 | 说明 |
|------|------|
| `skills/cras/rule-suggester.js` | 规则建议器主模块 |
| `skills/cras/rule-suggestions/` | 建议输出目录 |

## 核心功能

### 1. `analyzeInsights()` — 洞察分析
- 扫描 `skills/cras/insights/` 目录中所有 JSON 洞察文件
- 按类型和严重性提取规则建议
- 去重（同一技能+同一操作类型只保留一个）
- 写入 `rule-suggestions/` 目录
- 通过 event-bus 发布 `cras.rule.suggested` 事件

### 2. `extractRuleSuggestion(insight)` — 建议提取逻辑
- **assessment_analysis + warning** → 建议加强该技能的质量规则（`quality_standard` 类型）
  - 如果已有相关 ISC 规则 → action=`update`
  - 如果没有 → action=`create`
- **error_pattern** → 建议创建错误防护规则（`system_level` 类型，高优先级）
- severity=`info` 的洞察跳过

### 3. `findRelatedRules(skillName)` — 关联规则查找
- 扫描 `skills/isc-core/rules/` 目录
- 通过全文搜索匹配包含目标技能名的现有规则

### 4. `listPending()` — 列出待审核建议
### 5. `approve(suggestionId)` — 审批建议
- 更新状态为 `approved`
- 发布 `cras.rule.approved` 事件

## 测试结果

```
分析洞察文件: 9 个
生成建议: 2 条（去重后）

建议 1: 加强 cras 的质量规则
  - 优先级: medium
  - 操作: update（找到了已有规则 detection-cras-recurring-pattern-auto-resolve-017）
  - 来源洞察: insight_1772486023755_ei8e

建议 2: 错误防护规则: 系统错误来自 seef: evaluator timeout
  - 优先级: high
  - 操作: create（新建规则）
  - 来源洞察: insight_1772486023755_m95y
```

### 事件验证
- ✅ `cras.rule.suggested` 事件成功发布（2 条）
- ✅ 事件 payload 包含 suggestion_id、title、target_rule、action

## 闭环架构

```
ISC 规则 → SEEF 评测 → CRAS 洞察分析 → 规则建议器 → 人工审核 → ISC 规则更新
                                              ↑ (本次实现)
```

## Git 提交

```
commit 9a30930
[P3] CRAS rule suggester - auto-generate ISC rule suggestions from insights
3 files changed, 214 insertions(+)
```

## 日期
2026-03-03
