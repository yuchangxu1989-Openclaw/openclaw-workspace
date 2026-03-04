# Dispatcher 路由分发器

- **name**: dispatcher
- **description**: 执行层入口，规则匹配后将任务路由到对应handler执行。支持四级优先级路由、超时控制、重试+手动队列降级。
- **version**: 2.0.0

## 核心API

### `dispatch(rule, event, options?) → Promise<{success, result?, error?, handler, duration, retried}>`
核心分发函数。

| 参数 | 类型 | 说明 |
|------|------|------|
| `rule` | object | 匹配的规则，必须有`.action`字段 |
| `event` | object | 待处理事件 |
| `options.timeoutMs` | number | Handler超时，默认30000ms |
| `options.handlerMap` | Map | 预加载的handler映射 |
| `options.routes` | object | 路由配置对象 |

**执行流程**: Feature flag检查 → findRoute四级路由 → resolveHandler → 执行(重试1次) → 失败则enqueue到manual-queue.jsonl

### `loadHandlers() → Map<string, {handler, config, source}>`
从routes.json + handlers/目录加载handler映射。

### `resolveHandler(handlerName, handlerMap?) → Function | null`
解析handler函数。优先handlerMap，后备handlers/目录。

### `findRoute(action, routes) → {pattern, config} | null`
四级优先级路由匹配（带缓存）：exact > prefix > suffix > wildcard。

### `clearRouteCache()`
清除路由缓存。

### `reloadRoutes() → object`
强制重载routes.json。

### `withTimeout(fn, args, timeoutMs) → Promise`
超时包装器，支持同步/异步handler。

### `matchPattern(eventAction, pattern) → boolean`
模式匹配辅助函数。

## 依赖关系

```js
const _decisionLogger = require('../decision-log/decision-logger');  // 审计日志（可选）
// Handler加载: handlers/*.js (convention-based)
// 路由配置: routes.json
```

## 事件

### 写入
- 决策日志写入 `decision.log`（本地）+ DecisionLogger（跨模块，phase: `execution`）
- 失败任务写入 `manual-queue.jsonl`
- 无可执行handler时写入 `dispatched/*.json`（文件分发）

## Feature Flag 控制

| 环境变量 | 默认 | 说明 |
|----------|------|------|
| `DISPATCHER_ENABLED` | true | false时dispatch()跳过执行 |
| `L3_DISPATCHER_ENABLED` | true | Pipeline层面开关 |

## 文件结构

| 文件 | 说明 |
|------|------|
| `routes.json` | 路由配置：pattern → handler映射 |
| `handlers/*.js` | Convention-based handler目录 |
| `manual-queue.jsonl` | 失败任务手动处理队列 |
| `decision.log` | 本地决策日志 |
| `dispatched/*.json` | 文件级分发记录 |

## 使用示例

```js
const Dispatcher = require('./infrastructure/dispatcher/dispatcher');

// 分发规则
const result = await Dispatcher.dispatch(
  { action: 'isc.rule.updated', id: 'N001' },
  { type: 'isc.rule.updated', id: 'evt_001', payload: {} }
);
console.log(result.success, result.handler, result.duration);

// 查看路由
const route = Dispatcher.findRoute('isc.rule.updated', routes);
```
