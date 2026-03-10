# Gap1关闭：定时任务事件驱动化盘点+迁移方案（2026-03-10）

## 1) 当前所有 cron 任务（`openclaw cron list` 原始盘点）

> 说明：以下为本次执行命令输出中的任务清单（按输出顺序整理）。

| ID | Name | Schedule | Status | 备注 |
|---|---|---|---|---|
| new-event-dispatcher | event-dispatcher-每5分钟 | `*/5 * * * *` | skipped | 事件分发器，已偏事件化基础设施 |
| new-isc-change-detector | ISC变更检测-每15分钟 | `*/15 * * * *` | ok | 典型“轮询探测”任务 |
| d9d8123d-e14e-408d-b72c-04b273530943 | CRAS-E-自主进化 | `0 2 * * *` | ok | 日级策略任务 |
| e4b2a1cb-41a3-4dbb-b6a7-4971ef2bb5d8 | 系统维护-每日清理 | `0 2 * * *` | ok | 运维维护类 |
| merged-system-monitor-hourly | 系统监控-综合-每小时 | `0 * * * *` | ok | 系统巡检类 |
| merged-dto-aeo-hourly | DTO-AEO-智能流水线-每小时 | `0 * * * *` | ok | 流水线调度类 |
| 56fb967c-bddf-43cc-b2a6-453d2bd405d9 | pdca-check-loop | `0 1,3,5,8,10,12,14,16,18...` | ok | PDCA检查循环 |
| merged-capability-pdca-4h | 能力同步与PDCA-每4小时 | `5 */4 * * *` | ok | 能力/PDCA例行同步 |
| merged-system-pipeline-4h | 系统状态与流水线监控-每4小时 | `10 */4 * * *` | ok | 状态巡检与兜底 |
| memory-summary-6h | 记忆摘要-每6小时 | `0 */6 * * *` | ok | 周期性摘要 |
| merged-ops-maintenance | 运维辅助-清理与向量化-综合 | `35 */6 * * *` | ok | 运维批处理 |
| 504ace91-50f2-404c-985b-6723fafa5b44 | LEP-韧性日报-每日0900 | `0 9 * * *` | ok | 日报生成 |
| b76c9b20-d206-4d2d-9d26-815804cd22fd | CRAS-A-主动学习引擎 | `0 9 * * *` | ok | 每日学习计划 |
| f6f0ba02-eab9-4ab1-87cb-c1a9e648b5aa | CRAS-D-战略调研 | `0 10 * * *` | ok | 每日调研 |
| 7947b82d-da7b-4ce6-a854-9f0c1fa689d5 | CRAS-每日洞察报告 | `0 19 * * *` | ok | 每日洞察产出 |
| merged-isc-quality-daily | ISC-技能质量管理-每日 | `0 20 * * *` | ok | 质量管理日任务 |

---

## 2) 分类结果（A/B/C）

### A类：纯定时触发，无需事件化（保留 cron）

1. **e4b2a1cb... / 系统维护-每日清理**  
   - 理由：典型 housekeeping（清理、压缩、轮换），天然时间驱动。
2. **56fb967c... / pdca-check-loop**  
   - 理由：管理节律型检查，定时采样更稳定。
3. **merged-capability-pdca-4h / 能力同步与PDCA-每4小时**  
   - 理由：阶段性复盘与能力校准，适合固定节拍。
4. **memory-summary-6h / 记忆摘要-每6小时**  
   - 理由：汇总类任务需时间窗，不依赖单一事件。
5. **merged-ops-maintenance / 运维辅助-清理与向量化-综合**  
   - 理由：批处理与成本优化导向，适合离峰定时。
6. **504ace91... / LEP-韧性日报-每日0900**  
   - 理由：报表交付 SLA 是“固定时点”。
7. **b76c9b20... / CRAS-A-主动学习引擎**  
   - 理由：日计划编排属性强，按日节律执行合理。
8. **f6f0ba02... / CRAS-D-战略调研**  
   - 理由：日更调研任务，本质为定时编排。
9. **7947b82d... / CRAS-每日洞察报告**  
   - 理由：固定出报时间需求明确。
10. **merged-isc-quality-daily / ISC-技能质量管理-每日**  
   - 理由：日级质量审计，时间驱动更可控。

### B类：应改为事件触发，但保留 cron 兜底

1. **new-isc-change-detector / ISC变更检测-每15分钟**  
   - 判断：应由“变更事件”触发，cron 保留兜底补偿扫描。
2. **merged-system-monitor-hourly / 系统监控-综合-每小时**  
   - 判断：监控应以 telemetry/告警事件驱动；小时巡检保底。
3. **merged-system-pipeline-4h / 系统状态与流水线监控-每4小时**  
   - 判断：流水线状态变化应事件化；4h 全量体检保底。
4. **merged-dto-aeo-hourly / DTO-AEO-智能流水线-每小时**  
   - 判断：输入就绪/依赖完成时应即时触发；保留小时兜底重放。

### C类：应完全迁移为事件驱动（去 cron）

1. **new-event-dispatcher / event-dispatcher-每5分钟**  
   - 判断：事件分发器本身不应靠轮询“拉取事件”，应由事件总线 push/订阅驱动。可在迁移期短暂保留，但目标态为 0 cron。
2. **d9d8123d... / CRAS-E-自主进化**  
   - 判断：若“自主进化”基于评估结果、失败模式、能力缺口触发，应由评估事件触发，而非每日固定跑。该类响应式策略任务应彻底事件化。

---

## 3) B/C类事件化方案设计（事件名 + 触发条件 + Handler）

## B1) ISC变更检测（保留cron兜底）
- **事件名**：`isc.changed`
- **触发条件**：
  - ISC仓库/配置中心发生 commit、PR merge、发布版本变更；
  - 关键技能元数据（schema/manifest）发生变更。
- **Handler**：`handleIscChanged(event)`
  - 差异解析（变更文件/技能ID）
  - 增量扫描与影响面分析
  - 产出 `isc.scan.completed` / `isc.scan.failed`
- **cron兜底**：保留 `*/15`，仅做“漏事件补扫 + 死信重放”。

## B2) 系统监控-综合（保留cron兜底）
- **事件名**：`telemetry.anomaly.detected` / `service.health.changed`
- **触发条件**：
  - 指标越阈（error_rate、latency、queue_lag）
  - 服务状态变化（UP->DEGRADED->DOWN）
- **Handler**：`handleSystemAnomaly(event)`
  - 告警聚合与去重
  - 关联上下游链路
  - 创建工单/通知并触发自愈流程
- **cron兜底**：保留每小时健康快照巡检，防丢告警。

## B3) 系统状态与流水线监控-4h（保留cron兜底）
- **事件名**：`pipeline.state.changed` / `pipeline.run.finished`
- **触发条件**：
  - 流水线 run 状态变更（queued/running/success/failed/canceled）
  - 关键阶段超时、重试上限触发
- **Handler**：`handlePipelineStateChanged(event)`
  - 异常 run 定位
  - 自动补偿（retry/rollback/skip）策略决策
  - 写入运行审计与SLO统计
- **cron兜底**：每4小时全量 reconcile（状态对账）。

## B4) DTO-AEO智能流水线-每小时（保留cron兜底）
- **事件名**：`dto.input.ready` / `dependency.resolved`
- **触发条件**：
  - 上游数据落盘完成；
  - 依赖任务完成并标记可消费；
  - 手工重跑请求到达。
- **Handler**：`handleDtoAeoStart(event)`
  - 幂等键校验（防重入）
  - 拉起对应流水线 stage
  - 结果回写与下游事件发布 `dto.stage.completed`
- **cron兜底**：每小时触发“缺失批次补跑”。

## C1) event-dispatcher（完全事件化）
- **事件名**：`eventbus.message.received`
- **触发条件**：
  - 事件总线（Kafka/NATS/Redis Streams）收到新消息即触发。
- **Handler**：`dispatchEvent(event)`
  - 路由（按 topic/type）
  - 规则匹配与 fan-out
  - 投递重试与死信处理
- **迁移要求**：
  - 去掉 5 分钟轮询；
  - 改为长连接消费者组 + offset 提交；
  - 引入 DLQ 与 replay 工具。

## C2) CRAS-E-自主进化（完全事件化）
- **事件名**：`capability.gap.detected` / `evaluation.failed_pattern`
- **触发条件**：
  - 评估流水线产出连续失败模式；
  - 能力评分低于阈值；
  - 关键目标偏离（KPI drift）达到策略阈值。
- **Handler**：`handleSelfEvolution(event)`
  - 触发诊断（根因+优先级）
  - 生成改进计划（prompt/tool/policy/skill）
  - 发布 `evolution.plan.created` 并进入审批/自动执行
- **迁移要求**：
  - 移除日跑 cron；
  - 以事件阈值 + 冷却时间（cooldown）控制频率，避免抖动。

---

## 4) 建议迁移步骤（落地顺序）

1. **先B后C**：先把 B 类接上事件触发并保留 cron；观察 1~2 周稳定性。  
2. **统一事件契约**：定义 `id, type, source, ts, trace_id, payload, dedupe_key`。  
3. **幂等与重放**：所有 handler 必须支持幂等；建立 DLQ + replay CLI。  
4. **可观测性**：增加事件到达率、消费延迟、失败重试、死信量四类核心指标。  
5. **C类切换门禁**：当“事件触发覆盖率>99%、漏触发可回放、SLO稳定”后下线 cron。  

---

## 5) 结论

- **A类（保留定时）**：10项  
- **B类（事件化+cron兜底）**：4项  
- **C类（完全事件化）**：2项  

Gap1 关闭建议：以“B类完成事件接入 + C类完成去cron改造 + 对账指标稳定”作为验收标准。
