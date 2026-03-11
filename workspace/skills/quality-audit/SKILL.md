---
name: quality-audit
description: 统一质量审计技能，整合auto-QA、ISC规则审计、completion review三大组件
version: "1.0.0"
status: active
allowed-tools: sessions_spawn, exec, read
---

# 质量审计（Quality Audit）

统一入口，整合三类质量审计能力。

## 三大组件

### 1. Auto-QA（完成时自动触发）
- **触发**：`subagent.completion` 事件，coder/writer/researcher完成任务后
- **规则**：`ISC-AUTO-QA-001`
- **Handler**：`skills/isc-core/handlers/auto-qa-on-completion.js`
- **逻辑**：reviewer/analyst/scout免审（防循环），failed任务免审
- **输出**：QA报告 + gate结果（pass/fail）

### 2. ISC规则合规审计
- **触发**：手动 or cron定时
- **脚本**：`skills/isc-core/bin/audit-rules.sh`
- **Handler**：`skills/isc-core/handlers/n022-isc-compliance-audit.js`
- **审计内容**：规则格式、handler存在性、五层闭环完整性
- **输出**：合规报告 + 不合规项清单

### 3. 架构评审流水线
- **触发**：架构设计文档提交
- **技能**：`skills/architecture-review-pipeline/`
- **流程**：`draft → engineering_review → qa_review → tribunal → approved/rejected`
- **规则**：并行工程+质量复审 → 裁决殿终审

## 使用方式

### 手动触发全量审计
```bash
# ISC规则审计
bash /root/.openclaw/workspace/skills/isc-core/bin/audit-rules.sh

# 单次QA（传入completion事件）
node /root/.openclaw/workspace/skills/isc-core/handlers/auto-qa-on-completion.js
```

### 自动触发
- completion-handler 自动调用 auto-qa-on-completion
- cron 定时 ISC 合规扫描
- 架构文档提交自动触发 review pipeline

## 质量门禁规则清单

| 规则ID | 名称 | 领域 |
|--------|------|------|
| ISC-AUTO-QA-001 | 开发产出自动质量核查 | completion |
| ISC-DOC-QUALITY-GATE-001 | 文档质量门禁 | doc |
| ISC-CODING-QUALITY-001 | 编码质量思考 | coding |
| ISC-SKILL-QUALITY-001 | 技能质量（无占位符） | skill |
| ISC-PUBLIC-SKILL-QUALITY-001 | 公开技能质量门禁 | skill |
| ISC-ARCHITECTURE-REVIEW-001 | 架构评审流水线 | architecture |
| ISC-AEO-QUALITY-GATE-001 | AEO质量门禁 | intent |
| ISC-POST-COMMIT-QUALITY-GATE | 提交后质量门禁 | commit |

## 关联
- **能力锚点**：`quality-audit` — 统一质量审计
- **ISC核心**：`skills/isc-core/` — 规则和handler存储
- **架构评审**：`skills/architecture-review-pipeline/` — 评审流水线
