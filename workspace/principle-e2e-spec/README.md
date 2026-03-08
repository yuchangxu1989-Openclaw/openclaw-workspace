# 言出法随 E2E 评测规范 (Principle-to-Enforcement E2E)

**版本**: 1.0.0  
**创建日期**: 2026-03-07  
**状态**: ACTIVE  
**分类**: Formal Evaluation Track Specification

---

## 概述

"言出法随"（Principle-to-Enforcement，P2E）描述系统将**高阶原则/裁决/约束/目标类自然语言意图**自动展开为**可执行规则、可持续监控、可自主兜底**的全链路能力。

本规范定义该能力的正式评测轨道与验收标准，覆盖：

```
意图 → 事件 → ISC → DTO → CRAS → AEO → LEP → 测试 → Gate → 准出/发布
```

并新增统一 **closed-book gate**，用于 LLM eval / P2E / ISC-INTENT-EVAL-001 入口的闭卷约束固化，默认 **fail-closed**。

所有 benchmark runner 入口统一收口到双 Gate：`ISC-INTENT-EVAL-001` + `ISC-CLOSED-BOOK-001`。

---

## 目录结构

```
principle-e2e-spec/
├── README.md                          # 本文件（总纲）
├── 01-evaluation-model.md             # 评测模型（结构化定义）
├── 02-pipeline-spec.yaml              # 全链路管道规范（机器可读）
├── 03-verdict-schema.json             # 评测结论 schema（success/partial/fail）
├── 04-badcase-schema.json             # Badcase schema（错误归因）
├── 05-test-cases.json                 # 标准测试用例集
├── 06-gate-criteria.yaml              # Gate 准出标准（runner消费）
├── 07-runner-integration.md           # Runner集成指南
├── scripts/closed_book_gate.py        # 最小 closed-book gate 实现
└── examples/*.json                    # gate 验证样例
```

---

## 快速导航

| 关注点 | 文件 |
|--------|------|
| 理解评测模型 | `01-evaluation-model.md` |
| 机器消费管道定义 | `02-pipeline-spec.yaml` |
| 评测结论枚举 | `03-verdict-schema.json` |
| Badcase分析 | `04-badcase-schema.json` |
| 标准测试用例 | `05-test-cases.json` |
| Gate/准出标准 | `06-gate-criteria.yaml` |
| 集成实现指南 | `07-runner-integration.md` |
