# Day2 遗留项 #2：全局自主决策流水线 — 五层监控报告框架设计

> 生成时间：2026-03-08 11:41 GMT+8
> 目标：将 Dev 视角 changelog 报告升级为 Agent 运营视角效果仪表盘

---

## 一、现有 Cron 任务盘点

| # | 任务名 | 频率 | 覆盖层 | 说明 |
|---|--------|------|--------|------|
| 1 | `dispatch-governance-runner` | 5min | 执行层 | 多Agent派发治理（stale回收、超时、重发布） |
| 2 | `day-completion-scanner` | 1h | 系统健康 | Day完成事件检测 + 设计债务扫描 |
| 3 | `rework-analyzer` | 5min | 决策层 | 返工根因分析（steer/restart/kill信号） |
| 4 | `correction-harvester` | 5min | 效果层 | 用户纠偏信号收割 → 规则草案 |
| 5 | `auto-response-sweep` | 15min | 执行层 | EventBus遗漏事件兜底补扫 |
| 6 | `user-insight-sweep` | 30min | 意图层 | CRAS用户洞察兜底 |
| 7 | `system-health-l3` | 1h | 系统健康 | 含EventBus/Pipeline/Decision/FeatureFlag |
| 8 | `pipeline-dashboard-full` | 4h | 全层 | 五层闭环运营仪表盘（已有骨架） |
| 9 | `pipeline-dashboard-quick` | 1h | 全层 | 快速健康检查 + critical推送 |
| 10 | `evalset-cron-daily` | 每日5:00 | 效果层 | 评测集自动生成 |

### 覆盖缺口分析

| 层级 | 现有覆盖 | 缺口 |
|------|----------|------|
| L1 意图层 | `user-insight-sweep` 仅兜底 | **缺少**：意图识别准确率、意图分类分布、意图→决策转化率 |
| L2 决策层 | `rework-analyzer` 仅事后分析 | **缺少**：决策延迟、ISC规则命中率、决策置信度分布 |
| L3 执行层 | `dispatch-governance` + `auto-response-sweep` | 较完善，缺执行成功率聚合视图 |
| L4 效果层 | `correction-harvester` + `evalset-cron-daily` | **缺少**：AEO评分趋势、用户满意度代理指标 |
| L5 系统健康 | `system-health-l3` + `day-completion-scanner` | 较完善，缺资源利用率趋势 |

---

## 二、五层监控报告框架设计

### L1 意图层 — "Agent 听懂了什么"

| 指标 | 定义 | 数据采集方式 |
|------|------|-------------|
| **意图识别覆盖率** | 有明确意图标签的请求 / 总请求 | 解析 `memory/YYYY-MM-DD.md` 中的会话记录，匹配意图标注 |
| **意图分类分布** | 各意图类型（查询/创建/修改/调试/闲聊）占比 | 聚合 CRAS 洞察输出 `infrastructure/logs/cras-*.jsonl` |
| **意图→决策转化率** | 成功触发决策流程的意图 / 总意图数 | 关联 EventBus 事件 `intent.detected` → `decision.triggered` |
| **未识别意图占比** | fallback/unknown 意图占比（越低越好） | 扫描会话日志中的 fallback 路径命中 |

### L2 决策层 — "Agent 做了什么判断"

| 指标 | 定义 | 数据采集方式 |
|------|------|-------------|
| **ISC 规则命中率** | 触发 ISC 规则的决策 / 总决策 | 解析 `skills/isc-core/rules/` 匹配日志 |
| **决策平均延迟** | 从意图识别到决策产出的 p50/p95 | EventBus 时间戳差：`intent.detected` → `decision.completed` |
| **返工率** | 被 steer/kill/restart 的决策 / 总决策 | `rework-analyzer` 现有输出 + 聚合 |
| **决策置信度分布** | 高/中/低置信度决策的占比 | 扫描决策日志中的 confidence 字段 |
| **规则草案生成数** | correction-harvester 产出的新规则草案 | 统计 `skills/isc-core/rules/_drafts/` 文件数 |

### L3 执行层 — "Agent 干了什么活"

| 指标 | 定义 | 数据采集方式 |
|------|------|-------------|
| **子Agent执行成功率** | 成功完成的 subagent / 总 spawn 数 | `dispatch-governance-runner` 状态 + `runner-state.json` |
| **执行平均耗时** | subagent spawn→完成的 p50/p95 | `pending-dispatches.json` 时间戳差 |
| **超时/stale回收率** | 被超时回收的任务占比 | `dispatch-governance-runner` 日志聚合 |
| **EventBus 事件吞吐量** | 单位时间内处理的事件数 | `infrastructure/logs/event-bus.jsonl` 行数 |
| **工具调用分布** | 各工具 (read/write/exec/web_search…) 调用频次 | 会话日志中 tool_call 统计 |

### L4 效果层 (AEO) — "做得好不好"

| 指标 | 定义 | 数据采集方式 |
|------|------|-------------|
| **AEO 综合评分** | 评测集通过率 (加权) | `skills/aeo/evaluation-sets/` 最新 run 结果 |
| **用户纠偏频率** | 单位时间内的纠偏信号数（越低越好） | `correction-harvester` 输出统计 |
| **首次正确率 (FCR)** | 无需返工即完成的任务占比 | 1 - 返工率 |
| **金标测试集覆盖率** | golden-testset cases 数 / 已知场景数 | `infrastructure/aeo/golden-testset/*.json` 统计 |
| **规则采纳率** | 草案→正式规则的转化率 | `_drafts/` vs `rules/` 文件对比 |

### L5 系统健康 — "基础设施稳不稳"

| 指标 | 定义 | 数据采集方式 |
|------|------|-------------|
| **Cron 任务执行率** | 按计划触发的任务 / 应触发总数 | cron 日志 + `cron-event-bridge-runner` 记录 |
| **EventBus 积压量** | 未处理事件数（越低越好） | `infrastructure/event-bus/` 队列状态 |
| **磁盘/内存使用率** | workspace 磁盘占用 + 进程内存 | `df -h` + `free -m` 定时采样 |
| **错误率** | `on_failure` 触发次数 / 总执行次数 | 聚合所有 `*.log` 中的 ERROR 关键词 |
| **自动修复成功率** | auto-repair 成功次数 / 触发次数 | `auto-repair-executions.jsonl` |

---

## 三、报告输出格式设计

每次 `pipeline-dashboard-full` 执行产出的报告结构：

```markdown
# 🎯 Agent 运营仪表盘 — YYYY-MM-DD HH:mm

## 总览
| 层级 | 状态 | 关键指标 | 趋势 |
|------|------|----------|------|
| L1 意图 | 🟢/🟡/🔴 | 覆盖率 XX% | ↑/→/↓ |
| L2 决策 | ... | 返工率 X% | ... |
| L3 执行 | ... | 成功率 XX% | ... |
| L4 效果 | ... | AEO XX分 | ... |
| L5 系统 | ... | 错误率 X% | ... |

## L1 意图层详情 ...
## L2 决策层详情 ...
## L3 执行层详情 ...
## L4 效果层详情 ...
## L5 系统健康详情 ...
## 行动建议
- [ ] ...
```

---

## 四、Cron Job 配置草案

以下为新增/升级的 cron 任务配置，与现有 `jobs.json` 格式兼容：

```json
[
  {
    "name": "pipeline-dashboard-full",
    "description": "[Day2-Gap2][升级] 五层闭环运营仪表盘 — 采集L1-L5全链路指标，生成Agent运营视角报告",
    "script": "infrastructure/observability/pipeline-dashboard-cron.js",
    "args": ["--layers", "L1,L2,L3,L4,L5"],
    "schedule": "0 */4 * * *",
    "schedule_human": "每4小时",
    "model": "zhipu/glm-5",
    "enabled": true,
    "trigger": "event_bridge",
    "trigger_condition": "定时采集：L1意图/L2决策/L3执行/L4效果/L5系统全层指标",
    "mode": "standalone",
    "outputs": [
      "reports/pipeline-dashboard-YYYY-MM-DD.md",
      "infrastructure/observability/.dashboard-snapshot.json",
      "infrastructure/observability/.dashboard-history.jsonl"
    ],
    "data_sources": {
      "L1_intent": [
        "memory/YYYY-MM-DD.md",
        "infrastructure/logs/cras-*.jsonl"
      ],
      "L2_decision": [
        "skills/isc-core/rules/_drafts/",
        "reports/rework-analysis-*.md",
        "infrastructure/logs/event-bus.jsonl"
      ],
      "L3_execution": [
        "skills/public/multi-agent-dispatch/state/runner-state.json",
        "skills/public/multi-agent-dispatch/state/pending-dispatches.json",
        "infrastructure/logs/dispatch-cron-runner.jsonl"
      ],
      "L4_effect": [
        "skills/aeo/evaluation-sets/",
        "infrastructure/aeo/golden-testset/",
        "reports/correction-harvest-*.md"
      ],
      "L5_system": [
        "infrastructure/logs/health.jsonl",
        "infrastructure/logs/auto-repair-executions.jsonl",
        "infrastructure/logs/fallback-sweep.jsonl"
      ]
    },
    "timeout_seconds": 90,
    "on_failure": "log_and_continue",
    "tags": ["pipeline-dashboard", "five-layer-monitoring", "agent-ops", "day2-gap2"],
    "created": "2026-03-07",
    "upgraded": "2026-03-08",
    "bridge_event": "cron.job.requested",
    "bridge_runner": "infrastructure/event-bus/cron-event-bridge-runner.js",
    "execution_mode": "event_requested",
    "time_schedule": "0 */4 * * *"
  },
  {
    "name": "intent-recognition-monitor",
    "description": "[Day2-Gap2][新增] L1意图层监控 — 统计意图覆盖率、分类分布、转化率",
    "script": "infrastructure/observability/intent-monitor.js",
    "args": [],
    "schedule": "30 */2 * * *",
    "schedule_human": "每2小时第30分",
    "model": "zhipu/glm-5",
    "enabled": true,
    "trigger": "event_bridge",
    "trigger_condition": "定时：分析过去2小时的意图识别数据",
    "mode": "standalone",
    "outputs": [
      "infrastructure/observability/intent-stats.json",
      "infrastructure/observability/.dashboard-snapshot.json"
    ],
    "timeout_seconds": 60,
    "on_failure": "log_and_continue",
    "tags": ["intent-monitor", "L1", "day2-gap2"],
    "created": "2026-03-08",
    "bridge_event": "cron.job.requested",
    "bridge_runner": "infrastructure/event-bus/cron-event-bridge-runner.js",
    "execution_mode": "event_requested",
    "time_schedule": "30 */2 * * *"
  },
  {
    "name": "aeo-score-tracker",
    "description": "[Day2-Gap2][新增] L4效果层AEO评分追踪 — 汇总评测集结果、纠偏率、FCR",
    "script": "infrastructure/observability/aeo-score-tracker.js",
    "args": [],
    "schedule": "0 6 * * *",
    "schedule_human": "每日早6点",
    "model": "zhipu/glm-5",
    "enabled": true,
    "trigger": "event_bridge",
    "trigger_condition": "每日统计：汇总前24h AEO评分、纠偏频率、首次正确率",
    "mode": "standalone",
    "outputs": [
      "infrastructure/observability/aeo-daily-score.json",
      "infrastructure/observability/.dashboard-history.jsonl"
    ],
    "timeout_seconds": 90,
    "on_failure": "log_and_continue",
    "tags": ["aeo-tracker", "L4", "day2-gap2"],
    "created": "2026-03-08",
    "bridge_event": "cron.job.requested",
    "bridge_runner": "infrastructure/event-bus/cron-event-bridge-runner.js",
    "execution_mode": "event_requested",
    "time_schedule": "0 6 * * *"
  }
]
```

---

## 五、实施路径

| 阶段 | 内容 | 优先级 |
|------|------|--------|
| P0 | 升级 `pipeline-dashboard-full` 脚本，接入五层数据源 | 🔴 高 |
| P1 | 新建 `intent-monitor.js`，补齐 L1 意图层采集 | 🟡 中 |
| P1 | 新建 `aeo-score-tracker.js`，补齐 L4 效果层趋势 | 🟡 中 |
| P2 | 在 `pipeline-dashboard-full` 中增加趋势对比（与上一周期比较） | 🟢 低 |
| P2 | 增加告警阈值配置，critical 时自动推送飞书卡片 | 🟢 低 |

---

*本文档为 Day2 遗留项 #2 的设计产出，后续由 `pipeline-dashboard-full` cron 任务落地执行。*
