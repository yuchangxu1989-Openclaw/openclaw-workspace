# Day3 Cron Reshape Report — Gap-2: 事件驱动架构重塑

**日期**: 2026-03-06  
**状态**: ✅ 完成  
**变更类型**: 架构重塑 (向后兼容)

---

## 概述

将 3 个核心 Cron 任务从独立轮询模式重塑为 **EventBus 事件驱动 + Cron 兜底补扫** 模式。

### 设计原则
- **主路径**: EventBus → Dispatcher → Handler (实时响应)
- **兜底路径**: Cron 定时检查 → 发现遗漏 → 重新 emit 到 EventBus (确保不丢事件)
- **不破坏**: 原始任务定义文件保留，添加重塑标记

---

## 变更详情

### 1. 自动响应管道 (auto-response-pipeline)

| 项目 | 旧模式 | 新模式 |
|------|--------|--------|
| 触发方式 | Cron 独立触发事件处理 | EventBus 事件 → Dispatcher → auto-response-handler |
| 事件类型 | evolver.insight.detected (旁路) | evolver.insight.detected / cras.insight.critical / system.metric.threshold_exceeded → 路由到 handler |
| Cron 用途 | 执行全部业务逻辑 | 每15分钟兜底补扫，检查遗漏事件并重新 emit |

**新增文件**:
- `skills/lto-core/config/cron/auto-response-pipeline.yaml` — 兜底补扫 Cron 配置
- `infrastructure/dispatcher/handlers/auto-response-handler.js` — 事件驱动 handler

**修改文件**:
- `infrastructure/dispatcher/routes.json` — 添加 3 条路由
- `skills/lto-core/tasks/auto-response-pipeline.yaml` — 添加重塑标记

### 2. 用户洞察 (cras-b-user-insight)

| 项目 | 旧模式 | 新模式 |
|------|--------|--------|
| 触发方式 | 每30分钟 Cron 直接调用 CRAS | EventBus `cras.insight.request` → Dispatcher → skill-cras-handler |
| Cron 用途 | 直接执行洞察分析 | 每30分钟检查是否有洞察输出，无则 emit `cras.insight.request` |

**新增文件**:
- `skills/lto-core/config/cron/cras-b-user-insight.json` — 兜底补扫 Cron 配置

**修改文件**:
- `infrastructure/dispatcher/routes.json` — 添加 `cras.insight.request` 路由
- `infrastructure/event-bus/bus-adapter.js` — 添加 `emitInsightRequest()` 便捷方法
- `skills/lto-core/tasks/cras-b-user-insight.json` — 添加重塑标记

### 3. 系统健康检查 (system-monitor-health)

| 项目 | 旧模式 | 新模式 |
|------|--------|--------|
| 检查维度 | cpu/memory/disk/load/process | **原有5项 + 新增5项 L3 指标** |
| 新增维度 | — | EventBus 吞吐/积压、Pipeline 成功率、熔断触发、DecisionLog 异常、FeatureFlag 变更 |
| 数据源 | 系统原生 | + `infrastructure/observability/metrics.js` + `decision-logger.js` + `feature-flags.js` |
| 触发方式 | 每小时 Cron | EventBus `system.health.request` + Cron 兜底 |

**新增文件**:
- `skills/lto-core/config/cron/system-monitor-health.yaml` — L3 扩展版 Cron 配置

**修改文件**:
- `infrastructure/dispatcher/routes.json` — 添加 `system.health.request` 路由
- `infrastructure/event-bus/bus-adapter.js` — 添加 `emitHealthRequest()` 便捷方法
- `skills/lto-core/tasks/system-monitor-health.yaml` — 添加重塑标记

---

## 新增基础设施

### 统一兜底补扫执行器
- **文件**: `infrastructure/cron/fallback-sweep.js`
- **功能**: 3 个 Cron 的兜底补扫逻辑统一入口
- **CLI**: `node fallback-sweep.js [auto-response|user-insight|health|all]`
- **职责**: 仅检查事件链路完整性，不执行业务逻辑本身

### Bus Adapter 扩展
- `emitInsightRequest(params)` — 触发用户洞察请求事件
- `emitHealthRequest(params)` — 触发系统健康检查请求事件  
- `emitAutoResponse(type, payload, source)` — 触发自动响应事件

### Dispatcher 路由新增 (routes.json)
| 事件类型 | Handler | 说明 |
|----------|---------|------|
| `evolver.insight.detected` | auto-response-handler | Evolver 洞察 → 自动响应 |
| `cras.insight.critical` | auto-response-handler | CRAS 关键洞察 → 自动响应 |
| `system.metric.threshold_exceeded` | auto-response-handler | 系统指标越界 → 自动响应 |
| `cras.insight.request` | skill-cras-handler | CRAS 洞察请求 → 用户洞察分析 |
| `system.health.request` | system-monitor | 健康检查请求 → 系统监控 |

### Cron Jobs 注册 (jobs.json)
| Job 名称 | 频率 | 说明 |
|----------|------|------|
| `auto-response-sweep` | */15 min | 自动响应兜底补扫 |
| `user-insight-sweep` | */30 min | 用户洞察兜底补扫 |
| `system-health-l3` | 每小时 | L3 扩展健康检查 |

---

## 验证结果

### Bus Adapter 回归测试
```
✅ 16/16 tests passed — 向后兼容无破坏
```

### 新功能验证
```
✅ routes.json 加载 28 条路由，5 条新增路由正确
✅ bus-adapter 3 个 emit 便捷方法正常工作
✅ fallback-sweep.js 3 个补扫模式全部可执行
✅ auto-response-handler 分类/评估/响应逻辑正确
✅ L3 健康检查 5 个新维度全部有数据输出
✅ 所有 JSON 文件格式有效
```

### L3 健康检查输出示例
```json
{
  "eventbus": { "emitted": 0, "processed": 0, "dropped": 0, "status": "healthy" },
  "pipeline": { "success_rate": 100, "status": "healthy" },
  "breaker": { "trips": 0, "status": "healthy" },
  "decision": { "total": 80, "avg_confidence": 0.937, "degradation_count": 5, "status": "healthy" },
  "flags": { "total_flags": 22, "changes_from_default": 0, "status": "info" }
}
```

---

## 架构图

```
┌─────────────────────────────────────────────────────────┐
│                    事件驱动主路径                          │
│                                                         │
│  外部事件/API  ──→  EventBus (bus-adapter.js)            │
│       │                    │                            │
│       │              ┌─────┴─────┐                      │
│       │              │ Dispatcher │                      │
│       │              │ routes.json │                      │
│       │              └─────┬─────┘                      │
│       │         ┌──────────┼──────────┐                 │
│       │         ▼          ▼          ▼                 │
│       │  auto-response  skill-cras  system-monitor      │
│       │    handler       handler      handler           │
│       │                                                 │
├─────────────────────────────────────────────────────────┤
│                    Cron 兜底路径                          │
│                                                         │
│  Cron (*/15m|*/30m|0h)                                  │
│       │                                                 │
│       ▼                                                 │
│  fallback-sweep.js                                      │
│       │                                                 │
│       ├─ 检查遗漏事件 ──→ 重新 emit 到 EventBus          │
│       ├─ 检查洞察输出 ──→ 无则 emit cras.insight.request │
│       └─ L3 健康检查  ──→ 5 基础 + 5 L3 维度            │
└─────────────────────────────────────────────────────────┘
```

---

## 变更文件清单

### 新增 (6 files)
- `skills/lto-core/config/cron/auto-response-pipeline.yaml`
- `skills/lto-core/config/cron/cras-b-user-insight.json`
- `skills/lto-core/config/cron/system-monitor-health.yaml`
- `infrastructure/dispatcher/handlers/auto-response-handler.js`
- `infrastructure/cron/fallback-sweep.js`
- `reports/day3-cron-reshape-report.md` (本文件)

### 修改 (5 files)
- `infrastructure/dispatcher/routes.json` — +5 路由
- `infrastructure/event-bus/bus-adapter.js` — +3 emit 便捷方法
- `infrastructure/cron/jobs.json` — +3 Cron job 注册
- `skills/lto-core/tasks/auto-response-pipeline.yaml` — 重塑标记
- `skills/lto-core/tasks/cras-b-user-insight.json` — 重塑标记
- `skills/lto-core/tasks/system-monitor-health.yaml` — 重塑标记
