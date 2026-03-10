# ACP (Agent Communication Protocol) 配置指南

> 基于 OpenClaw 官方文档整理，来源：`/usr/lib/node_modules/openclaw/docs/`

---

## 1. 什么是 ACP

ACP（Agent Client Protocol）是 OpenClaw 运行外部编码代理（harness）的协议层。通过 ACP，OpenClaw 可以驱动 **Codex、Claude Code、Gemini CLI、OpenCode、Pi、Kimi** 等外部 coding agent，而不是使用 OpenClaw 内置的 sub-agent 运行时。

ACP 有两种使用场景：
- **IDE 集成**：通过 `openclaw acp` 命令，让 Zed 等 IDE 通过 stdio 与 OpenClaw Gateway 通信
- **Chat 驱动**：在聊天中通过自然语言或 `/acp` 命令启动外部 coding agent 会话

---

## 2. openclaw.json 中的 ACP 配置

### 2.1 核心 ACP 配置块

```json5
{
  acp: {
    enabled: true,                    // 全局开关
    dispatch: { enabled: true },      // 是否允许从普通消息触发 ACP（默认 true）
    backend: "acpx",                  // 后端插件名称
    defaultAgent: "codex",            // 默认 harness agent（省略 agentId 时使用）
    allowedAgents: ["pi", "claude", "codex", "opencode", "gemini", "kimi"],  // 允许的 agent 白名单
    maxConcurrentSessions: 8,         // 最大并发 ACP 会话数
    stream: {
      coalesceIdleMs: 300,            // 流式输出合并空闲时间
      maxChunkChars: 1200,            // 流式输出单块最大字符数
    },
    runtime: {
      ttlMinutes: 120,                // 会话存活时间
    },
  },
}
```

### 2.2 acpx 后端插件安装与配置

```bash
# 安装插件
openclaw plugins install acpx
openclaw config set plugins.entries.acpx.enabled true

# 验证后端健康状态
# 在聊天中执行：/acp doctor
```

**插件配置选项：**

```json5
{
  plugins: {
    entries: {
      acpx: {
        enabled: true,
        config: {
          command: "extensions/acpx/node_modules/.bin/acpx",  // 可自定义路径
          expectedVersion: "any",   // "any" 禁用严格版本匹配
          permissionMode: "approve-all",          // approve-all | approve-reads | deny-all
          nonInteractivePermissions: "fail",      // fail | deny
        },
      },
    },
  },
}
```

**权限模式说明（重要）：**

| permissionMode | 行为 |
|---|---|
| `approve-all` | 自动批准所有文件写入和 shell 命令 |
| `approve-reads` | 仅批准读取，写入/执行需要提示（**默认值**） |
| `deny-all` | 拒绝所有权限提示 |

> ⚠️ ACP 会话是非交互式的（无 TTY），默认的 `approve-reads` + `nonInteractivePermissions=fail` 会导致写入操作失败。**生产环境建议设置 `permissionMode=approve-all`**，或将 `nonInteractivePermissions` 设为 `deny` 以实现优雅降级。

### 2.3 线程绑定配置（可选，Discord 等支持线程的渠道）

```json5
{
  session: {
    threadBindings: {
      enabled: true,
      idleHours: 24,
      maxAgeHours: 0,
    },
  },
  channels: {
    discord: {
      threadBindings: {
        enabled: true,
        spawnAcpSessions: true,   // 允许 ACP 会话自动创建/绑定线程
      },
    },
  },
}
```

---

## 3. Codex Agent 标准配置模板

### 3.1 最小可用配置

```json5
{
  // ACP 核心
  acp: {
    enabled: true,
    backend: "acpx",
    defaultAgent: "codex",
    allowedAgents: ["codex"],
  },

  // acpx 插件
  plugins: {
    entries: {
      acpx: {
        enabled: true,
        config: {
          permissionMode: "approve-all",
          nonInteractivePermissions: "deny",
        },
      },
    },
  },
}
```

### 3.2 完整生产配置（含多 agent + Discord 线程绑定）

```json5
{
  acp: {
    enabled: true,
    dispatch: { enabled: true },
    backend: "acpx",
    defaultAgent: "codex",
    allowedAgents: ["pi", "claude", "codex", "opencode", "gemini", "kimi"],
    maxConcurrentSessions: 8,
    stream: {
      coalesceIdleMs: 300,
      maxChunkChars: 1200,
    },
    runtime: {
      ttlMinutes: 120,
    },
  },

  plugins: {
    entries: {
      acpx: {
        enabled: true,
        config: {
          permissionMode: "approve-all",
          nonInteractivePermissions: "deny",
        },
      },
    },
  },

  session: {
    threadBindings: {
      enabled: true,
      idleHours: 24,
      maxAgeHours: 0,
    },
  },

  channels: {
    discord: {
      threadBindings: {
        enabled: true,
        spawnAcpSessions: true,
      },
    },
  },
}
```

### 3.3 使用方式

**通过 `sessions_spawn` 工具调用：**

```json
{
  "task": "打开仓库并修复失败的测试",
  "runtime": "acp",
  "agentId": "codex",
  "thread": true,
  "mode": "session"
}
```

**通过聊天命令：**

```
/acp spawn codex --mode persistent --thread auto
/acp spawn codex --mode oneshot --thread off
```

**通过自然语言：**

> "用 Codex 在线程里帮我看看这个项目的测试为什么挂了"

---

## 4. ACP vs Sub-agent：区别与适用场景

### 4.1 核心区别

| 维度 | ACP 会话 | Sub-agent |
|---|---|---|
| **运行时** | 外部 harness 进程（acpx 插件驱动） | OpenClaw 原生 agent 运行时 |
| **Session Key** | `agent:<agentId>:acp:<uuid>` | `agent:<agentId>:subagent:<uuid>` |
| **管理命令** | `/acp ...` | `/subagents ...` |
| **Spawn 工具** | `sessions_spawn` + `runtime: "acp"` | `sessions_spawn`（默认 runtime） |
| **运行环境** | **宿主机**（不在沙箱内） | 可选沙箱隔离 |
| **工具能力** | 由外部 harness 自带（如 Codex 的文件/shell 工具） | 继承 OpenClaw 工具集（可配置） |
| **权限模型** | 通过 `permissionMode` 统一控制 | 通过 `tools.allow/deny` 精细控制 |
| **持久会话** | 支持 `mode: "session"` + 线程绑定 | 支持 `mode: "session"` + 线程绑定 |
| **嵌套** | 不支持嵌套 | 支持 2 层嵌套（`maxSpawnDepth: 2`） |

### 4.2 适用场景决策

**选择 ACP 当：**
- 需要使用特定的外部编码工具（Codex / Claude Code / Gemini CLI）
- 任务需要外部 agent 的专有能力（如 Codex 的代码生成优化）
- 希望利用外部 agent 自带的文件系统和 shell 工具
- 在 IDE 中集成 OpenClaw

**选择 Sub-agent 当：**
- 需要沙箱隔离（ACP 不支持沙箱）
- 需要精细的工具权限控制
- 需要多层嵌套的编排模式（orchestrator → workers）
- 从已沙箱化的会话中 spawn（ACP 会被阻止）
- 需要 OpenClaw 原生工具（browser、canvas、nodes 等）
- 简单的并行任务分发

### 4.3 限制与注意事项

**ACP 限制：**
- 沙箱化会话**不能** spawn ACP 会话（因为 ACP 运行在宿主机上）
- `sessions_spawn` 的 `sandbox: "require"` 与 `runtime: "acp"` 不兼容
- ACP 会话运行在宿主机，存在安全边界考量

**Sub-agent 限制：**
- 默认不能 spawn 子 agent（需要 `maxSpawnDepth >= 2`）
- 结果通告是尽力而为（Gateway 重启会丢失未完成的通告）
- 共享 Gateway 进程资源

---

## 5. 快速部署清单

1. **安装 acpx 插件**
   ```bash
   openclaw plugins install acpx
   ```

2. **配置 openclaw.json**（参考上面的模板）

3. **重启 Gateway**
   ```bash
   openclaw gateway restart
   ```

4. **验证**
   ```
   /acp doctor
   /acp status
   ```

5. **测试 spawn**
   ```
   /acp spawn codex --mode oneshot --thread off
   ```

---

## 6. 常见问题排查

| 症状 | 原因 | 修复 |
|---|---|---|
| `ACP runtime backend is not configured` | 插件未安装或未启用 | `openclaw plugins install acpx` + 启用 |
| `ACP is disabled by policy` | `acp.enabled=false` | 设置为 `true` |
| `ACP agent "xxx" is not allowed` | 不在白名单中 | 更新 `acp.allowedAgents` |
| `Permission prompt unavailable` | 权限模式阻止了非交互操作 | 设置 `permissionMode=approve-all` |
| `Sandboxed sessions cannot spawn ACP` | 从沙箱会话触发 ACP | 改用 `runtime="subagent"` 或从非沙箱会话操作 |

---

*文档来源：`/usr/lib/node_modules/openclaw/docs/tools/acp-agents.md`、`/usr/lib/node_modules/openclaw/docs/cli/acp.md`、`/usr/lib/node_modules/openclaw/docs/tools/subagents.md`、`/usr/lib/node_modules/openclaw/docs/gateway/configuration-reference.md`*
