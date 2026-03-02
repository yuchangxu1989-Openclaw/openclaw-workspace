# Dispatcher (Cron 调度器)

轻量事件调度器，由 OpenClaw Cron 每 5 分钟调用。从事件总线读取未消费事件，按路由表分发到对应处理器。

## 架构

```
dispatcher/
├── dispatcher.js   # 核心：读取未消费事件，按路由表分发
├── routes.json     # 事件→处理器映射（路由表）
├── dispatched/     # 已分发事件的记录（由 dispatcher 自动创建）
├── dispatch.log    # 调度日志
└── README.md       # 本文件
```

## 使用方式

### CLI 调用

```bash
# 处理所有待分发事件
node dispatcher.js

# 干运行（不实际分发，仅显示计划）
node dispatcher.js --dry-run

# 只处理特定类型的事件
node dispatcher.js --type isc.rule.*
```

### OpenClaw Cron 集成

```yaml
name: event-dispatcher
schedule: "*/5 * * * *"
task: "node /root/.openclaw/workspace/infrastructure/dispatcher/dispatcher.js"
model: kimi-coding/k2p5
```

## 路由表（routes.json）

```json
{
  "isc.rule.*": {
    "handler": "dto-sync",
    "agent": "coder",
    "priority": "high",
    "description": "ISC rule changes trigger DTO alignment sync"
  }
}
```

### 字段说明

| 字段 | 说明 |
|:-----|:-----|
| `handler` | 处理器标识（供下游系统识别） |
| `agent` | 执行该处理的 Agent 角色 |
| `priority` | 优先级：`high` / `normal` / `low` |
| `description` | 可选描述 |

### 路由匹配规则

1. **精确匹配优先**：`aeo.assessment.completed` 优于 `aeo.*`
2. **通配符匹配**：`isc.rule.*` 匹配 `isc.rule.created`、`isc.rule.updated` 等
3. **最长前缀优先**：多个通配符匹配时选择前缀最长的

## 分发流程

```
1. 从事件总线 consume 未处理的事件
2. 按路由表查找匹配的处理器
3. 按优先级排序（high > normal > low）
4. 逐个分发（写入 dispatched/ 目录）
5. 确认消费（bus.ack）
6. 更新心跳（observability/heartbeats.json）
```

## 可观测性

每次运行后更新 `infrastructure/observability/heartbeats.json`：

```json
{
  "event-dispatcher": {
    "lastRun": "2026-03-03T04:00:00.000Z",
    "status": "ok",
    "eventsProcessed": 5
  }
}
```
