---
name: architecture-review-pipeline
description: 将架构评审流程固化为可执行技能：架构师提交后自动并行工程与质量复审，未通过自动打回，通过后进入凌霄阁终审并给出最终裁决。
allowed-tools: sessions_spawn, sessions_history
---

# 架构评审流水线（正式技能）

## 流程定义
状态机：`draft → engineering_review → qa_review → tribunal → approved/rejected`

核心规则（由记忆固化）：
1. **不等用户说就自动派复审**：进入 `draft` 后立即并行发起工程师 + 质量分析师复审。
2. **不等用户踢就自动打回**：任一复审不通过，自动进入 `rejected` 并输出问题清单。
3. **thinking=high 默认开**：所有评审子任务默认高思考强度，可参数覆盖。
4. **半成品不进凌霄阁**：仅当工程与质量复审均通过时，才进入 `tribunal`。
5. **用户最终裁决位于流程外层**：技能输出“终审建议与结论”，由外层对话中的用户做最终采纳/否决。

## 输入
- `designDocPath`（必填）：架构设计文档路径（相对或绝对）
- `config`（可选）：
  - `reviewers.engineer.agentId`（默认：`engineer`）
  - `reviewers.qa.agentId`（默认：`qa-analyst`）
  - `reviewers.tribunal.agentId`（默认：`lingxiaoge-tribunal`）
  - `thinking`（默认：`high`）
  - `model`（默认：空，交由平台路由）
  - `timeoutSeconds`（默认：`900`）
  - `runTimeoutSeconds`（默认：`600`）

## 输出
统一返回：
- `state`: 当前/最终状态
- `timeline`: 状态迁移记录
- `reviews.engineering`: 工程复审摘要
- `reviews.qa`: 质量复审摘要
- `tribunal`: 凌霄阁终审摘要（仅通过双复审后存在）
- `result`: `approved` 或 `rejected`
- `issues`: 不通过时的问题列表
- `finalDecision`: 面向用户最终裁决的建议

## 执行约束
- 不硬编码路径、模型名、用户 ID。
- 子任务必须通过 `sessions_spawn` 并行发起工程师与质量分析师复审。
- 审核判定采用“显式 PASS/FAIL + 结构化 JSON 优先，文本兜底”。
