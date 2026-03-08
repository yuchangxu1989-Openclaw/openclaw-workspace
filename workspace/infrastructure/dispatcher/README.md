# Event Dispatcher v2.0

执行层入口 —— 规则匹配后，将任务分发给对应的 handler 执行。

## 核心特性

| 特性 | 说明 |
|------|------|
| **四级优先级路由** | 精确匹配 > 前缀匹配 > 后缀匹配 > 全通配，编译缓存 |
| **Handler 加载** | routes.json 声明式 + handlers/ 目录约定式 |
| **超时控制** | 默认 30 秒，支持同步和异步 handler |
| **降级容错** | 失败自动重试 1 次 → 记录到人工队列 |
| **Feature Flag** | `DISPATCHER_ENABLED=false` 关闭执行，仅记录 |
| **Decision Log** | 完整分发记录（规则、handler、结果、耗时） |

## 使用方式

### 编程式调用

```javascript
const { dispatch, loadHandlers, reloadRoutes } = require('./dispatcher.js');

// 加载 handler 映射
const handlerMap = loadHandlers();

// 分发事件
const result = await dispatch(
  { action: 'isc.rule.created' },   // 匹配的规则
  { id: 'evt-001', type: 'isc.rule.created', data: {...} },  // 事件
  { handlerMap, timeoutMs: 10000 }   // 可选项
);

// result: { success, result?, error?, handler, duration, retried }
```

### CLI

```bash
node dispatcher.js                # 处理事件总线中的待处理事件
node dispatcher.js --dry-run      # 仅显示匹配结果，不执行
node dispatcher.js --status       # 显示 dispatcher 状态
node dispatcher.js --manual-queue # 查看人工队列
```

### 环境变量

```bash
DISPATCHER_ENABLED=false   # 关闭分发，事件仅记录不执行
```

## 路由优先级

```
Level 1: "system.error"      → 精确匹配（最高优先级）
Level 2: "isc.rule.*"        → 前缀匹配（长前缀优先）
Level 3: "*.completed"       → 后缀匹配（长后缀优先）
Level 4: "*"                 → 全通配（兜底）
```

首次匹配结果自动缓存，调用 `clearRouteCache()` 或 `reloadRoutes()` 刷新。

## Handler 编写

### 约定式加载

在 `handlers/` 目录下创建 JS 文件，文件名即为 handler 名：

```javascript
// handlers/my-handler.js
module.exports = function(event, context) {
  // context: { rule, route, handlerName, matchedPattern }
  return { processed: true };
};

// 也支持 async
module.exports = async function(event, context) {
  await doSomething();
  return { done: true };
};

// 也支持 { handle } 导出
module.exports = { handle: function(event, ctx) { ... } };
```

### routes.json 声明

```json
{
  "isc.rule.*": {
    "handler": "dto-sync",
    "agent": "coder",
    "priority": "high",
    "description": "ISC rule changes trigger 本地任务编排 alignment sync"
  }
}
```

## 容错机制

1. Handler 执行失败 → 自动重试 1 次
2. 重试仍失败 → 记录到 `manual-queue.jsonl`
3. Handler 不存在 → 写入 `dispatched/` 目录（文件式分发）
4. 无匹配路由 → 记录到人工队列

## 文件结构

```
dispatcher/
├── dispatcher.js           # 核心分发器
├── dispatcher.test.js      # 测试（61 个断言）
├── routes.json             # 路由表
├── handlers/               # 约定式 handler 目录
│   └── echo.js             # 示例 handler
├── dispatched/             # 文件式分发记录
├── manual-queue.jsonl      # 人工处理队列
├── decision.log            # 分发决策日志
└── fast-check.js           # 快速预检（事件总线空闲时跳过）
```

## 测试

```bash
node dispatcher.test.js
# Results: 61/61 passed, 0 failed
# ✅ All tests passed!
```
