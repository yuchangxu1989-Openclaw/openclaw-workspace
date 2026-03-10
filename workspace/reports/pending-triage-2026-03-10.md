# 任务队列分拣报告 — 2026-03-10

## 概览

| 指标 | 数量 |
|------|------|
| 任务看板总条目 | 659 |
| timeout/failed 总数 | 152 |
| 已归档（archived） | 121 |
| 未归档（需处理） | 31 |
| timeout | 72 |
| failed | 80 |

## 重复项标记（同label ≥ 3次 → archive）

| label | 次数 | 描述 | 建议 |
|-------|------|------|------|
| gongzhonghao-2026-03-08-coder | 3x | 公众号文章-极客视角版 | ✅ 已全部归档 |
| gongzhonghao-2026-03-08-researcher | 3x | 公众号文章-调研视角版 | ✅ 已全部归档 |

> 仅2组label达到3次阈值，均已归档。gongzhonghao-2026-03-08-writer (2x) 也已归档。
> 公众号文章系列共8条任务全部失败/归档，如需重做应重新定义任务。

---

## 未归档31条任务分拣

### A. 值得重试（5条）

任务仍有价值，之前可能因系统boom/超时失败，重试有意义。

| label | 状态 | 说明 |
|-------|------|------|
| `badcase-harvest-20260310-morning` | timeout | 今天的badcase采集任务，数据仍有价值 |
| `badcase-harvest-auto-miss` | timeout | badcase自动采集遗漏补全，持续需要 |
| `cleanup-zombie-agents` | timeout | 运维清理任务，系统健康需要 |
| `pm-daily-report-0310` | failed | 今天的PM日报，时效性强但仍在当天 |
| `eval-v4-feishu-create` | failed | 评测集V4推飞书，如V4数据已就绪则值得重试 |

### B. 已过时（20条）

任务目标已被其他任务完成、被后续迭代取代、或时间窗口已过。

| label | 状态 | 过时原因 |
|-------|------|----------|
| `agent-role-audit-to-feishu` | failed | 3/8的审计任务，角色体系已多次迭代 |
| `caijuedian-rename-to-caijuedian` | timeout | 与已归档的 caijuedian-rename-execute 重复，重命名工作已有后续处理 |
| `e2e-audit-batch-01` | failed | e2e评测审计，已被后续batch覆盖 |
| `e2e-audit-batch-03` | failed | 同上 |
| `e2e-expand-batch4` | failed | e2e扩展，已有retry也失败，eval体系已迭代到V4 |
| `e2e-expand-batch4-retry` | failed | 同上的重试，仍失败 |
| `eval-v4-clean-final` | timeout | V4清洗系列，已有clean-rewrite和v2接力 |
| `eval-v4-clean-rewrite` | failed | 被 clean-rewrite-v2 取代 |
| `eval-v4-clean-rewrite-v2` | timeout | V4清洗最终版也超时，整个V4清洗流程需重新规划 |
| `isc-meta-rule-auto-programmatic` | timeout | 3/8的ISC任务，架构已多轮迭代 |
| `isc-programmatic-quality-audit` | timeout | 同上 |
| `lto-rename-global-alignment` | timeout | LTO重命名系列已有3个任务全部失败/超时，需重新规划而非重试 |
| `reviewer-analyst-boundary-retry` | failed | clarify-reviewer-analyst-boundary 的重试，两次都失败 |
| `swap-primary-to-claude` | timeout | 模型切换任务，可能已手动完成 |
| `switch-eval-v3-to-v4-token` | timeout | V3→V4 token切换，eval体系已迭代 |
| `timeout-triage-and-archive` | failed | 超时分诊任务——本次分拣已覆盖此目标 |
| `v4-arch-review` | failed | V4架构审查，已被后续优化任务取代 |
| `v4-optimize-all-4` | failed | V4优化系列，5个任务全部失败/超时 |
| `v4-optimize-execute` | timeout | 同上 |
| `v4-optimize-part1` | timeout | 同上 |

### C. 需重新定义（6条）

任务描述不清、目标已变化、或需要拆分/重新规划后再执行。

| label | 状态 | 原因 |
|-------|------|------|
| `clarify-reviewer-analyst-boundary` | timeout | reviewer/analyst边界问题需结合当前角色体系重新定义 |
| `p0-fix-naming-swap` | failed | P0命名修复，具体scope不明 |
| `p0-role-prompts-batch1` | timeout | P0角色prompt，需明确当前角色定义后重做 |
| `p0-role-prompts-batch2` | failed | 同上 |
| `v4-optimize-part2-retry` | timeout | V4优化Part2已重试仍超时，需拆分为更小粒度任务 |
| `v4-qa-review` | failed | V4 QA审查，需明确当前V4状态后重新定义scope |

---

## 已归档121条任务分析

已归档任务按主题分布：

| 主题 | 数量 | 说明 |
|------|------|------|
| 评测集挖掘/清洗/审计 (eval-*) | ~45 | 评测集从V3迭代到V4，大量挖掘和清洗任务已完成使命 |
| V3清洗 (v3-clean-*) | 8 | V3→V4迭代中的清洗任务，已过时 |
| 公众号文章 (gongzhonghao-*) | 8 | 3/8的文章任务全部失败，需重新规划 |
| 系统修复/提交 (fix-*, commit-*) | ~15 | 各种修复和git提交任务，多为一次性 |
| ISC/架构 (isc-*) | 5 | ISC合规和架构任务，已迭代 |
| LTO/重命名 (lto-*, rename-*) | 5 | 重命名系列，已有后续处理 |
| Voice/TTS | 5 | 语音相关研究和实现 |
| PDCA/报告 | 3 | 指标和报告任务 |
| 基础设施/规则 | ~15 | dispatch、delegation、event-bus等 |
| 其他 | ~12 | 安全分析、badcase、context引擎等 |

> 已归档任务归档合理，无需恢复。

---

## 建议操作

1. **立即重试**：A类5条任务可直接重新spawn
2. **归档**：B类20条 + C类中暂不处理的 → 标记archived
3. **重新定义后再执行**：
   - V4优化系列：拆分为更小粒度（单文件/单模块）
   - 角色边界问题：等角色体系稳定后统一处理
   - 公众号文章：如需重做，建议单agent单篇，不要并行3个视角
4. **eval体系**：45+条eval任务全部失败/超时，说明eval pipeline本身需要优化（批次太大、超时设置不够），而非简单重试

## 统计汇总

| 分类 | 未归档 | 已归档 | 合计 |
|------|--------|--------|------|
| A. 值得重试 | 5 | 0 | 5 |
| B. 已过时 | 20 | 121 | 141 |
| C. 需重新定义 | 6 | 0 | 6 |
| **合计** | **31** | **121** | **152** |

---

*报告生成时间：2026-03-10 17:36 CST*
*分析agent：analyst*
