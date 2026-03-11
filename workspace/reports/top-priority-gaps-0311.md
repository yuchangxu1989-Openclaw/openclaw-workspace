# Top优先级缺口盘点 — 2026-03-11

> 生成时间：2026-03-11 19:45 CST
> 数据源：backlog-full-audit-v3.md(43项)、backlog-priority-v2.md(36项)、今日git log(35 commits)、sessions.json(174 sessions)、文件实测
> 方法：V3 backlog交叉核对今日commit + 文件实测 + 今日subagent session状态

---

## 一、P0缺口（必须今天解决）

### P0-1 ❌ quality-audit技能空壳交付
- **来源**：V2-P0-10、V3-P0-4
- **当前状态**：index.js 576行，但仍含10处TODO/FIXME/placeholder/骨架残留。commit `de7b14c1d` 声称"实现三大审计组件替换空壳"，但实测仍有占位符代码
- **阻塞原因**：多次重做均未彻底清除骨架代码，QA审计标记❌失败
- **影响**：质量审计体系无法自动运行，所有"已完成"任务缺乏独立验证

### P0-2 ❌ ISC handler覆盖率仅30%（132/193）
- **来源**：V2-P0-6、V3-P0-2
- **当前状态**：193条规则文件，132个handler文件，但实际匹配仅约57条(30%)。今日commit `47693740a` 修了12条路径，但133条仍无handler
- **阻塞原因**：工作量XL级，ISC展开aa-af批次被杀无产出，ag/ai/aj批次空交付
- **影响**：治理体系形同虚设，70%规则无执行能力

### P0-3 🔄 黄金评测集V4字段严重缺失
- **来源**：V2-P0-7、V3-P0-3
- **当前状态**：
  - `infrastructure/aeo/golden-testset/` 仅81条case，V4三字段全部0%
  - `tests/benchmarks/intent/c2-golden/` 有分片文件但V4字段未补
  - V3报告称"scoring_rubric=849(99%)"，但实测golden-testset中0条有该字段
- **阻塞原因**：V4字段补齐任务从未成功派出
- **影响**：评测体系无法产出V4合规报告，e2e评测跑分0%

### P0-4 ⏳ MEMORY.md铁令丢失
- **来源**：V2-P0-8、V3-P0-5
- **当前状态**：当前MEMORY.md含10处铁令相关内容（6条铁令+4条🚨标记），V2报告称丢失2条，未见补回commit
- **阻塞原因**：未派人核对完整铁令清单
- **影响**：铁令缺失可能导致子Agent违规操作

### P0-5 ⏳ 飞书APP_SECRET git历史清除（用户已降级，私有仓库）
- **来源**：V2-P0-9、V3-P0-1
- **当前状态**：代码层已改为读.env.feishu ✅，git历史仍含明文。**但用户已明确降级**——GitHub是私有仓库，不需要清理git历史
- **阻塞原因**：用户决策降级，非阻塞
- **影响**：低风险，可延后

---

## 二、P1缺口（本周内解决）

### P1-1 ⏳ MemOS上下游不对齐（4个P0子项）
- **来源**：V3-P1-1、memos-integration-audit
- **当前状态**：MemOS DB存在(memos.db)，今日commit `5d3466367` 修了correction-handler写MemOS、`9de228a48` 修了evolver读MemOS。但23个不对齐问题中仅修2个
- **阻塞原因**：剩余21个组件仍读旧MEMORY.md，形成"写新读旧"分裂

### P1-2 ⏳ Badcase采集链路5断裂点
- **来源**：V3-P1-2、badcase-auto-harvest-rca-2026-03-11
- **当前状态**：事件名已统一(P0已完成)，但harvest产出缺V4字段、三套采集机制不互通、pending→正式无转化流程。实测00-real-badcases.json仅3条且0个V4字段
- **阻塞原因**：链路修复任务未派出

### P1-3 ⏳ ISC规则展开aa-af + ag/ai/aj批次（合并）
- **来源**：V2-P1-1/P1-2、V3-P1-3/P1-4
- **当前状态**：aa-af 6批被杀无产出，ag有数据但rule_id截断，ah=空数组，ai=空值。PDCA展开率67.4%
- **阻塞原因**：依赖P0-2 ISC handler框架，多次派出均超时/被杀

### P1-4 ⏳ Eval Pipeline剩余6个根因
- **来源**：V2-P1-4、V3-P1-5
- **当前状态**：7大根因仅修1个(写校验+批次限制)。Agent空转、数据幻写、API失败、模板路径错误、结果解析失败、评分逻辑缺失6个未修
- **阻塞原因**：未派人修复

### P1-5 ⏳ 上下文膨胀治理
- **来源**：V2-P1-5、V3-P1-7、context-bloat-analysis-2026-03-11
- **当前状态**：160k/200k tokens，工具结果占71.5%，compaction摘要3.4倍膨胀
- **阻塞原因**：需架构级改动（切session+工具结果截断）

### P1-6 ⏳ 北极星指标"言出法随/独立QA"零覆盖
- **来源**：V2-P1-6、V3-P1-8
- **当前状态**：golden-testset 81条中无一条对应场景
- **阻塞原因**：依赖V4字段补齐

### P1-7 ⏳ capability-anchor index.js空壳
- **来源**：V2-P1-8、V3-P1-10
- **当前状态**：仅MD文档级注册，index.js仍是TODO骨架
- **阻塞原因**：未派人实现

### P1-8 ⏳ Agent角色prompt专属化
- **来源**：V2-P1-9、V3-P1-11
- **当前状态**：19个Agent共用泛化prompt。今日commit `9eeea358a` 产出了"19 Agent MECE角色定义设计文档"，但未落地到实际prompt
- **阻塞原因**：设计已完成，实施未开始

### P1-9 🔄 任务超时率偏高
- **来源**：V2-P1-11、V3-P1-13
- **当前状态**：PDCA显示20%超时率（目标≤10%）。今日rework-analysis检测到45个返工事件（44个kill、1个retry）
- **阻塞原因**：超时根因未系统分析

### P1-10 ⏳ 事件总线1:N架构审计
- **来源**：V2-P1-10、V3-P1-12
- **当前状态**：未见修复commit
- **阻塞原因**：未派人排查

---

## 三、已完成但未验证的项（需确认是否真的生效）

| # | 任务 | commit | 风险点 |
|---|------|--------|--------|
| 1 | **感知层+规划层三大根治方案** | `cc8ab072e` (今日19:17) | dispatch-guard.js(317行)、main-tool-whitelist.js(4.9KB)已写入scripts/，但**未验证是否被主Agent实际加载和执行**。dispatch-protocol/index.js仍是自动生成骨架 |
| 2 | **调度守卫dispatch-guard** | `46059c7a2` + `40deb0a98` (今日) | 有两个版本：skills/dispatch-protocol/下的骨架 + scripts/下的317行实现。**哪个在用？是否冲突？** |
| 3 | **quality-audit三大审计组件** | `de7b14c1d` (今日13:21) | 576行代码，但仍含10处placeholder。**需重新QA验证** |
| 4 | **correction-handler写MemOS** | `5d3466367` (今日) | commit声称修复，**未验证MemOS中是否实际有新数据写入** |
| 5 | **evolver读MemOS** | `9de228a48` (今日) | commit声称修复，**未验证evolver是否实际从MemOS读取** |
| 6 | **看板推送v5重写** | `42505ec20` (今日) | 6次迭代后声称稳定，**但task-board.json显示0 active/0 history/0 completed**，看板数据可能未持久化 |
| 7 | **僵尸任务扫描** | `6cc5375`等 | QA审计发现stopReason缺少`error`状态（实际数据32例），**审计结论：❌打回** |
| 8 | **MECE角色定义设计文档** | `9eeea358a` (今日) | 设计文档已提交，**但未落地到实际Agent prompt配置** |
| 9 | **skill-creator骨架** | `601c865c7` (今日) | 自动生成骨架，index.js仅527字节，**非功能实现** |

---

## 四、今天killed/failed/需要重派的任务清单

> 注：sessions.json中所有session状态均为"unknown"（缺少status字段），以下基于rework-analysis + git log + QA报告推断

| # | 任务 | Agent | 状态 | 需要重派？ | 说明 |
|---|------|-------|------|-----------|------|
| 1 | **dispatch-guard-v3** | researcher/coder/researcher | 3次失败 | ✅ 已重派v4 | 前3次超时/被杀，第4次(coder-02)今日18:05派出 |
| 2 | **ISC展开aa-af** | 多个worker | killed无产出 | ✅ 需重派 | 6批全部被杀，0产出 |
| 3 | **ISC展开ag/ai/aj** | 多个worker | 空交付 | ✅ 需重派 | QA审计：空数组/空值 |
| 4 | **test-coder QA** | coder→reviewer | ❌ 3次失败 | ⚠️ 需排查根因 | 连续3次产出物缺失，reviewer审计发现coder和reviewer可能不共享/tmp |
| 5 | **build-dispatch-guard-v3** | 多个agent | 4次失败 | ✅ 已重派 | 超时×3 + killed×1 |
| 6 | **rework-analysis检测到的44个kill事件** | cron-worker等 | killed | ⚠️ 需分类 | 大部分是cron任务被kill，需区分正常终止vs异常 |

---

## 五、关键数据快照

| 指标 | 数值 | 目标 | 差距 |
|------|------|------|------|
| ISC handler覆盖率 | 30% (57/193) | 100% | -70% |
| V4字段全齐率(golden-testset) | 0% (0/81) | 100% | -100% |
| e2e评测通过率 | 0% (0/3) | ≥80% | -80% |
| 任务超时率 | 20% | ≤10% | +10% |
| MemOS组件对齐率 | 2/23 (9%) | 100% | -91% |
| MEMORY.md铁令数 | 6条确认 | 待核对 | 未知 |
| 今日commit数 | 35 | — | — |
| 今日non-cron session数 | 11 | — | — |
| task-board活跃任务 | 0 | — | 看板可能失效 |

---

## 六、建议立即行动项

```
紧急（今晚）:
  1. P0-1  quality-audit重写 — 清除所有placeholder，端到端验证
  2. P0-4  铁令核对补回 — 对比历史记忆，补齐丢失铁令
  3. 验证  感知层+规划层是否实际生效（dispatch-guard被加载了吗？）
  4. 验证  看板task-board.json为何全0（看板可能已失效）

本周:
  5. P0-2  ISC handler分批补齐（按业务优先级，先补高频触发的规则）
  6. P0-3  V4字段补齐（golden-testset 81条全部0%，比V3报告的48%更差）
  7. P1-1  MemOS上下游对齐（剩余21个组件）
  8. P1-4  Eval Pipeline 6个根因修复
  9. P1-3  ISC展开aa-aj批次重派
```

---

## 七、与V3 backlog对比变化

| 变化 | 说明 |
|------|------|
| P0-5 APP_SECRET降级 | 用户已明确：私有仓库不需清理git历史 |
| 感知层+规划层 | 今日新增3个commit，但均未验证生效 |
| quality-audit | 从"空壳"升级到"576行但仍有placeholder"，进步但未达标 |
| V4字段实测 | V3报告称48%全齐，实测golden-testset为0%，数据源可能不同 |
| 看板 | task-board.json全0，可能v5重写后数据未迁移 |
| 僵尸任务扫描 | QA审计打回，需补`error` stopReason |

---

*报告由 top-priority-gaps 子Agent 自动生成。基于V3 backlog(43项) + 今日35 commits + 11个subagent sessions交叉核对。*
