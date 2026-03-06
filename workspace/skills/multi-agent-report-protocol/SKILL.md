---
name: multi-agent-report-protocol
description: 多Agent汇报协议 - 子Agent任务状态汇报的格式规范与自动检查
version: "1.0.0"
status: active
layer: process
tags: [multi-agent, reporting, protocol, format]
---

# 多Agent汇报协议

## 目的

规范所有子Agent任务的状态汇报格式，确保信息完整、可追溯、不遗漏关键上下文。

## 强制格式

任何涉及子Agent的汇报（进行中/完成/失败），必须包含以下字段：

```
{agentId}/{实际模型名} | 任务名 | 状态 | 耗时
```

### 示例

✅ 正确：
- `coder/gpt-5.3-codex | git-sensor | ✅完成 | 1m49s`
- `researcher/claude-opus-4-6-thinking | condition-evaluator | 🔄执行中 | —`
- `scout/claude-opus-4-6 | feishu-api研究 | ✅完成 | 2m15s`

❌ 错误：
- `coder | git-sensor | ✅` — 缺模型名
- `coder/codex | git-sensor` — "codex"不是实际模型名
- `完成了git-sensor` — 缺所有必填字段

### 必填字段说明

| 字段 | 说明 | 示例 |
|------|------|------|
| agentId | openclaw.json中的agent名 | coder, researcher, scout |
| 实际模型名 | 完整模型标识符 | gpt-5.3-codex, claude-opus-4-6-thinking |
| 任务名 | spawn时的label或task摘要 | module-A-git-sensor |
| 状态 | ✅完成 / 🔄执行中 / ❌失败 / ⏸️阻塞 | ✅完成 |
| 耗时 | 完成任务的实际耗时 | 1m49s, 32s |
| commit hash | 如有代码提交，必须附带 | 7d2cbea |

### thinking级别

如果子Agent使用了thinking模式，必须标注：
- `researcher/claude-opus-4-6-thinking(high)` — 明确标注thinking级别

## 汇总表格式

批量汇报时使用表格，每行一个任务：

```
| # | 任务 | Agent/模型 | thinking | 状态 | 耗时 | commit |
|---|------|-----------|----------|------|------|--------|
```

## 自动检查

主Agent在发送汇报前自检：
1. 每个子Agent条目是否包含实际模型名（不是"codex"这种简称）
2. 完成的任务是否有commit hash
3. 失败的任务是否有错误原因

## ISC规则绑定

关联规则：`rule.multi-agent-communication-priority-001.json`

## 进化机制

- 发现新的汇报缺陷 → 更新本技能的格式规范
- 用户纠偏 → 立即修正并更新技能
