# Day 2: L3 可观测性与监控

> 完成时间: 2026-03-05
> 状态: ✅ 已完成

## 概述

为 L3 闭环流水线构建了完整的可观测性基础设施，包含 4 个核心模块 + 全链路埋点。

## 完成内容

### 1. 运行时指标收集器 (`metrics.js`)

**路径:** `infrastructure/observability/metrics.js`

收集 5 大类运行时指标：

| 类别 | 指标 | 说明 |
|------|------|------|
| 事件总线 | `events_emitted_total`, `events_processed_total`, `events_dropped_total` | 事件流量追踪 |
| 意图识别 | `intent_requests_total`, `intent_hits_by_category`, `intent_no_match_total` | 意图命中分析 |
| 规则匹配 | `rules_evaluated_total`, `rules_matched_total`, `rules_no_match_total` | 规则匹配率 |
| 分发器 | `dispatch_total`, `dispatch_success`, `dispatch_timeout`, `dispatch_retry`, `dispatch_failed` | 分发成功率 |
| 流水线 | `pipeline_runs_total`, `pipeline_breaker_trips` | 流水线健康度 |

**计算指标 (gauges):**
- `dispatch_timeout_rate` — 超时率百分比
- `intent_no_match_rate` — 意图无匹配率
- `rules_match_rate` — 规则匹配率
- `*_latency_avg_ms`, `*_p95_ms` — 延迟统计（intent/pipeline/dispatch）

**持久化:** 每 60 秒自动快照 → `metrics.jsonl`，支持 `getHistory()` 历史查询

**API:**
- `inc(name, delta)` — 递增计数器
- `incCategory(name, category)` — 分类计数
- `recordLatency(type, ms)` — 记录延迟采样
- `getMetrics()` — 获取当前快照
- `resetMetrics()` — 重置所有指标
- `startTimer(type)` — 创建计时器
- `flush()` — 立即持久化

### 2. 健康检查端点 (`health.js`)

**路径:** `infrastructure/observability/health.js`

检查 5 个组件健康度：

| 组件 | 检查项 |
|------|--------|
| EventBus | 数据目录存在、events.jsonl 可写、最近有事件流入 |
| RuleMatcher | 规则目录存在、规则数 > 0、加载无错误 |
| Dispatcher | routes.json 有效、路由数 > 0、handlers 目录存在 |
| DecisionLog | 目录可写、文件未超 50MB |
| Pipeline | run-log.jsonl 存在、最近运行无过多错误 |

**返回格式:**
```json
{
  "status": "healthy|degraded|unhealthy",
  "components": { ... },
  "checked_at": "ISO8601",
  "summary": "✅ event_bus: up | ✅ rule_matcher: up | ..."
}
```

**状态判定逻辑:**
- 2+ 组件 DOWN → `unhealthy`
- 1 DOWN 或 2+ DEGRADED → `degraded`
- 其余 → `healthy`

### 3. 告警规则 (`alerts.js`)

**路径:** `infrastructure/observability/alerts.js`

6 条告警规则：

| 规则 | 严重度 | 阈值 |
|------|--------|------|
| `dispatch_timeout_rate_high` | critical | 超时率 > 10%（需 ≥5 次分发） |
| `intent_no_match_rate_high` | warning | 无匹配率 > 50%（需 ≥3 次请求） |
| `pipeline_breaker_trips_excessive` | critical | 5 分钟内断路 > 3 次（滚动窗口） |
| `dispatch_failure_rate_high` | warning | 失败率 > 20% |
| `pipeline_latency_high` | warning | P95 延迟 > 30s |
| `events_dropped_high` | warning | 事件丢弃率 > 10% |

**特性:**
- 5 分钟冷却去重（同一告警不重复触发）
- 告警写入 DecisionLog（跨模块审计）
- 告警持久化到 `alerts.jsonl`
- 可配置回调：`alerts.onAlert(callback)`
- Pipeline 每次 run 结束自动评估告警

### 4. Dashboard 数据接口 (`l3-dashboard.js`)

**路径:** `infrastructure/observability/l3-dashboard.js`

**`generateReport()`** — 生成完整 Markdown 格式 L3 运行报告，包含：
- 🟢/🟡/🔴 系统健康状态
- 📊 所有运行时指标
- 🚨 活跃告警列表
- 📋 最近 5 次流水线运行详情
- 📝 24h 决策日志摘要

**`statusLine()`** — 单行状态摘要（heartbeat 用）

**`checkAlerts()`** — 告警评估（heartbeat 集成）

### 5. Pipeline 全链路埋点

在 4 个核心模块中注入了 metrics 收集：

| 模块 | 埋点位置 | 收集指标 |
|------|----------|----------|
| **EventBus** (`bus-adapter.js`) | `emit()` → 成功计数, 风暴抑制 → 丢弃计数, `consume()` → 处理计数 | `events_emitted/processed/dropped_total` |
| **IntentScanner** (`intent-scanner.js`) | `scan()` → 请求计数+计时, 结果 → 分类命中/无匹配计数 | `intent_requests/hits_by_category/no_match_total`, latency |
| **RuleMatcher** (`isc-rule-matcher.js`) | `match()` → 评估计数, 结果 → 匹配/无匹配计数 | `rules_evaluated/matched/no_match_total` |
| **Dispatcher** (`dispatcher.js`) | `dispatch()` → 总数+计时, 成功/失败/超时/重试分别计数 | `dispatch_total/success/timeout/retry/failed`, latency |
| **L3Pipeline** (`l3-pipeline.js`) | `run()` → 运行计数+计时, 断路器 → 断路计数, 运行结束 → 自动告警评估 | `pipeline_runs/breaker_trips`, latency |

**埋点原则:**
- 所有 metrics 引用通过 `try/catch` 包裹，observability 模块不可用时静默降级
- 使用 `startTimer()` 自动记录延迟采样
- Pipeline 每次运行结束自动触发 `alerts.evaluate()`

## 测试验证

| 测试 | 结果 |
|------|------|
| RuleMatcher 测试套件 (68 tests) | ✅ 全部通过 |
| Bus Adapter 测试套件 (16 tests) | ✅ 全部通过 |
| Dispatcher 测试套件 (61 tests) | ✅ 全部通过 |
| Metrics 手动验证 | ✅ inc/incCategory/recordLatency/getMetrics/resetMetrics/flush/getHistory |
| Health 端点验证 | ✅ 5 组件全部 up, 整体 HEALTHY |
| Alerts 规则验证 | ✅ 6 规则定义正确, 无误报 |
| Dashboard 报告验证 | ✅ 完整 Markdown 报告生成 |

## 文件清单

```
infrastructure/observability/
├── metrics.js        # 运行时指标收集器
├── health.js         # 健康检查端点
├── alerts.js         # 告警规则引擎
├── l3-dashboard.js   # Dashboard 数据接口（L3 专用，升级版）
├── dashboard.js      # 原有系统级仪表盘（保留）
├── index.js          # 统一入口
├── metrics.jsonl     # 指标持久化文件
└── alerts.jsonl      # 告警持久化文件

# 埋点修改的文件:
infrastructure/event-bus/bus-adapter.js          # +metrics import, emit/consume 计数
infrastructure/intent-engine/intent-scanner.js    # +metrics import, scan 计时+分类
infrastructure/rule-engine/isc-rule-matcher.js    # +metrics import, match 匹配计数
infrastructure/dispatcher/dispatcher.js           # +metrics import, dispatch 成功/失败/超时
infrastructure/pipeline/l3-pipeline.js            # +metrics/alerts import, run 计时+断路+告警
```

## 架构图

```
┌─────────────────────────────────────────────────┐
│                 L3 Pipeline                      │
│                                                  │
│  EventBus ──→ RuleMatcher ──→ Dispatcher        │
│     ↑              ↑              ↑              │
│     │              │              │              │
│  ┌──┴──────────────┴──────────────┴──┐          │
│  │        metrics.inc()               │          │
│  │        metrics.startTimer()        │          │
│  │        metrics.recordLatency()     │          │
│  └──────────────┬────────────────────┘          │
│                 ↓                                │
│  ┌──────────────────────────────────┐           │
│  │     metrics.js (collector)       │           │
│  │  ┌────────┐  ┌────────────────┐  │           │
│  │  │counters│  │latency buckets │  │           │
│  │  └────┬───┘  └────────┬───────┘  │           │
│  │       └───────┬───────┘          │           │
│  │               ↓                  │           │
│  │        metrics.jsonl             │           │
│  └──────────────────────────────────┘           │
│                 ↓                                │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐    │
│  │health.js │ │alerts.js │ │l3-dashboard.js│   │
│  └──────────┘ └──────────┘ └──────────────┘    │
└─────────────────────────────────────────────────┘
```
