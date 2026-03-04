# ISC RuleMatcher 规则匹配引擎

- **name**: isc-rule-matcher
- **description**: ISC认知层核心规则匹配引擎。事件进来→匹配触发规则→评估条件→输出决策。支持四级匹配优先级和条件求值。
- **version**: 1.0.0

## 核心API

### `new ISCRuleMatcher(options?)`

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `options.rulesDir` | string | `skills/isc-core/rules` | 规则JSON目录 |
| `options.hotReload` | boolean | true | 启用目录变更热重载 |
| `options.hotReloadIntervalMs` | number | 5000 | 热重载检查间隔(ms) |
| `options.maxDecisionLog` | number | 500 | 内存决策日志上限 |

### `matcher.loadRules() → {total, indexed, errors}`
加载规则目录下所有JSON文件并构建索引。

### `matcher.match(event) → Array<{rule, priority, match_type, pattern}>`
匹配事件，返回候选规则列表（按优先级排序）。四级优先级：exact(4) > prefix(3) > suffix(2) > wildcard(1)。

### `matcher.evaluate(rule, event) → {shouldFire, reason}`
评估规则条件是否满足。支持比较运算符(`>=`,`<=`,`>`,`<`,`==`,`!=`)、布尔操作(`AND`,`OR`,`NOT`)。

### `matcher.process(event) → Array<{rule, priority, match_type, pattern, evaluation}>`
完整管线：match + evaluate，仅返回shouldFire=true的规则。

### `matcher.reload() → {total, indexed, errors}`
强制重新加载规则。

### `matcher.explain(eventType) → Array`
调试用：查看某事件类型会触发哪些规则（不含条件评估）。

### `matcher.stats() → object`
引擎统计：规则数、各类型pattern数、decisionLog大小等。

### `matcher.destroy()`
停止热重载定时器，清理资源。

### `getDefaultMatcher(options?) → ISCRuleMatcher`
获取/创建默认单例实例。

## 依赖关系

```js
const _decisionLogger = require('../decision-log/decision-logger');  // 审计日志（可选）
```

规则文件目录默认: `skills/isc-core/rules/*.json`

## 事件

### Listen（间接）
- 通过Pipeline接收所有EventBus事件进行规则匹配

### 写入
- 匹配决策写入DecisionLogger（phase: `cognition`, component: `ISCRuleMatcher`）

## Feature Flag 控制

| 环境变量 | 默认 | 说明 |
|----------|------|------|
| `L3_RULEMATCHER_ENABLED` | true | Pipeline中规则匹配开关 |

## 使用示例

```js
const { ISCRuleMatcher, getDefaultMatcher } = require('./infrastructure/rule-engine/isc-rule-matcher');

// 单例模式
const matcher = getDefaultMatcher();
const matches = matcher.process({ type: 'skill.created', payload: { name: 'weather' } });

// 调试
const candidates = matcher.explain('isc.rule.updated');
console.log(matcher.stats());
```
