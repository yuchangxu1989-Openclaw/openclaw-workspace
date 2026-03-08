# P2E Memory-Loss Proof — 实施路线图

**日期**: 2026-03-07 | **作者**: Scout | **优先级**: P0

---

## 交付物清单

| # | 文件 | 类型 | 描述 | 状态 |
|---|------|------|------|------|
| 1 | `memory-loss-proof-design.md` | 设计文档 | 完整方案：约束分层、三层防线、程序化检查 | ✅ 已产出 |
| 2 | `isc-rule-memory-loss-proof-gate-001.json` | ISC 规则 | 失忆免疫门禁规则 | ✅ 已产出 |
| 3 | `isc-rule-p2e-regression-sentinel-001.json` | ISC 规则 | P2E 回归哨兵规则 | ✅ 已产出 |
| 4 | `p2e-constraint-checklist.yaml` | 检查清单 | 18项约束沉淀检查清单 + 落地状态 | ✅ 已产出 |
| 5 | `p2e-memory-loss-proof-roadmap.md` | 路线图 | 本文件 | ✅ 已产出 |

---

## 核心发现

### 问题本质
Agent 每次会话都是"失忆重启"。如果 P2E 约束仅存在于对话/记忆中，它们会随 session 结束而消失。

### 解决方案：5层约束模型 + 3层防线

**5层约束模型** — 从代码强制到记忆建议，逐层递减强制力：
- **L0 INFRA**: Gateway/工具策略 → 完全免疫 ✅
- **L1 AGENTS.md**: System prompt 注入 → 每次会话加载 ✅
- **L2 ISC Rules**: 机器可读 JSON 规则 → 脚本校验 ✅
- **L3 Skills**: SKILL.md + 校验逻辑 → 按需加载 ✅
- **L4 CI**: 自动化测试 → 无人值守 ✅
- **L5 Memory**: 仅建议层 → ❌ 失忆会丢失

**3层防线** — 检测失忆风险：
1. **Cold Boot Test**: 零记忆 Agent 能否正确执行 P2E？
2. **Regression Sentinel**: 约束文件是否完整？规则是否健康？
3. **Adversarial Injection**: 故意违规能否被拦截？

### 当前约束沉淀率
- 已沉淀到 L0-L4: **9/18** (50%)
- 待沉淀: **8/18** (44%)
- 部分沉淀: **1/18** (6%)

---

## 实施步骤（按优先级）

### Phase 1: 基础设施（立即执行）
- [ ] 将 2 个 ISC 规则 JSON 部署到 `skills/isc-core/rules/`
- [ ] 在 workspace AGENTS.md 增加"失忆免疫约束"段落
- [ ] 验证 ISC 规则可被 isc-validator 解析

### Phase 2: 自动化检查（本周内）
- [ ] 创建 `scripts/p2e-cold-boot-test.sh` 并验证
- [ ] 创建 `scripts/constraint-file-integrity.sh` 并接入 cron
- [ ] 创建 `scripts/isc-rule-lint.sh` 并接入 Git hook
- [ ] 创建 `scripts/memory-dependency-audit.sh`

### Phase 3: 回归保障（Sprint 内）
- [ ] 创建 `scripts/regression-suite.sh` 整合所有检查
- [ ] 设置 cron 定期执行回归哨兵
- [ ] 建立对抗性注入用例集并定期运行
- [ ] 在 P2E 评测规范中增加 "memory-loss-proof" 维度

### Phase 4: 持续演进
- [ ] 每次新增约束时，在 checklist.yaml 中登记
- [ ] 月度审计：约束沉淀率不低于 90%
- [ ] 新 Agent 上线前必须通过 Cold Boot Test

---

## 关键原则

> **约束必须自己保护自己** — 一个好的约束不依赖 Agent "记得"它存在。
> 它通过代码、规则、脚本、测试来保障自己的执行，
> 就像法律不依赖公民"记得"法条原文，而靠执法机构来保障。
