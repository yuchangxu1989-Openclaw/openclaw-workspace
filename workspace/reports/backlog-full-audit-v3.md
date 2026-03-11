# 存量任务全面审计 V3

> 生成时间：2026-03-11 11:42 CST
> 数据源：backlog-priority-v2.md、qa-audit-20260311-0927.md、memos-integration-audit.md、badcase-auto-harvest-rca-2026-03-11.md、context-bloat-analysis-2026-03-11.md、pdca-check-latest.json、git log（3天）、文件实测
> 方法：V2基础上交叉核对git commit + 文件实测 + PDCA指标 + 新审计报告发现，合并同类项

---

## 总览

| 优先级 | 总数 | ✅完成 | 🔄半成品 | ⏳待做 | ❌失败需重做 |
|--------|------|--------|----------|--------|-------------|
| **P0** | 9 | 4 | 2 | 2 | 1 |
| **P1** | 16 | 1 | 2 | 13 | 0 |
| **P2** | 12 | 1 | 0 | 11 | 0 |
| **P3** | 6 | 0 | 0 | 6 | 0 |
| **合计** | **43** | **6** | **4** | **32** | **1** |

与V2对比：+7项（MemOS审计4项P0→合并为1项P1系统任务、badcase链路3个断裂点拆分归入、correction-harvester升级为已修）

---

## P0 — 影响系统正确性/安全性（立即处理）

| # | 任务 | 状态 | 工作量 | 依赖 | 实测数据 |
|---|------|------|--------|------|----------|
| 1 | **飞书APP_SECRET git历史清除 + 密钥轮换** | ⏳待做 | M | 需人工操作飞书后台 | 代码层已改为读.env.feishu ✅，但`git log -p`仍可追溯原始密钥。需BFG/filter-branch清除 + 飞书后台轮换 |
| 2 | **ISC handler缺失（133/190条无handler）** | 🔄半成品 | XL | 无 | 192条规则文件，132个handler文件，实际匹配仅57条(30%)。V2时修了12条路径，但133条仍无handler。PDCA展开率67.4%，目标100% |
| 3 | **黄金评测集V4字段补齐** | 🔄半成品 | L | 无 | 852条总量：scoring_rubric=849(99%)✅、north_star_indicator=423(49%)、execution_chain_steps=413(48%)。**三字段全齐仅413条(48%)**。主要缺口：goodcases-from-badcases 426条缺north_star+chain；mined-from-memory 14条缺chain |
| 4 | **quality-audit技能空壳交付** | ❌失败需重做 | M | 无 | index.js仅25行，核心逻辑=`// TODO`。commit message声称"整合auto-QA/ISC审计/架构评审"但零实现 |
| 5 | **MEMORY.md铁令丢失** | ⏳待做 | S | 无 | 当前10.6KB，含3条铁令（意图LLM泛化、批次量级10条、评测标准飞书唯一源）。V2报告称丢失2条，需核对完整铁令清单并补回 |
| 6 | **.gitignore隐私泄露修复** | ✅完成 | — | — | commit `52d8663`，.gitignore已排除MEMORY.md/memory/*.db/memos-local |
| 7 | **Badcase事件名断路修复** | ✅完成 | — | — | commit `049749e`，三处统一为`user.feedback.correction` |
| 8 | **mandatory-parallel-dispatch执行引擎** | ✅完成 | — | — | commit `df96262`+`42ecf17`，从cognitive升级为有handler |
| 9 | **Git push链路修复** | ✅完成 | — | — | commit `60a01fe`，post-commit hook + cron兜底 |

**P0未完成项：5项（1待做+2半成品+1失败+1待做）**

---

## P1 — 影响效率/质量（本轮处理）

| # | 任务 | 状态 | 工作量 | 依赖 | 说明 |
|---|------|------|--------|------|------|
| 1 | **MemOS上下游不对齐修复（4×P0子项）** | ⏳待做 | L | 无 | 审计发现23个不对齐问题。4个P0子项：①memory-correction-handler写MEMORY.md不写MemOS ②向量化订阅只监听memory/*.md ③向量化服务不扫描memos.db ④evolver读MEMORY.md做进化决策。均未见修复commit |
| 2 | **Badcase采集链路5断裂点修复** | ⏳待做 | L | P0-7(已完成) | 事件名已统一✅，但仍有：①harvest产出缺V4字段(scoring_rubric/north_star/chain) ②三套采集机制数据不互通 ③pending→正式评测集无转化流程 ④completion-handler入库内容模板化。实测：00-real-badcases.json仅3条且0个V4字段 |
| 3 | **ISC规则展开aa-af批次重派** | ⏳待做 | L | P0-2 | aa-af 6批被杀无产出。PDCA显示展开率67.4%距100%差32.6% |
| 4 | **ISC展开ag/ai/aj批次重做** | ⏳待做 | M | P0-2 | QA审计：ag有数据但rule_id截断；ah=空数组；ai=rule_id和status空值。五层展开仅2/190条有数据 |
| 5 | **Eval Pipeline剩余6个根因修复** | ⏳待做 | L | P0-3 | 7大根因仅修1个(写校验+批次限制)。Agent空转、数据幻写、API失败、模板路径错误、结果解析失败、评分逻辑缺失6个未修 |
| 6 | **e2e评测跑分0%** | ⏳待做 | M | P1-5, P0-3 | glm-5和glm-4-plus均0/3 pass。依赖V4字段补齐+Pipeline修复 |
| 7 | **上下文膨胀治理** | ⏳待做 | M | 无 | 160k/200k tokens，工具结果占71.5%，compaction摘要3.4倍膨胀(5KB→19KB)。系统提示固定开销39k tokens(20%)。建议：切session+精简workspace文件+优化工具调用模式 |
| 8 | **北极星指标"言出法随/独立QA"零覆盖** | ⏳待做 | M | P0-3 | 423条黄金集无一条对应场景，仅V4 batch各10条synthetic |
| 9 | **Badcase采集V4格式不对齐** | ⏳待做 | M | P1-2 | 采集产出缺V4字段，入库后无法用于评测。与P1-2合并修复 |
| 10 | **capability-anchor index.js空壳** | ⏳待做 | S | 无 | 25行，核心=TODO。仅MD文档级注册，非程序化 |
| 11 | **Agent角色prompt专属化** | ⏳待做 | L | 无 | 19个Agent共用泛化prompt |
| 12 | **事件总线1:N架构审计** | ⏳待做 | M | 无 | 事件路由可能丢消息 |
| 13 | **任务超时率偏高** | 🔄进行中 | M | 无 | PDCA: 20%超时率，目标≤10%。需分析超时任务共性 |
| 14 | **看板推送稳定性** | 🔄进行中 | S | 无 | 6次commit迭代+v5重写后基本稳定。持续观察 |
| 15 | **correction-harvester空转修复** | ✅完成 | — | — | commit `8c86d43`，接入MemOS数据库+放宽信号匹配 |
| 16 | **凌霄阁→裁决殿重命名** | ✅完成(新) | — | — | commit `550f95c`，35文件统一重命名 |

**P1未完成项：12项（10待做+2进行中）**

---

## P2 — 优化增强（可排期）

| # | 任务 | 状态 | 工作量 | 依赖 | 说明 |
|---|------|------|--------|------|------|
| 1 | ISC enforcement字段格式统一 | ⏳待做 | S | 无 | 7条规则enforcement是JSON对象而非标准字符串 |
| 2 | ISC命名规范统一 | ⏳待做 | S | 无 | 部分全大写ID、handler路径风格混乱(~20条) |
| 3 | V4 batch格式不一致 | ⏳待做 | S | 无 | autonomous-loop用对象包装，其余用纯数组；yanchu-fasu有冗余difficulty字段 |
| 4 | 82个废弃任务正式归档 | ✅完成 | — | — | commit `35defcebc`+`08dbb4443` 归档110条 |
| 5 | 意图分类准确率提升 | ⏳待做 | XL | 无 | 当前77.3%，V4要求≥98%，IC4类仅57.5% |
| 6 | MemOS旧记忆导入 | ⏳待做 | M | P1-1 | 旧memory/*.md未导入MemOS向量库。当前MemOS有356 chunks(5.3MB) |
| 7 | 技能/知识文件向量化 | ⏳待做 | M | P1-1 | 有智谱向量化模型但技能文件未自动入向量库 |
| 8 | 2条Gate case北极星指标标注错误 | ⏳待做 | S | 无 | v4-gate-009/010标注为"根因分析覆盖率"，实际应为其他指标 |
| 9 | 代码级TODO/FIXME清理 | ⏳待做 | L | 无 | auto-debt-scan发现291个TODO+2个FIXME |
| 10 | MemOS P1子项(6个) | ⏳待做 | L | P1-1 | memory-loss-recovery不监控memos.db、bootstrap不检查MemOS就绪、memos-memory-guide空壳、GEP analyzer/solidify不读MemOS、日报不检查memos.db |
| 11 | MemOS P2子项(10个) | ⏳待做 | M | P2-10 | 健康检查脚本、备份脚本、ISC规则描述等适配MemOS |
| 12 | memos.db备份机制 | ⏳待做 | S | 无 | backup.sh不备份memos.db(5.3MB) |

---

## P3 — 可延后

| # | 任务 | 状态 | 工作量 | 依赖 | 说明 |
|---|------|------|--------|------|------|
| 1 | 评测集852条vs加载423条差异核查 | ⏳待做 | S | 无 | 实测c2-golden目录852条，可能含goodcases翻转的426条 |
| 2 | V4 batch 80条全synthetic需补真实case | ⏳待做 | XL | 长期 | V4要求真实对话≥80% |
| 3 | correction-harvester正则匹配率提升 | ⏳待做 | M | P1-15(已完成) | 已接入MemOS，需观察效果 |
| 4 | 评测报告增加北极星维度汇总视图 | ⏳待做 | S | P1-6 | 报告增强，非阻塞 |
| 5 | yanchu-fasu正负面比例3:7偏斜 | ⏳待做 | S | 无 | 其余文件均5:5 |
| 6 | completion-handler入库内容去模板化 | ⏳待做 | M | P1-2 | 当前3条badcase内容几乎一模一样，无诊断价值 |

---

## 关键指标仪表盘

| 指标 | 当前值 | 目标值 | 差距 | 关联任务 |
|------|--------|--------|------|----------|
| ISC handler覆盖率 | **30%** (57/190) | 100% | -70% | P0-2, P1-3, P1-4 |
| ISC五层展开率 | **1%** (2/190) | 100% | -99% | P1-3, P1-4 |
| V4三字段全齐率 | **48%** (413/852) | 100% | -52% | P0-3 |
| 评测跑分通过率 | **0%** (0/3) | ≥80% | -80% | P1-5, P1-6 |
| 任务超时率 | **20%** | ≤10% | -10% | P1-13 |
| PDCA规则展开率 | **67.4%** | 100% | -32.6% | P0-2 |
| Badcase自动入库 | **3条**(0个V4字段) | 持续增长 | 链路断 | P1-2, P1-9 |
| MemOS chunks | **356** | — | 正常 | P1-1 |
| 上下文占用 | **160k/200k** (80%) | ≤60% | -20% | P1-7 |
| 空壳技能 | **2个** (quality-audit, capability-anchor) | 0 | -2 | P0-4, P1-10 |

---

## 与V2对比变化

| 变化类型 | 数量 | 说明 |
|----------|------|------|
| 状态更新 | 5项 | scoring_rubric从0%→99%(半成品)、correction-harvester→✅完成、废弃任务归档→✅完成、凌霄阁重命名→✅完成(新增)、看板v5重写 |
| 新增项（MemOS审计） | 3项 | P1-1(4个P0子项合并)、P2-10(6个P1子项)、P2-11(10个P2子项) |
| 新增项（Badcase链路审计） | 1项 | P1-2(5断裂点合并为1项系统任务) |
| 新增项（其他） | 3项 | P2-12(memos.db备份)、P3-6(入库去模板化)、P1-16(重命名已完成) |
| 总数变化 | 36→43 | 净增7项（完成2项+新发现9项） |

---

## 建议执行路径

```
═══ 第1波：P0安全收尾（预估1h）═══
  P0-1  git历史清除APP_SECRET + 飞书密钥轮换     [M, 需人工]
  P0-5  铁令补回                                  [S]

═══ 第2波：P0质量补债（预估3h）═══
  P0-3  V4字段补齐（重点：426条goodcases补north_star+chain）  [L]
  P0-4  quality-audit技能重写（非骨架）                       [M]

═══ 第3波：P1-ISC展开（预估4h）═══
  P1-3  ISC aa-af 6批重派                         [L, 依赖P0-2]
  P1-4  ISC ag/ai/aj 3批重做                      [M, 依赖P0-2]
  → 目标：handler覆盖率30%→60%+

═══ 第4波：P1-评测链路打通（预估4h）═══
  P1-5  Eval Pipeline剩余6个根因修复              [L]
  P1-2  Badcase采集链路修复（V4字段+统一出口）     [L]
  P1-6  e2e评测重跑                               [M, 依赖P1-5+P0-3]

═══ 第5波：P1-系统优化（预估3h）═══
  P1-1  MemOS上下游4个P0子项修复                   [L]
  P1-7  上下文膨胀治理（切session+精简workspace）   [M]
  P1-10 capability-anchor实现                      [S]

═══ 第6波：P2排期 ═══
  按工作量S→L排序逐步消化
```

---

## 风险提示

1. **ISC handler覆盖率30%是最大系统性风险** — 133条规则无执行能力，治理体系形同虚设。但全量补齐工作量XL级，建议按业务优先级分批
2. **V4三字段全齐率48%** — scoring_rubric已99%接近完成，瓶颈在north_star_indicator和execution_chain_steps，主要缺口是goodcases-from-badcases的426条
3. **MemOS迁移半途** — 数据写入正常(356 chunks)，但上游23个组件仍读旧MEMORY.md，形成"写新读旧"的分裂状态
4. **git历史仍含APP_SECRET明文** — 代码层已修复但历史可追溯，属持续安全风险

---

*V3报告由backlog-full-audit子Agent自动生成。与V2相比：完成+2项，新发现+9项，总量36→43项，未完成37项。*
