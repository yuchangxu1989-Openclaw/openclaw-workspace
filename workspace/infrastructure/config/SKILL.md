# Feature Flags 统一配置

- **name**: feature-flags
- **description**: L3基础设施Feature Flag统一配置模块。三层优先级：环境变量 > flags.json配置文件 > 硬编码默认值。支持运行时热重载。
- **version**: 1.0.0

## 核心API

### `get(flagName) → any`
获取flag值。每次调用实时检查环境变量。

### `getAll() → object`
获取所有flag快照（含实时env覆盖）。

### `isEnabled(flagName) → boolean`
判断boolean flag是否启用。

### `reload() → {loaded: number, resolved: object}`
运行时重新加载flags.json（无需重启进程）。环境变量无需reload，get()已实时读取。

### `getDefaults() → object`
获取默认值表（只读副本）。

### `getLastLoadTime() → number`
获取上次加载时间戳。

### `getConfigPath() → string`
获取配置文件路径。

## 默认Flag值

| Flag | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `L3_PIPELINE_ENABLED` | boolean | false | Pipeline总开关 |
| `L3_EVENTBUS_ENABLED` | boolean | true | EventBus消费 |
| `L3_RULEMATCHER_ENABLED` | boolean | true | 规则匹配 |
| `L3_INTENTSCANNER_ENABLED` | boolean | true | 意图识别 |
| `L3_DISPATCHER_ENABLED` | boolean | true | 路由分发 |
| `L3_DECISIONLOG_ENABLED` | boolean | true | 审计日志 |
| `L3_CIRCUIT_BREAKER_DEPTH` | number | 5 | 断路器最大链深度 |

## 三层优先级

1. **环境变量**（最高）— 每次get()实时读取
2. **flags.json配置文件** — reload()时加载
3. **硬编码默认值**（最低）— DEFAULTS常量

## 依赖关系

```js
// 无外部模块依赖（纯fs操作）
```

## 事件

无。纯配置查询模块。

## Feature Flag 控制

本模块即为Feature Flag控制中心，不受其他flag控制。

## 文件结构

| 文件 | 说明 |
|------|------|
| `feature-flags.js` | 模块主文件 |
| `flags.json` | 配置文件（可选，不存在则用默认值） |

## 使用示例

```js
const flags = require('./infrastructure/config/feature-flags');

// 检查开关
if (flags.isEnabled('L3_PIPELINE_ENABLED')) {
  // 执行pipeline
}

// 获取数值型flag
const maxDepth = flags.get('L3_CIRCUIT_BREAKER_DEPTH'); // 5

// 查看所有flag
console.log(flags.getAll());

// 运行时热重载（修改flags.json后）
flags.reload();
```
