# Boom渠道 gpt-5.3-codex 可用性 + Failover机制诊断

**日期**: 2026-03-10 14:51 CST  
**诊断人**: researcher subagent

---

## 问题1：boom渠道 gpt-5.3-codex 是否可用？

### 测试结果

#### 1.1 /v1/models 接口

**结果: ✅ 模型在列表中存在**

```json
{
  "data": [
    {"id": "gpt-5.4", "object": "model", "owned_by": "custom"},
    {"id": "gpt-5.3-codex", "object": "model", "owned_by": "codex"}
  ],
  "object": "list",
  "success": true
}
```

HTTP状态码: 200

#### 1.2 /v1/chat/completions 接口

**结果: ❌ 调用失败，HTTP 400**

```json
{
  "error": {
    "message": "{\"detail\":\"The 'gpt-5.3-codex' model is not supported when using Codex with a ChatGPT account.\"}（traceid: 86b8dfb343689b1838e1ea4bc48b74c8）",
    "type": "invalid_request_error",
    "param": "",
    "code": null
  }
}
```

HTTP状态码: 400

#### 1.3 结论

boom渠道的 gpt-5.3-codex **模型存在于列表中但实际不可用**。上游返回400错误，提示该模型不支持通过ChatGPT账户使用Codex。这是一个**上游账户权限/订阅问题**，不是OpenClaw配置问题。

boom渠道的API Key通过ChatGPT账户转发，而gpt-5.3-codex需要API平台（非ChatGPT）的访问权限。

---

## 问题2：OpenClaw的Failover机制是否工作？

### 2.1 Reviewer Agent配置

```json
{
  "id": "reviewer",
  "model": {
    "primary": "boom-reviewer/gpt-5.3-codex",
    "fallbacks": [
      "claude-reviewer/claude-opus-4-6-thinking",
      "zhipu-reviewer/glm-5"
    ]
  }
}
```

Fallback链: boom-reviewer/gpt-5.3-codex → claude-reviewer/claude-opus-4-6-thinking → zhipu-reviewer/glm-5

### 2.2 Failover源码分析

核心文件: `pi-embedded-DgYXShcG.js`

**关键函数调用链:**

1. `runWithModelFallback()` (L35896) — 主调度循环，遍历 primary + fallbacks
2. `coerceToFailoverError()` (L35673) — 将普通错误转换为 FailoverError
3. `resolveFailoverReasonFromError()` (L35629) — 根据HTTP状态码分类错误原因
4. `isFailoverError()` (L35572) — 判断是否为可failover的错误

**`resolveFailoverReasonFromError` 中的状态码映射:**

| HTTP状态码 | Failover原因 | 是否触发Fallback |
|-----------|-------------|----------------|
| 400 | `"format"` | ✅ 是 |
| 401 | `"auth"` | ✅ 是 |
| 402 | `"billing"` | ✅ 是 |
| 403 | `"auth_permanent"` | ✅ 是 |
| 408 | `"timeout"` | ✅ 是 |
| 429 | `"rate_limit"` | ✅ 是 |
| 502/503/504 | `"timeout"` | ✅ 是 |
| 529 | `"rate_limit"` | ✅ 是 |
| 网络错误 (ETIMEDOUT等) | `"timeout"` | ✅ 是 |

**唯一不触发fallback的例外:** `isLikelyContextOverflowError` — 如果错误消息匹配上下文窗口溢出模式，会直接 `throw` 跳过fallback。

### 2.3 400错误是否触发Fallback？

**✅ 是的，400错误会触发fallback。**

代码路径:
```
runWithModelFallback() 
  → runFallbackAttempt() 抛出错误
  → isLikelyContextOverflowError() 检查 → 不匹配（boom的错误消息不是上下文溢出）
  → coerceToFailoverError() → status=400 → reason="format" → 返回 FailoverError
  → isKnownFailover = true
  → 记录attempt，继续下一个candidate
  → 尝试 claude-reviewer/claude-opus-4-6-thinking
  → 如果也失败，尝试 zhipu-reviewer/glm-5
```

boom返回的错误消息 `"The 'gpt-5.3-codex' model is not supported when using Codex with a ChatGPT account."` **不会**被 `isLikelyContextOverflowError` 拦截，因此会正常进入fallback流程。

### 2.4 Gateway日志

日志目录 `/root/.openclaw/logs/` 中仅有 `config-audit.jsonl`，无运行时日志文件。Gateway可能未配置文件日志输出，或日志已被轮转清理。

### 2.5 retryOn配置（ACP/Cron层面）

ACP retry配置schema支持以下重试触发条件:
- `rate_limit`
- `network`
- `timeout`
- `server_error`

注意：这是ACP层面的retry，与模型fallback是**两个独立机制**。模型fallback在 `runWithModelFallback` 中处理，覆盖范围更广（包括400）。

---

## 综合结论

### boom渠道 gpt-5.3-codex

**不可用。** 上游boom渠道通过ChatGPT账户转发，而gpt-5.3-codex需要OpenAI API平台权限。模型在 `/v1/models` 列表中存在但调用时返回400。这是一个**持久性错误**，不会自行恢复。

### Failover机制

**工作正常。** OpenClaw的failover机制会在400错误时触发，reason归类为 `"format"`。当boom-reviewer/gpt-5.3-codex返回400时：
1. 错误被 `coerceToFailoverError` 转换为 `FailoverError(reason="format")`
2. 系统自动尝试第一个fallback: `claude-reviewer/claude-opus-4-6-thinking`
3. 如果claude也失败，继续尝试: `zhipu-reviewer/glm-5`

**但存在效率问题:** 每次reviewer被调用时，都会先尝试boom（必定失败），浪费一次API调用和延迟，然后才fallback到claude。

---

## 修复建议

### 短期（立即）

无需修改。Failover机制已经在正常工作，reviewer会自动fallback到claude-opus-4-6-thinking。用户体验上只是多了几秒延迟。

### 中期（推荐）

**方案A: 调整reviewer的primary为可用模型**

将reviewer的model配置改为:
```json
{
  "primary": "claude-reviewer/claude-opus-4-6-thinking",
  "fallbacks": ["zhipu-reviewer/glm-5", "boom-reviewer/gpt-5.3-codex"]
}
```

这样避免每次都先尝试一个必定失败的模型。

**方案B: 对所有使用boom/gpt-5.3-codex作为primary的agent做同样调整**

配置中有多个agent使用 `boom-*/gpt-5.3-codex` 作为primary（main, researcher, coder, reviewer, analyst, scout, 以及所有worker）。如果boom渠道的codex持续不可用，建议批量将primary切换为claude或zhipu。

### 长期

联系boom渠道提供商，确认gpt-5.3-codex是否需要升级账户类型（从ChatGPT账户升级到API平台账户），或者该模型是否已被下线。

---

## 附录：OpenClaw特殊处理 — resolveOpenAICodexGpt53FallbackModel

源码中存在 `resolveOpenAICodexGpt53FallbackModel` 函数（L1708），当provider匹配特定条件且model为 `gpt-5.3-codex` 时，会尝试将API切换为 `openai-codex-responses`（baseUrl: `https://chatgpt.com/backend-api`）。这表明OpenClaw对codex模型有特殊的API路由逻辑，但这仅适用于直连OpenAI的场景，不适用于boom这样的第三方转发渠道。
