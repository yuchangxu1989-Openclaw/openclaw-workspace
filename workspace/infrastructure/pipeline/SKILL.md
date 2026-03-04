# L3 Pipeline 编排器

- **name**: l3-pipeline
- **description**: L3闭环流水线编排器，将EventBus、RuleMatcher、IntentScanner、Dispatcher串成闭环执行链
- **version**: 1.0.0

## 核心API

### `new L3Pipeline(options?)`
构造函数。

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `options.windowMs` | number | 300000 | 消费事件的时间窗口(ms) |
| `options.maxChainDepth` | number | 5 | 断路器最大链深度 |
| `options.timeoutMs` | number | 0 | run()整体超时(ms)，0=不限时 |
| `options.matcherOptions` | object | {} | ISCRuleMatcher构造参数 |
| `options.scannerOptions` | object | {} | IntentScanner构造参数 |

### `pipeline.run() → Promise<object>`
单次闭环执行。流程：
1. 检查总开关
2. EventBus.consume获取最近windowMs的事件
3. 对每个事件：断路器检查 → RuleMatcher匹配 → IntentScanner识别(对话类) → Dispatcher执行
4. 输出执行摘要，写run-log.jsonl

返回执行摘要对象：
```js
{
  run_id, timestamp, consumed_events, matched_rules,
  intents_detected, dispatched_actions, circuit_breaks,
  errors, duration_ms, feature_flags, skipped?, reason?
}
```

### `runOnce(options?) → Promise<object>`
便捷函数：创建默认实例并执行一次。

## 依赖关系

```js
const EventBus = require('../event-bus/bus-adapter');
const { ISCRuleMatcher, getDefaultMatcher } = require('../rule-engine/isc-rule-matcher');
const { IntentScanner } = require('../intent-engine/intent-scanner');
const Dispatcher = require('../dispatcher/dispatcher');
const { log: decisionLog } = require('../decision-log/decision-logger');
```

## 事件

### Emit
- `user.intent.{intent_name}.inferred` — IntentScanner识别到意图后emit回EventBus（闭环），携带`chain_depth + 1`

### Listen
- 通过EventBus.consume消费所有类型事件（windowMs时间窗口内）

## Feature Flag 控制

| 环境变量 | 默认 | 说明 |
|----------|------|------|
| `L3_PIPELINE_ENABLED` | true | 总开关，false时run()直接skip |
| `L3_EVENTBUS_ENABLED` | true | EventBus消费开关 |
| `L3_RULEMATCHER_ENABLED` | true | 规则匹配开关 |
| `L3_INTENTSCANNER_ENABLED` | true | 意图识别开关 |
| `L3_DISPATCHER_ENABLED` | true | 分发执行开关 |
| `L3_DECISIONLOG_ENABLED` | true | 审计日志开关 |

## 使用示例

```js
const { L3Pipeline, runOnce } = require('./infrastructure/pipeline/l3-pipeline');

// 方式1：快捷执行
const summary = await runOnce({ windowMs: 60000 });
console.log(`处理了 ${summary.consumed_events} 个事件`);

// 方式2：自定义实例
const pipeline = new L3Pipeline({ maxChainDepth: 3, timeoutMs: 10000 });
const result = await pipeline.run();
```
