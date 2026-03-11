# 遗留任务优先级看板 V2

> 生成时间：2026-03-11 10:13 CST
> 数据源：backlog-priority.md(V1)、qa-audit-20260311-0927.md、auto-debt-scan-day0.md、pdca-check-latest.json、aeo-remaining-issues、git log验证
> 方法：全量交叉核对，以git commit为准判定完成状态

---

## 总览

| 优先级 | 总数 | ✅已完成 | 🔄进行中 | ⏳待派 | ❌失败需重做 |
|--------|------|---------|----------|--------|-------------|
| **P0** | 10 | 5 | 1 | 3 | 1 |
| **P1** | 12 | 1 | 2 | 9 | 0 |
| **P2** | 9 | 0 | 0 | 9 | 0 |
| **P3** | 5 | 0 | 0 | 5 | 0 |
| **合计** | **36** | **6** | **3** | **26** | **1** |

---

## P0 — 影响系统正确性/安全性（立即处理）

| # | 任务 | 状态 | 说明 |
|---|------|------|------|
| 1 | .gitignore排除MEMORY.md和memory/ | ✅已完成 | commit `52d8663` — .gitignore已添加规则，MEMORY.md已从索引移除。QA审计通过 |
| 2 | Badcase采集事件名不匹配 | ✅已完成 | commit `049749e` — 发射端/接收端/dispatcher路由三处统一为`user.feedback.correction`。QA审计通过 |
| 3 | 飞书APP_SECRET明文泄露（QA新发现） | ✅已完成 | commit `533aa2b` — 移除硬编码，改为从.env.feishu读取。**但git历史仍含明文，需轮换密钥+清除历史** |
| 4 | Git push链路中断 | ✅已完成 | commit `60a01fe` — post-commit hook异步push + cron每5分钟兜底 |
| 5 | mandatory-parallel-dispatch执行引擎 | ✅已完成 | commit `df96262` + `42ecf17` — 从cognitive升级为有handler的执行规则 |
| 6 | ISC handler缺失+路径不匹配（合并项） | 🔄进行中 | commit `47693740a` 修正12条路径。**但190条规则中仅57条有匹配handler（覆盖率30%），133条仍缺失**。距100%差距巨大 |
| 7 | 423条黄金评测集缺3个V4核心字段 | ⏳待派 | `scoring_rubric`/`north_star_indicator`/`gate`全部0/423。80条V4 batch有字段但黄金集完全没有，评测体系无法产出V4合规报告 |
| 8 | MEMORY.md精简丢失2条铁令 | ⏳待派 | 未见相关commit，铁令未补回 |
| 9 | 飞书APP_SECRET git历史清除+密钥轮换 | ⏳待派 | commit `533aa2b`仅移除代码中的明文，**git历史仍可追溯原始密钥**。需`git filter-branch`或BFG清除+飞书后台轮换密钥 |
| 10 | quality-audit技能空壳交付（QA新发现） | ❌失败需重做 | commit `4c5bc0c`/`8598b27` — index.js核心逻辑为空TODO骨架，commit message声称"整合auto-QA/ISC审计/架构评审"但零实现 |

---

## P1 — 影响效率/质量（本轮处理）

| # | 任务 | 状态 | 说明 |
|---|------|------|------|
| 1 | ISC规则展开aa-af批次重派 | ⏳待派 | ag/ah/ai/aj已提交但质量差（ah=20条有数据，ag/ai/aj=0条空结果）。**aa-af被杀无产出**。PDCA显示128/190=67.4%展开率，距100%差32.6% |
| 2 | ISC展开ag/ai/aj批次重做 | ⏳待派 | QA审计发现ag/ai/aj的results为空数组或0条，属空交付。需重做 |
| 3 | e2e评测跑分0% | ⏳待派 | glm-5和glm-4-plus均0/3 pass。Pipeline能运行但无有效分数。依赖V4字段补齐 |
| 4 | Eval Pipeline 7大根因仅修1个 | ⏳待派 | P0修复仅提交写校验+批次限制+绝对路径模板。Agent空转、数据幻写、API失败等6个根因未修 |
| 5 | 上下文膨胀治理 | ⏳待派 | 160k/200k tokens，工具结果占71.5%空间，compaction摘要3.4倍膨胀。需切session+优化工具结果截断 |
| 6 | 北极星指标"言出法随/独立QA"零覆盖 | ⏳待派 | 423条黄金集中无一条对应场景，仅V4 batch各10条synthetic。V4五大北极星之首两项完全无法评测 |
| 7 | Badcase采集V4格式不对齐 | ⏳待派 | 采集产出缺scoring_rubric等V4字段，入库后无法直接用于评测 |
| 8 | capability-anchor index.js空壳 | ⏳待派 | QA审计发现仅修改了MD文档，index.js仍是TODO骨架。注册只是文档级别，非程序化 |
| 9 | Agent角色prompt专属化 | ⏳待派 | 审计发现19个Agent共用泛化prompt，需专属化 |
| 10 | 事件总线1:N架构审计 | ⏳待派 | 事件路由可能丢消息，需独立排查 |
| 11 | 任务超时率偏高 | 🔄进行中 | PDCA显示20%超时率（目标≤10%），需分析超时任务共性 |
| 12 | 看板推送稳定性 | 🔄进行中 | 6次commit迭代后基本稳定，但QA审计标注"反复修改质量不稳定"。需持续观察 |

---

## P2 — 优化增强（可排期）

| # | 任务 | 状态 | 说明 |
|---|------|------|------|
| 1 | ISC enforcement字段格式统一 | ⏳待派 | 7条规则enforcement是JSON对象而非标准字符串 |
| 2 | ISC命名规范统一 | ⏳待派 | 部分全大写ID、handler路径风格混乱（~20条） |
| 3 | V4 batch格式不一致 | ⏳待派 | autonomous-loop用对象包装，其余用纯数组；yanchu-fasu有冗余difficulty字段 |
| 4 | 82个废弃任务正式归档 | ⏳待派 | 任务看板82个过时任务待正式标记archived |
| 5 | 意图分类准确率提升 | ⏳待派 | 当前77.3%，V4要求≥98%，IC4类仅57.5% |
| 6 | MemOS数据迁移（触发Import） | ⏳待派 | 旧记忆未导入MemOS向量库，检索效果受限 |
| 7 | 技能/知识文件向量化 | ⏳待派 | 有智谱向量化模型但技能文件未自动入向量库 |
| 8 | 2条Gate case北极星指标标注错误 | ⏳待派 | v4-gate-009/010标注为"根因分析覆盖率"，实际应为其他指标 |
| 9 | 代码级TODO/FIXME清理 | ⏳待派 | auto-debt-scan发现291个TODO+2个FIXME，含多个空壳骨架 |

---

## P3 — 可延后

| # | 任务 | 状态 | 说明 |
|---|------|------|------|
| 1 | 评测集c2-golden 852条vs加载423条差异核查 | ⏳待派 | 可能是去重逻辑，需确认 |
| 2 | V4 batch 80条全synthetic需补真实case | ⏳待派 | V4要求真实对话≥80%，长期积累 |
| 3 | correction-harvester正则匹配率极低 | ⏳待派 | cron每5分钟扫描结果全是"0个纠偏信号"。P0事件名修复后应改善 |
| 4 | 评测报告增加北极星维度汇总视图 | ⏳待派 | 报告增强，非阻塞 |
| 5 | yanchu-fasu正负面比例3:7偏斜 | ⏳待派 | 其余文件均5:5，建议补充正面case |

---

## 与V1对比变化

| 变化类型 | 数量 | 说明 |
|----------|------|------|
| V1→V2 状态更新 | 6项 | 5项P0标记为✅已完成，1项P0标记为🔄进行中 |
| 新增项（QA审计发现） | 4项 | APP_SECRET泄露(P0)、quality-audit空壳(P0)、capability-anchor空壳(P1)、ISC展开空交付(P1) |
| 新增项（PDCA/debt-scan） | 3项 | 任务超时率(P1)、代码TODO清理(P2)、Gate标注错误(P2) |
| 新增项（AEO遗留） | 1项 | yanchu-fasu比例偏斜(P3) |
| 总数变化 | 28→36 | 净增8项（完成6项+新发现14项-合并6项） |

---

## 建议执行路径

```
第1波（P0安全收尾，30min）:
  #P0-9 git历史清除APP_SECRET + 飞书密钥轮换
  #P0-8 铁令补回

第2波（P0质量补债，2h）:
  #P0-7  423条V4字段补齐（10条/批×43批）
  #P0-10 quality-audit技能重写（非骨架）

第3波（P1-ISC展开，2h）:
  #P1-1  ISC aa-af 6批重派
  #P1-2  ISC ag/ai/aj 3批重做
  目标：190条100%展开

第4波（P1-评测链路，3h）:
  #P1-4  Eval Pipeline剩余6个根因修复
  #P1-3  e2e评测重跑
  #P1-6  北极星指标case补充

第5波（P1-系统优化）:
  #P1-5  上下文膨胀治理（切session+工具结果截断）
  #P1-8  capability-anchor实现
  #P1-9  Agent角色prompt专属化
```

---

*V2报告由backlog-priority子Agent自动生成。与V1相比：完成6项P0，新发现8项问题，剩余30项待处理。*
