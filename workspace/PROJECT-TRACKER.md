# PROJECT-TRACKER.md - 项目进度跟踪

> 唯一真相源。问"做了什么/遗留什么" → 只从此文件读。
> 更新规则：接到任务→建条目 | 完成→更新状态 | 阻塞→记原因 | 收工→写日报

---

## 状态图例
- ✅ 已完成
- 🔴 遗留/阻塞（必须注明原因）
- ⏳ 进行中
- 📋 待启动

---

## Sprint 1: 全系统闭环修复工程（L3架构重构）

### CRAS-E / 意图内化 高优先级任务（自动提取）

- ⏳ P0 CRAS-E持续进化中枢改造 — 证据：CRAS不能只是定时任务，必须是个持续进化的技能
- ⏳ P0 失忆后可持续进化保障 — 证据：如果你失忆了，还能像最近这几次任务一样自主进化么？一定要确保
- ⏳ P0 每轮对话意图洞察强制化 — 证据：你现在每轮对话都洞察我意图并自主进化么
- ⏳ P1 Day2遗留项逐桩打透 — 证据：Day2还有遗留项么
- ⏳ P0 禁止空架子产物治理 — 证据：一个个桩打透，别都做空架子


**基础文档**: `/root/.openclaw/media/outbound/system-loop-engineering-plan.md`（1184行完整方案）
**总体目标**: 从"Agent人肉编排"升级为"信号→调度→执行→评测→反馈"自动化管道

---

### Day 1（2026-03-04）— L3架构核心搭建

**凌霄阁裁决**: 有条件通过（5席有条件通过, 2席通过）

**已完成:**
- ✅ L3 Pipeline核心模块（EventBus/RuleMatcher/IntentScanner/Dispatcher/FeatureFlags/DecisionLogger）
- ✅ E2E测试 36/36 全部通过
- ✅ 凌霄阁裁决引擎 v1.0.0 独立技能化
- ✅ ISC Enforcement闭环 P0+P1 100% enforced
- ✅ Day 1 closure完成（`0422fb0`）

**Day 1凌霄阁遗留条件（需Day 2解决）:**
- ✅ → Day 2已解决（见下）

---

### Day 2（2026-03-05）— 韧性层 + 质量体系 + 意图识别

**凌霄阁裁决**: `a1a6dd5` 最小化决策追溯

**已完成:**
- ✅ L3错误处理与恢复机制 — 4模块, 64/64测试通过（error-handler/resilient-bus/resilient-dispatcher/config-self-healer）
- ✅ L3模块间接口契约测试 — 32/32全部通过
- ✅ E2E事件管道集成测试 — 34个测试通过
- ✅ ISC规则命名统一 — 28条重命名, 4条bundle拆分, 21条半成品规则修复
- ✅ 规则去重扫描 — 363对候选
- ✅ Deliberation最小化实现 — 决策追溯嵌入L3现有路径，非独立层
- ✅ 239条pending_execution清理 — 归零，新增防堆积机制
- ✅ 观测性与监控 — `1da0aa9`
- ✅ 技能内部/外销分离机制 — 34个publishable/20个local
- ✅ 依赖方向图 + CI门禁（DEP-001~DEP-005）
- ✅ 评测样本自动回收机制
- ✅ 统一测试注册器 + runner + 覆盖率分析
- ✅ 凌霄阁v4.3三项遗留（Feature Flag降级、依赖方向CI门禁、IC4/IC5边界规则）
- ✅ LLM上下文注入层 — 技能与模型彻底解耦
- ✅ 多轮意图分类benchmark — 67.6%→90.5%准确率（Day2 P0达标）`853ca2c`
- ✅ E2E event dispatch suite — 12 cases, 100% pass rate

**🔴 Day 2 遗留项（从转发对话中提取）:**

1. ✅ **定时任务重塑**（用户明确要求融入Day2-3）— **已验收通过 2026-03-07**
   - 4个Watcher + 4个Cron Adapter全部实现并测试通过
   - Check-and-skip双模式（事件触发优先 + cron兜底）正常运行
   - EventBus routes.json 完整（4条新路由已补充）
   - **验收结果**: 48/48 测试全部通过
   - **验收报告**: `reports/day2-gap1-verification-report-20260307.md`
   - **核心思想变化**：从"各模块各自cron轮询"→"EventBus事件驱动 + cron仅做兜底补扫" ✅ 已落地

2. 🔴 **全局自主决策流水线定时任务/报告范围升级**（用户提出）
   - 从"监控代码流水线"升级为"监控整个认知-决策-执行闭环"
   - 五层监控：意图层/决策层/执行层/效果层(AEO)/系统健康
   - 报告不再是Dev视角的changelog，而是Agent运营视角的效果仪表盘

3. 🔴 **AEO功能质量测试 + Agent数据效果评测**（用户标记为重点）
   - 每个Day研发完成后必须经凌霄阁裁决

4. ✅ **L3架构变化后的全系统重塑盘点**（Gap4 — 2026-03-07已完成）
   - 全系统盘点完成：ISC/DTO/CRAS/AEO/SEEF/LEP/Anti-entropy全部检查
   - 集成改造落地：dispatcher路由44→65条，4个event-bridge升级，LEP L3桥接新建，anti-entropy接入L3
   - 遗留P2项：5条（lep-executor旧引用、SEEF Python直接API、历史积压428条消化、evolver集成、pdca事件）
   - 详见报告: `reports/day2-gap4-l3-remodel-inventory.md`

5. ✅ **项目管理产物沉淀机制**（本次会话已完成）
   - PROJECT-TRACKER.md已创建
   - ISC规则已补：`rule.project-tracker-hygiene-001.json`、`rule.project-artifact-settlement-001.json`

---

### Day 3（2026-03-06）— 已启动

**已完成:**
- ✅ 6个Validation Gates实现 + 14单元测试（`2feb64e`）
- ✅ ISC enforcement rate 30.5%（目标≥20%达标）（`89f5334`）

**📋 待规划:**
- Day 2遗留项1-4需在Day 3 scope中排期
- 凌霄阁裁决Day 2后才能正式进入Day 3范围

---

## Cron任务现状（16个活跃）

| 状态 | 任务 | 频率 |
|------|------|------|
| ✅ ok | event-dispatch-runner | 5min |
| ✅ ok | event-dispatcher-每5分钟 | 5min |
| ✅ ok | ISC变更检测-每15分钟 | 15min |
| ✅ ok | 系统监控-综合-每小时 | 1h |
| ✅ ok | DTO-AEO-智能流水线-每小时 | 1h |
| 🔴 error | 能力同步与PDCA-每4小时 | 4h |
| ✅ ok | 系统状态与流水线监控-每4小时 | 4h |
| 🔴 error | LEP-韧性日报-每日0900 | daily |
| 🔴 error | CRAS-A-主动学习引擎 | daily |
| 🔴 error | CRAS-D-战略调研 | daily |
| ✅ ok | 记忆摘要-每6小时 | 6h |
| 🔴 error | 运维辅助-清理与向量化-综合 | 6h |
| ✅ ok | OpenClaw-自动备份-每日两次 | 2x/day |
| ✅ ok | ISC-技能质量管理-每日 | daily |
| ✅ ok | CRAS-E-自主进化 | daily |
| ✅ ok | 系统维护-每日清理 | daily |

**问题**: 5个error状态任务需要修复或重塑

---

## 归档
旧Sprint移至 `memory/sprint-archive/`

### Timeout治理（2026-03-07 补充）

- ✅ 已将 **timeout 默认策略** 明确收敛为：**优先拆解扩列后重跑**，不再仅做同任务 replacement 链式重试
- ✅ 已处理当前 2 个最新 timeout，并同步生成其拆解后新子任务清单（见下）
- ✅ 主表状态同步规则补充：原 timeout 任务保留为 `failed/auto-reaped: spawn_timeout` 终态；新拆解子任务作为当前执行入口进入 `queued/spawning`

**当前已处理的 2 个 timeout：**
1. `t_1772889901426_8minup` — 让同类请求自动命中扩列执行 `[3/4]` → 已拆解并重跑
2. `t_1772889901358_iiv93m` — 接入 ISC / 意图 / 事件 / 执行链 `[2/4]` → 已拆解并重跑

**已拆解的新子任务清单：**
- `t_1772890202157_n6dryv` — 让同类请求自动命中扩列执行 `[3/4]`（timeout 后拆解重跑入口，当前 queued）
- `t_1772890202043_ehcriq` — 接入 ISC / 意图 / 事件 / 执行链 `[2/4]`（timeout 后拆解重跑入口，当前 spawning）
- `t_1772890201901_dno7jo` — 补正式钢印/规则 `[1/4]`（同批 timeout 扩列链当前 spawning）
- `t_1772889901492_b0crjt` — 补最小验证 `[4/4]`（同批 timeout 扩列链当前 spawning）

**全局默认行为（Timeout → 拆解扩列 → 重跑）**
- timeout 发生后，默认先把任务还原/收敛到可执行子块，再进入扩列重跑
- 禁止无限给同一条 title 机械追加 `[replacement]` 形成链式空转
- 主表仅保留原 taskId 的唯一终态；拆出的新 taskId 进入当前执行态并承接后续结果
- 汇报/看板需同时展示：`原 timeout taskId` → `拆解后新 taskId`


### 自主扩列任务（自动生成）

- ⏳ P1 Benchmark timeout 收口 / Case 分片A（PB-001~PB-013） [parent=task-benchmark_timeout]
- ⏳ P1 Benchmark timeout 收口 / Case 分片B（PB-014~PB-026） [parent=task-benchmark_timeout]
- ⏳ P1 Benchmark timeout 收口 / Case 分片C（PB-027~PB-038） [parent=task-benchmark_timeout]
- ⏳ P1 Benchmark timeout 收口 / 汇总复跑与最终裁决 [parent=task-benchmark_timeout]
- ⏳ P1 Benchmark timeout 收口 / 运行器与超时根因治理 [parent=task-benchmark_timeout]
- 📋 P0 CRAS-E持续进化中枢改造 / 主实现 [parent=task-cras_e_rebuild]
- 📋 P0 CRAS-E持续进化中枢改造 / 汇报与验收 [parent=task-cras_e_rebuild]
- 📋 P0 CRAS-E持续进化中枢改造 / 集成改造 [parent=task-cras_e_rebuild]
- 📋 P0 CRAS-E持续进化中枢改造 / 风险治理 [parent=task-cras_e_rebuild]
- 📋 P0 CRAS-E持续进化中枢改造 / 验证测试 [parent=task-cras_e_rebuild]
- 📋 P1 CRAS-D研究策略落地 / 把研究源从二手社区文扩展到学术/官方优先采样 [parent=task-cras_d_strategy_execution]
- ⏳ P0 CRAS-D研究策略落地 / 将研究结论绑定本地执行压力与积压 [parent=task-cras_d_strategy_execution]
- 📋 P1 CRAS-D研究策略落地 / 生成 Feishu Doc 友好的结构化材料 [parent=task-cras_d_strategy_execution]
- 📋 P0 CRAS-D研究策略落地 / 把研究结论接入 Tracker / todo / DTO 任务树 [parent=task-cras_d_strategy_execution]
- 📋 P1 Day2遗留项逐桩打透 / 主实现 [parent=task-day2_closure]
- 📋 P1 Day2遗留项逐桩打透 / 汇报与验收 [parent=task-day2_closure]
- 📋 P1 Day2遗留项逐桩打透 / 集成改造 [parent=task-day2_closure]
- 📋 P1 Day2遗留项逐桩打透 / 风险治理 [parent=task-day2_closure]
- 📋 P1 Day2遗留项逐桩打透 / 验证测试 [parent=task-day2_closure]
- 📋 P0 全局自主性缺口整改 / 基建：badcase自动沉淀库与复盘索引 [parent=task-global-autonomy-5s-gap-remediation]
- 📋 P0 全局自主性缺口整改 / 决策层：缺库即纳入or badcase策略硬规则化 [parent=task-global-autonomy-5s-gap-remediation]
- 📋 P0 全局自主性缺口整改 / 调度层：自动扩列入队与5秒超时回补 [parent=task-global-autonomy-5s-gap-remediation]
- 📋 P0 全局自主性缺口整改 / 执行层：纳入动作落地校验与失败即badcase闭环 [parent=task-global-autonomy-5s-gap-remediation]
- 📋 P0 全局自主性缺口整改 / 汇报：5秒纳入SLA仪表盘与告警 [parent=task-global-autonomy-5s-gap-remediation]
- 📋 P0 全局自主性缺口整改 / 感知层：新增请求未入库5秒SLA检测与触发 [parent=task-global-autonomy-5s-gap-remediation]
- 📋 P0 失忆后可持续进化保障 / 主实现 [parent=task-memoryless_evolution]
- 📋 P0 失忆后可持续进化保障 / 汇报与验收 [parent=task-memoryless_evolution]
- 📋 P0 失忆后可持续进化保障 / 集成改造 [parent=task-memoryless_evolution]
- 📋 P0 失忆后可持续进化保障 / 风险治理 [parent=task-memoryless_evolution]
- 📋 P0 失忆后可持续进化保障 / 验证测试 [parent=task-memoryless_evolution]
- 📋 P0 每轮对话意图洞察强制化 / 主实现 [parent=task-per_turn_intent]
- 📋 P0 每轮对话意图洞察强制化 / 汇报与验收 [parent=task-per_turn_intent]
- 📋 P0 每轮对话意图洞察强制化 / 集成改造 [parent=task-per_turn_intent]
- 📋 P0 每轮对话意图洞察强制化 / 风险治理 [parent=task-per_turn_intent]
- 📋 P0 每轮对话意图洞察强制化 / 验证测试 [parent=task-per_turn_intent]
- 📋 P0 禁止空架子产物治理 / 主实现 [parent=task-no_empty_shell]
- 📋 P0 禁止空架子产物治理 / 汇报与验收 [parent=task-no_empty_shell]
- 📋 P0 禁止空架子产物治理 / 集成改造 [parent=task-no_empty_shell]
- 📋 P0 禁止空架子产物治理 / 风险治理 [parent=task-no_empty_shell]
- 📋 P0 禁止空架子产物治理 / 验证测试 [parent=task-no_empty_shell]
### CRAS-D 研究策略执行卡（自动生成）

- 📋 P1 CRAS-D研究策略落地 / 把研究源从二手社区文扩展到学术/官方优先采样 [parent=task-cras_d_strategy_execution]
- 📋 P0 CRAS-D研究策略落地 / 将研究结论绑定本地执行压力与积压 [parent=task-cras_d_strategy_execution]
- 📋 P1 CRAS-D研究策略落地 / 生成 Feishu Doc 友好的结构化材料 [parent=task-cras_d_strategy_execution]
- 📋 P0 CRAS-D研究策略落地 / 把研究结论接入 Tracker / todo / DTO 任务树 [parent=task-cras_d_strategy_execution]
