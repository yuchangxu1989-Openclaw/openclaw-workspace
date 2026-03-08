# Event Bus (JSONL)

轻量级事件总线，基于 JSONL 文件实现，零外部依赖。

## 架构

```
event-bus/
├── bus.js          # 核心模块：emit / consume / ack / history / stats / purge
├── events.jsonl    # 事件日志（append-only，自动轮转 10MB）
├── cursor.json     # 各消费者的读取游标和已确认事件
├── archive/        # 轮转后的历史日志
├── test-bus.js     # 单元测试
└── README.md       # 本文件
```

## 快速使用

```javascript
const bus = require('./bus.js');

// 发布事件
const evt = bus.emit('isc.rule.updated', { rule_id: 'N001', action: 'update' }, 'isc-core');
// => { id: 'evt_xxx', type: 'isc.rule.updated', source: 'isc-core', payload: {...}, timestamp: 1234567890, consumed_by: [] }

// 消费事件（指定消费者 ID，只返回未消费的）
const events = bus.consume('lto-core', { types: ['isc.rule.*'] });

// 确认消费
bus.ack('lto-core', evt.id);

// 查询历史
const history = bus.history({ type: 'isc.rule.*', since: Date.now() - 3600000 });

// 统计
const stats = bus.stats();
```

## 事件格式

```json
{
  "id": "evt_m5abc_x7y8z9",
  "type": "isc.rule.updated",
  "source": "isc-core",
  "payload": { "rule_id": "N001", "action": "update" },
  "timestamp": 1234567890,
  "consumed_by": ["lto-core"]
}
```

## 支持的事件类型

| 类型 | 说明 |
|:-----|:-----|
| `isc.rule.created` | ISC 规则创建 |
| `isc.rule.updated` | ISC 规则更新 |
| `isc.rule.deleted` | ISC 规则删除 |
| `lto.sync.requested` | 本地任务编排 同步请求 |
| `lto.sync.completed` | 本地任务编排 同步完成 |
| `seef.skill.evaluated` | SEEF 技能评估完成 |
| `seef.skill.optimized` | SEEF 技能优化完成 |
| `aeo.assessment.completed` | AEO 评测完成 |
| `aeo.assessment.failed` | AEO 评测失败 |
| `cras.insight.generated` | CRAS 洞察生成 |
| `system.error` | 系统错误 |
| `system.health` | 系统健康心跳 |

## API 详情

### `bus.emit(type, payload, source)`
发布事件。自动生成唯一 ID 和时间戳。写入前自动检查文件大小并在超过 10MB 时轮转。

### `bus.consume(consumerId, options)`
消费未确认的事件。
- `options.types`: 事件类型过滤模式数组（支持 `*` 通配符，如 `isc.rule.*`）
- `options.limit`: 最大返回数量

### `bus.ack(consumerId, eventId)`
确认消费。幂等操作，重复调用安全。同时更新 JSONL 文件中的 `consumed_by` 和 cursor 偏移量。

### `bus.history(options)`
查询历史事件。
- `options.type`: 类型过滤模式
- `options.since`: 起始时间戳（ms）
- `options.until`: 结束时间戳（ms）
- `options.source`: 来源过滤
- `options.limit`: 最大返回数量

### `bus.stats()`
返回总线统计信息（总事件数、消费者数、按类型统计等）。

### `bus.purge()`
清空所有事件和游标（用于测试/维护）。

## 并发安全

使用 PID 文件锁（`O_CREAT | O_EXCL` 原子创建）防止并发写入冲突。自动检测并清理死锁进程遗留的陈旧锁。

## 日志轮转

`events.jsonl` 超过 10MB 时自动归档到 `archive/` 目录，并重置所有消费者游标。

## 运行测试

```bash
node test-bus.js
```
