# OpenClaw Plugin SDK 开发参考

> 基于多次源码研究的实证结论，供子Agent开发插件时直接参考，跳过研究阶段。

---

## 一、插件位置与注册

### 插件目录
- 内置插件：`/root/.openclaw/extensions/<plugin-name>/`（如 memos-local-openclaw-plugin）
- 自定义插件：`/root/.openclaw/workspace/plugins/<plugin-name>/` 或 `/root/.openclaw/extensions/<plugin-name>/`

### openclaw.json 注册
```json
{
  "plugins": {
    "enabled": true,
    "entries": {
      "<plugin-name>": {
        "enabled": true
      }
    }
  }
}
```
文件位置：`/root/.openclaw/openclaw.json`（注意：不是workspace下的）

---

## 二、插件结构

### 标准模式（参考 memos-local-openclaw-plugin）
```javascript
// index.js (CommonJS) 或 index.ts (ESM)
const plugin = {
  id: "my-plugin",
  name: "My Plugin",
  description: "描述",
  register(api) {
    // api 是 OpenClawPluginApi 实例
    api.registerTool({ ... });
    api.on("before_agent_start", async (event) => { ... });
    api.registerService({ ... });
  }
};
module.exports = plugin;
// 或 export default plugin;
```

---

## 三、API 接口

### api 对象可用方法
| 方法 | 用途 |
|------|------|
| `api.registerTool(toolDef)` | 注册自定义工具 |
| `api.on(hookName, handler)` | 注册hook |
| `api.registerService(serviceDef)` | 注册生命周期服务 |
| `api.logger.info/warn/error(msg)` | 日志 |
| `api.pluginConfig` | 读取插件配置 |
| `api.resolvePath(path)` | 解析路径（支持 `~/.openclaw`） |

### registerTool 签名（⚠️ 关键：不是 parameters/execute）
```javascript
api.registerTool({
  name: "tool_name",
  description: "工具描述",
  inputSchema: {
    type: "object",
    properties: {
      param1: { type: "string", description: "参数1" },
      param2: { type: "string", description: "参数2" }
    },
    required: ["param1"]
  },
  handler: async (params, ctx) => {
    // params = 用户传入的参数
    // ctx = 运行时上下文，包含 ctx.runtime
    // 返回值会作为 tool result 返回给 LLM
    return { status: "ok", data: "..." };
  }
});
```

**⚠️ 常见错误**：用 `parameters` + `execute` 而不是 `inputSchema` + `handler`。

---

## 四、Hook 接口

### before_agent_start（每轮对话开始前）
```javascript
api.on("before_agent_start", async (event, ctx) => {
  // event: { prompt?: string, messages?: unknown[], agentId?: string }
  // 返回值可以注入/替换 system prompt
  return {
    systemPrompt: "追加到system prompt的内容"
    // 或 prependContext: "注入到用户消息前的内容"
  };
});
```

### before_tool_call（工具调用前）
```javascript
api.on("before_tool_call", async (event, ctx) => {
  // event: { toolName, params, runId, toolCallId }
  // ctx: { agentId, sessionKey, sessionId, runId, toolName, toolCallId }
  return {
    params: event.params,  // 可修改参数
    block: false,          // true = 阻断
    blockReason: ""        // 阻断原因（LLM收到的是 Error(reason)）
  };
});
```

### agent_end（对话结束后）
```javascript
api.on("agent_end", async (event) => {
  // 清理、统计等
});
```

---

## 五、Runtime 能力

### ctx.runtime 结构
```javascript
{
  version: "...",
  config: { loadConfig() },
  system: {
    runCommandWithTimeout(cmd, opts),
    enqueueSystemEvent(event),
    spawnSubagent(params)  // ⚠️ 需验证是否可用
  },
  media: { ... },
  tts: { textToSpeechTelephony },
  stt: { transcribeAudioFile },
  tools: { createMemoryGetTool, createMemorySearchTool },
  channel: { ... },
  events: { ... },
  logging: { ... },
  state: { resolveStateDir }
}
```

### 子Agent派发
Plugin runtime 的 `ctx.runtime.system.spawnSubagent` 可能可用于派发子Agent。
如果不可用，替代方案：通过 gateway HTTP API 调用 spawn。

---

## 六、现有插件参考

### memos-local-openclaw-plugin
- 位置：`/root/.openclaw/extensions/memos-local-openclaw-plugin/`
- 语言：TypeScript (index.ts)
- 注册了 10+ 个 tool（memory_search, memory_get 等）
- 使用 `api.on("before_agent_start")` 注入记忆上下文
- 使用 `api.registerService()` 管理生命周期

### feishu（内置）
- 飞书通道插件
- 在 openclaw.json 的 plugins.entries 中注册

---

## 七、开发注意事项

1. **路径**：插件代码中用绝对路径或 `api.resolvePath()`，不要假设 cwd
2. **容错**：文件读取必须 try-catch，文件可能不存在
3. **缓存**：频繁读取的文件（如 CAPABILITY-ANCHOR.md）应缓存，用 mtime 判断是否需要刷新
4. **不要改 openclaw.json 的非 plugins 部分**
5. **禁止 `openclaw doctor --fix`**
6. **改完必须 git add + commit + push**（在 /root/.openclaw/workspace 下）
