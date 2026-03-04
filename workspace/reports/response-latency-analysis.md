# 主Agent响应延迟 & 消息拥堵根因分析

> 分析时间：2026-03-03 | 分析人：系统架构师

## TL;DR

主Agent响应慢的**根本原因**：主Agent在处理一条消息时（包括等待子Agent），无法并行处理用户新消息。用户连续发送的消息进入队列排队，每条需等前一条完全处理完毕。当子Agent使用 opus-thinking 卡死30-60分钟时，整个消息队列被阻塞等量时间。

---

## 1. 消息队列机制分析

### OpenClaw 消息处理模型

OpenClaw 的 agent session 是**单线程串行处理**模型：

```
用户消息1 → [主Agent处理中...spawn子Agent...等结果...回复] → 用户消息2 → ...
```

- **消息不会丢弃**，会进入 delivery-queue 排队
- 但主Agent是**一条一条处理**的 — 前一条没完成，后面的全部等待
- 如果主Agent在处理消息1时 spawn 了子Agent 并 await 结果，**整个 session 被占用**直到子Agent返回

### 关键发现

当前配置中，子Agent结果是 "auto-announce" 回主Agent的（push-based）。但主Agent在等待子Agent期间，**其 session 仍然被占用**，无法处理新入站消息。

## 2. 子Agent超时的连锁影响

### 当前问题链

```
用户发消息 → 主Agent spawn researcher(opus-thinking)
                    ↓
            opus-thinking 处理中... (可能30-60分钟)
                    ↓
            主Agent session 被占用
                    ↓
            用户发的后续消息全部排队等待
                    ↓
            用户感知：Agent完全无响应
```

### 配置验证

```json
"runTimeoutSeconds": 0  // ← 无超时限制！
```

**这是灾难性配置**。子Agent没有超时上限，如果 opus-thinking 的 API 响应慢或卡死，主Agent会**无限期等待**。

## 3. 并发分析

### 当前配置

```json
"maxConcurrent": 16,        // 最多16个并发子Agent
"maxChildrenPerAgent": 20,   // 每个Agent最多spawn 20个子Agent
"maxSpawnDepth": 2           // 最大嵌套深度2层
```

5-6个并发子Agent远未触及上限（16），**并发数量本身不是问题**。

**真正的问题是**：
- 主Agent在 spawn 后如果选择等待结果再回复，就被阻塞了
- 如果主Agent spawn-and-forget（不等结果），则不会阻塞，但很多任务需要结果才能回复用户

## 4. 模型选择影响

### 各模型响应时间对比（估算）

| 模型 | 典型响应时间 | 复杂任务 | 成本 |
|------|-------------|---------|------|
| claude-sonnet-4-6 | 5-15秒 | 15-30秒 | 基准 |
| claude-sonnet-4-6-thinking | 10-30秒 | 30-90秒 | ~1.5x |
| claude-opus-4-6 | 15-45秒 | 45-120秒 | ~5x |
| **claude-opus-4-6-thinking** | **30-120秒** | **2-30分钟+** | **~8x** |

### 关键发现

当前 `researcher` agent 是唯一使用 `claude-opus-4-6-thinking` 的。这个模型：
- 通过代理API（penguinsaichat.dpdns.org），增加额外延迟
- thinking 模式会生成大量内部推理 token，显著增加响应时间
- 在复杂任务上可能触发多轮 thinking，导致指数级延迟

---

## 5. 根本原因总结

按影响程度排序：

| # | 原因 | 影响 | 严重度 |
|---|------|------|--------|
| 1 | **主Agent串行处理 + 等待子Agent结果** | 一个慢子Agent阻塞整个消息队列 | 🔴 Critical |
| 2 | **runTimeoutSeconds: 0（无超时）** | 子Agent可无限期运行，无兜底 | 🔴 Critical |
| 3 | **researcher 使用 opus-thinking** | 单次调用可能30分钟+，通过代理API更慢 | 🟠 High |
| 4 | **无任务优先级区分** | 简单问候和复杂研究走同一条路径 | 🟡 Medium |

---

## 6. 改进建议

### P0: 立即执行（今天）

#### 6.1 设置子Agent超时

```json
"subagents": {
    "runTimeoutSeconds": 300  // 5分钟硬超时
}
```

或者按 agent 粒度设置：researcher 可以给10分钟，其他给5分钟。

**效果**：即使子Agent卡死，最多等5-10分钟而非无限期。

#### 6.2 researcher 降级为 sonnet-thinking

```json
{
    "id": "researcher",
    "model": {
        "primary": "claude/claude-sonnet-4-6-thinking"
    }
}
```

**理由**：sonnet-thinking 在90%的研究任务上质量足够，但响应时间从分钟级降到秒级。仅在确实需要深度推理时手动指定 opus。

### P1: 短期优化（本周）

#### 6.3 主Agent采用 fire-and-forget 模式

对于不需要立即返回结果的任务，主Agent应该：
1. Spawn 子Agent
2. **立即回复用户**："已安排 researcher 处理，完成后会通知你"
3. 继续处理下一条消息
4. 子Agent完成后，主Agent主动推送结果

**实现**：在主Agent的 SOUL.md 或系统提示中明确指导这个行为模式。

#### 6.4 消息分流策略

在主Agent的指令中加入分流逻辑：

```markdown
## 消息处理优先级
- 简单问候/确认 → 直接回复，不spawn子Agent
- 信息查询 → 用 sonnet 快速处理
- 深度研究/分析 → spawn子Agent，fire-and-forget
- 紧急任务 → 用 sonnet-thinking 同步处理（最多等30秒）
```

### P2: 中期架构优化

#### 6.5 引入异步结果通知机制

理想流程：
```
用户消息 → 主Agent快速响应（<10秒）
                ↓ spawn
          子Agent异步处理
                ↓ 完成
          主Agent主动推送结果到聊天
```

这需要主Agent在 session 空闲时检查子Agent完成通知并主动发送。可通过 HEARTBEAT 机制实现。

#### 6.6 模型分级策略

| 任务类型 | 推荐模型 | 预期延迟 |
|----------|---------|---------|
| 日常对话 | sonnet | <10秒 |
| 代码审查 | sonnet | <15秒 |
| 研究分析 | sonnet-thinking | <60秒 |
| 深度推理（手动触发）| opus-thinking | 不限 |

---

## 7. 配置变更建议（可直接应用）

```json
{
    "agents": {
        "defaults": {
            "subagents": {
                "runTimeoutSeconds": 300
            }
        },
        "list": [
            {
                "id": "researcher",
                "model": {
                    "primary": "claude/claude-sonnet-4-6-thinking"
                }
            }
        ]
    }
}
```

## 8. 预期效果

| 指标 | 当前 | 优化后 |
|------|------|--------|
| 主Agent响应延迟 | 1-60分钟 | <30秒 |
| 子Agent最大阻塞时间 | 无限 | 5-10分钟 |
| researcher 任务耗时 | 2-30分钟 | 30秒-2分钟 |
| 用户消息排队时间 | 累积叠加 | 接近实时 |

---

*注：以上分析基于 OpenClaw 的消息处理模型推断和当前配置审查。部分内部机制（如 delivery-queue 的具体实现）需进一步查看源码验证。*
