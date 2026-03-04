# DecisionLog 审计日志

- **name**: decision-logger
- **description**: 统一决策审计日志。记录感知(sensing)、认知(cognition)、执行(execution)三阶段的决策过程，支持查询、摘要统计和自动轮转。
- **version**: 1.0.0

## 核心API

### `log(entry) → object`
记录一条决策。自动填充id和timestamp。超过10MB自动轮转。

| 字段 | 类型 | 必须 | 说明 |
|------|------|------|------|
| `entry.phase` | string | 否 | `sensing` / `cognition` / `execution` |
| `entry.component` | string | 否 | 来源组件名 |
| `entry.what` | string | 否 | 做了什么决策 |
| `entry.why` | string | 否 | 决策依据 |
| `entry.confidence` | number | 否 | 0.0-1.0 |
| `entry.alternatives` | Array | 否 | 考虑过的替代方案 |
| `entry.input_summary` | string | 否 | 输入摘要 |
| `entry.output_summary` | string | 否 | 输出摘要 |
| `entry.decision_method` | string | 否 | `llm` / `regex` / `rule_match` / `manual` |

### `query(opts?) → Array<object>`
查询决策记录（newest-first）。

| 参数 | 类型 | 说明 |
|------|------|------|
| `opts.since` | string/Date | 起始时间 |
| `opts.phase` | string | 按阶段过滤 |
| `opts.component` | string | 按组件过滤 |
| `opts.limit` | number | 最大返回数 |

### `summarize(timeRange?) → object`
生成决策摘要统计。

返回: `{total, by_phase, avg_confidence, degradation_count, by_method, by_component, time_range}`

### `rotate()`
手动触发日志轮转。自动清理超过7天的归档文件。

## 依赖关系

```js
// 无外部模块依赖（纯fs + crypto操作）
```

## 事件

### 被写入方
以下模块写入DecisionLog：
- `L3Pipeline` (phase: execution)
- `ISCRuleMatcher` (phase: cognition)
- `IntentScanner` (phase: sensing)
- `Dispatcher` (phase: execution)

## Feature Flag 控制

| 环境变量 | 默认 | 说明 |
|----------|------|------|
| `L3_DECISIONLOG_ENABLED` | true | Pipeline层面开关（Pipeline调用前检查） |

## 存储

| 文件 | 说明 |
|------|------|
| `decisions.jsonl` | 当前活跃日志 |
| `decisions.{timestamp}.jsonl` | 轮转归档（保留7天） |

自动轮转阈值：10MB

## 使用示例

```js
const { log, query, summarize, rotate } = require('./infrastructure/decision-log/decision-logger');

// 记录决策
log({
  phase: 'cognition',
  component: 'ISCRuleMatcher',
  what: 'Matched 3 rules for skill.created',
  why: 'Exact match on trigger.events',
  confidence: 1.0,
  decision_method: 'rule_match',
});

// 查询最近10条
const recent = query({ limit: 10, phase: 'execution' });

// 摘要
const stats = summarize({ since: '2026-03-01T00:00:00Z' });
```
