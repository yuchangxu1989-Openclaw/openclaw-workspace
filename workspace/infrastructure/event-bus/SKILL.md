# EventBus 事件总线

- **name**: event-bus
- **description**: 文件级事件总线，支持原子写入、风暴抑制、通配符消费、文件锁保护。含三层实现：bus.js(底层文件锁)、event-bus.js(已废弃)、bus-adapter.js(推荐入口)
- **version**: 2.0.0

## 核心API（bus-adapter.js — 推荐）

### `emit(type, payload?, source?, metadata?) → {id, suppressed} | null`
发射事件。内部委托bus.js文件锁保护写入，外加5秒风暴抑制。

| 参数 | 类型 | 说明 |
|------|------|------|
| `type` | string | 事件类型，格式: domain.object.verb |
| `payload` | object | 事件载荷 |
| `source` | string | 来源标识 |
| `metadata` | object | 元数据(chain_depth, trace_id等)，通过payload._metadata透传 |

### `consume(options?) → Array<object>`
消费事件。内部走bus.js的cursor+consumerId模式。

| 参数 | 类型 | 说明 |
|------|------|------|
| `options.type_filter` | string | 通配符过滤: `skill.*`, `*.failed`, `*` |
| `options.since` | number | 时间戳过滤(ms) |
| `options.layer` | string | 层级过滤(L1-L5, META) |
| `options.limit` | number | 最大返回数量 |
| `options.consumerId` | string | 消费者ID，默认`l3-pipeline` |

### `healthCheck() → {ok, total, corrupted, file_exists, file_size}`
校验events.jsonl完整性。

### `stats() → {total_events, file_size, dedupe_cache_size, consumers, events_by_type, adapter}`
获取统计信息。

## 底层API（bus.js）

### `bus.emit(type, payload, source) → event`
带文件锁的原子写入。

### `bus.consume(consumerId, options?) → Array`
基于cursor的消费模式。options: `{types: string[], limit: number}`

### `bus.ack(consumerId, eventId)`
确认消费事件，推进cursor。

### `bus.history(options?) → Array`
查询事件历史。options: `{type, since, until, source, limit}`

### `bus.purge()`
清空所有事件和游标（测试/维护用）。

## 依赖关系

```js
// bus-adapter.js
const bus = require('./bus');                    // 底层文件锁总线
// 延迟加载（避免循环依赖）
const _ruleMatcherModule = require('../rule-engine/isc-rule-matcher');  // emit后钩子

// bus.js — 无外部依赖（纯fs操作）
// event-bus.js — 已废弃，勿直接使用
```

## 事件

### Emit后钩子
- `isc.rule.*` 类型事件emit后自动触发 `RuleMatcher.reload()`（热重载ISC规则）

### 系统事件
- `system.eventbus.repaired` — healthCheck修复损坏行后自动emit（仅event-bus.js）

## Feature Flag 控制

| 环境变量 | 默认 | 说明 |
|----------|------|------|
| `L3_EVENTBUS_ENABLED` | true | Pipeline中EventBus消费开关 |

## 文件结构

| 文件 | 说明 |
|------|------|
| `bus.js` | 底层：文件锁+cursor+日志轮转(10MB) |
| `bus-adapter.js` | **推荐入口**：兼容新API签名，委托bus.js |
| `event-bus.js` | 已废弃(数据竞争)，勿直接使用 |
| `events.jsonl` | 事件存储文件 |
| `cursor.json` | 消费者游标 |

## 使用示例

```js
const EventBus = require('./infrastructure/event-bus/bus-adapter');

// 发射事件
EventBus.emit('skill.created', { name: 'weather' }, 'skill-watcher');

// 带元数据
EventBus.emit('user.intent.file_request.inferred', { text: '发文件' }, 'cras', { chain_depth: 1 });

// 消费事件
const events = EventBus.consume({ type_filter: 'skill.*', since: Date.now() - 300000 });

// 健康检查
const health = EventBus.healthCheck();
```
