# Parallel Subagent（并行子代理执行）

发布级（publishable）并行子任务编排技能，提供**通用接口**，不绑定 OpenClaw 内部扩展路径。

## 设计原则

- ✅ 不使用 `../../../../../.openclaw/extensions/...` 之类内部路径
- ✅ `sessions` 能力采用**可选依赖 + 动态加载**
- ✅ 支持外部注入 API，便于在任意宿主复用

## 接口

```js
const { createParallelSubagentExecutor } = require('./index');

const executor = createParallelSubagentExecutor({
  // 推荐：显式注入
  sessionsApi: {
    sessions_spawn: async (payload) => ({ ok: true, payload })
  }
});

const out = await executor.runParallel([
  { task: 'A' },
  { task: 'B' }
], { concurrency: 2 });
```

### `createParallelSubagentExecutor(options)`

- `options.sessionsApi`：推荐，注入对象且必须包含 `sessions_spawn` 函数
- `options.sessionsModule`：可选，指定模块名/路径（需导出 `sessions_spawn`）
- 环境变量：`OPENCLAW_SESSIONS_MODULE`（当未传 `sessionsModule` 时生效）

### `executor.runParallel(tasks, runtimeOptions)`

- `tasks`：数组，元素可为字符串（会映射为 `{ task: string }`）或对象（直接传给 `sessions_spawn`）
- `runtimeOptions.concurrency`：并发数，默认 `5`

返回：

```json
{
  "ok": true,
  "total": 2,
  "success": 2,
  "failed": 0,
  "results": []
}
```

## 依赖要求

本技能**不强制内置 OpenClaw 依赖**。

你可以选择其一：

1. 在运行时注入 `sessionsApi`
2. 安装并通过模块名加载（例如 `openclaw-sessions`）
3. 通过 `OPENCLAW_SESSIONS_MODULE` 指向自定义实现

当 sessions API 不可用时，会抛出错误码：`SESSIONS_API_UNAVAILABLE`。
