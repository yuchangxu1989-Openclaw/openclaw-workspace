# 上下文膨胀分析报告

> 日期：2026-03-11 | 分析对象：主Agent (main) session `23f88a94`
> 当前状态：160k/200k tokens，21次compaction，响应明显变慢

---

## 一、问题定量分析

### 1.1 Session文件概况

| 指标 | 数值 |
|------|------|
| Session文件大小 | 6.22 MB |
| 总行数 | 2,142 |
| 消息条目 | 2,117 条 |
| Compaction次数 | 20 次（sessions.json记录21次） |
| Session创建时间 | 2026-03-09 20:04 UTC |
| 上下文窗口 | 200,000 tokens (DEFAULT_CONTEXT_TOKENS) |

### 1.2 消息内容占比

| 角色 | 条数 | 大小 | 占比 | 最大单条 |
|------|------|------|------|----------|
| **toolResult** | 717 | 4,390 KB | **71.5%** | 151.9 KB |
| assistant | 1,098 | 1,267 KB | 20.6% | 28.6 KB |
| user | 304 | 480 KB | 7.8% | 13.9 KB |

**核心发现：工具调用结果占据71.5%的session空间。**

### 1.3 大型工具结果 Top 10

| 排名 | 大小 | 内容类型 |
|------|------|----------|
| #1 | 151.9 KB | 图片读取 (image/jpeg) |
| #2 | 120.1 KB | sessions_list（23个session的完整信息） |
| #3 | 114.7 KB | 图片读取 (image/jpeg) |
| #4 | 100.6 KB | 图片读取 (image/jpeg) |
| #5 | 96.2 KB | 图片读取 (image/jpeg) |
| #6 | 82.0 KB | 图片读取 (image/jpeg) |
| #7 | 76.9 KB | 大型JSON事件数据 |
| #8 | 60.8 KB | web_fetch（GitHub README） |
| #9 | 51.3 KB | embedding向量数据（原始浮点数组） |
| #10 | 37.5 KB | 飞书文档读取 |

**图片数据是最大的单项贡献者**——5张图片合计545KB。

### 1.4 Compaction摘要增长趋势

```
Compaction #1  (01:00): tokensBefore=180,662  summaryLen=5,576 chars
Compaction #5  (01:58): tokensBefore=187,568  summaryLen=9,216 chars
Compaction #10 (04:10): tokensBefore=180,950  summaryLen=12,984 chars
Compaction #12 (05:46): tokensBefore=192,616  summaryLen=1,465 chars  ← 重置（可能是新话题）
Compaction #15 (09:09): tokensBefore=183,141  summaryLen=12,252 chars
Compaction #20 (15:40): tokensBefore=184,851  summaryLen=18,727 chars
```

**关键发现：**
- compaction摘要从5.5KB单调增长到18.7KB（3.4倍膨胀）
- 每次compaction前的token数稳定在180k-195k之间，说明compaction触发阈值约为180k
- 摘要本身在不断累积历史上下文，形成"摘要套摘要"的雪球效应
- 第12次compaction出现了一次重置（1.4KB），可能是话题切换导致

### 1.5 系统提示注入内容分析

#### 固定注入的Workspace文件（每次对话都加载）

| 文件 | 大小 | 说明 |
|------|------|------|
| MEMORY.md | 24.5 KB | **最大** — 长期记忆 |
| AGENTS.md | 19.8 KB | Agent行为规范 |
| SOUL.md | 12.1 KB | 灵魂/人格定义 |
| CAPABILITY-ANCHOR.md | 9.5 KB | 能力锚点 |
| CONFIG-QUICK-REFERENCE.md | 6.8 KB | 配置参考 |
| CRITICAL_ENFORCEMENT_RULES.md | 4.1 KB | 强制规则 |
| TOOLS.md | 3.0 KB | 工具笔记 |
| HEARTBEAT.md | 2.9 KB | 心跳配置 |
| USER.md | 2.9 KB | 用户信息 |
| DELIVERY-PHASE3-1.md | 2.8 KB | 交付阶段文档 |
| PROJECT-TRACKER.md | 1.7 KB | 项目跟踪 |
| BOOTSTRAP.md | 1.5 KB | 引导文件 |
| CRITICAL-MEMORY.md | 1.2 KB | 关键记忆 |
| IDENTITY.md | 0.6 KB | 身份定义 |
| **合计** | **~93 KB** | **≈23,000 tokens** |

注意：主session还会加载 `MEMORY.md`（24.5KB），子agent不加载。

#### Skills列表注入

- 45个skill的描述列表：11.5 KB（≈2,900 tokens）
- 这些只是skill名称和描述，不含SKILL.md内容

#### 系统提示总估算

| 组成部分 | 估算tokens |
|----------|-----------|
| OpenClaw核心系统提示（角色、规则、工具说明） | ~8,000 |
| Workspace文件注入 | ~23,000 |
| Skills列表 | ~2,900 |
| 工具Schema定义 | ~5,000 |
| **系统提示总计** | **~39,000 tokens** |

**系统提示占据了200k窗口的约20%，这是不可压缩的固定开销。**

---

## 二、Compaction机制分析

### 2.1 工作原理

通过源码分析，OpenClaw的compaction机制如下：

1. **触发条件**：当上下文tokens接近 `contextTokens`（默认200k）时触发
2. **保留策略**：
   - `reserveTokens`：为新对话保留的token数（默认floor=20,000）
   - `keepRecentTokens`：保留最近N个tokens的消息不被压缩
3. **压缩方式**：将旧消息压缩为一个summary，保留最近的消息
4. **配置路径**：`agents.defaults.compaction.reserveTokens` / `keepRecentTokens`

### 2.2 Compaction的问题

1. **摘要雪球效应**：每次compaction的summary包含之前的summary内容，导致summary从5KB增长到18KB
2. **大型工具结果无法有效压缩**：图片base64、embedding向量等大块数据在被compaction前已经消耗了大量tokens
3. **固定开销不可压缩**：39k tokens的系统提示每次都要发送，实际可用对话窗口只有~161k
4. **高频compaction**：21次compaction说明对话密度很高，每次compaction后很快又触满

### 2.3 Session重置配置

```json
{
  "session": {
    "reset": {
      "mode": "daily",
      "atHour": 4,        // 每天凌晨4点重置
      "idleMinutes": 120   // 空闲2小时后重置
    }
  }
}
```

当前session从3月9日20:04持续到3月11日00:27，跨越了28小时。说明凌晨4点的重置可能因为持续活跃而未触发（需要idle 120分钟）。

---

## 三、根因总结

上下文膨胀的根因是**三重叠加**：

```
固定开销（不可压缩）     ≈ 39,000 tokens (20%)
  ├── 系统提示核心         ≈ 8,000
  ├── Workspace文件注入    ≈ 23,000  ← 可优化
  ├── Skills列表           ≈ 2,900   ← 可优化
  └── 工具Schema           ≈ 5,000

Compaction摘要（持续增长） ≈ 5,000-19,000 tokens
  └── 雪球效应：每次压缩后摘要更大

活跃对话（快速填满）       ≈ 142,000-156,000 tokens
  ├── 工具结果占71.5%      ← 主要问题
  │   ├── 图片数据          ← 单张可达150KB
  │   ├── session列表       ← 单次可达120KB
  │   └── 文档/网页读取     ← 单次可达60KB
  └── 对话内容占28.5%
```

**恶性循环**：大工具结果 → 快速填满窗口 → 频繁compaction → 摘要膨胀 → 可用空间更少 → 更频繁compaction → 响应越来越慢

---

## 四、解决方案

### 方案A：安全缩减当前Session的上下文

**可行性：低风险，但效果有限**

OpenClaw没有提供手动裁剪session上下文的CLI命令。可选操作：

1. **等待自动重置**：当前session配置了 `idleMinutes: 120`，停止交互2小时后会自动重置
2. **手动触发新session**：发送 `/reset` 命令（如果支持），或者等凌晨4点自动重置
3. **不建议直接编辑session JSONL文件**——格式复杂，有parentId链，改坏会导致session损坏

**推荐：直接执行方案B，开新session。**

### 方案B：新开Session + 确保记忆连续性（推荐立即执行）

**步骤：**

1. **确认记忆文件完整**：
   - `MEMORY.md`（24.5KB）— 长期记忆，已有
   - `memory/2026-03-10.md`（26.7KB）— 当日记录，已有
   - `memory/2026-03-11.md`（4.9KB）— 今日记录，已有

2. **补充今日记忆**：在新session开始前，确保 `memory/2026-03-11.md` 包含当前session的关键上下文（正在进行的任务、待办事项、重要决策）

3. **触发session重置**：
   - 方法1：停止交互120分钟，等待idle重置
   - 方法2：通过OpenClaw CLI或飞书发送 `/reset` 或 `/new` 命令
   - 方法3：重启gateway服务 `openclaw gateway restart`

4. **新session启动后的记忆加载**：
   OpenClaw会自动加载以下文件（源码确认）：
   - `AGENTS.md` — 行为规范
   - `SOUL.md` — 人格定义
   - `TOOLS.md` — 工具笔记
   - `IDENTITY.md` — 身份
   - `USER.md` — 用户信息
   - `HEARTBEAT.md` — 心跳配置
   - `BOOTSTRAP.md` — 引导
   - `MEMORY.md` — 长期记忆（仅主session加载）

   **注意**：`memory/YYYY-MM-DD.md` 日记文件**不会**被自动注入系统提示。它们需要Agent在AGENTS.md的"Every Session"指令中主动读取。当前AGENTS.md已配置了这个行为（读今天+昨天的memory文件），所以记忆连续性有保障。

**记忆连续性评估：够用。** MEMORY.md + memory/*.md + AGENTS.md的"Every Session"指令，足以让新session恢复上下文。

### 方案C：系统层面长期优化（推荐逐步实施）

#### C1. 精简Workspace注入文件（预计节省 8,000-12,000 tokens）

当前93KB的workspace文件中，有明显的冗余和可精简空间：

| 文件 | 当前大小 | 建议 | 预计节省 |
|------|----------|------|----------|
| MEMORY.md | 24.5 KB | 定期清理过期内容，控制在15KB以内 | 9 KB |
| AGENTS.md | 19.8 KB | 精简重复规则，移除已固化到skill的内容 | 5-8 KB |
| SOUL.md | 12.1 KB | 精简，核心人格定义不需要12KB | 4-6 KB |
| CAPABILITY-ANCHOR.md | 9.5 KB | 考虑不注入系统提示，改为按需读取 | 9.5 KB |
| CONFIG-QUICK-REFERENCE.md | 6.8 KB | 不应注入系统提示，改为按需读取 | 6.8 KB |
| CRITICAL_ENFORCEMENT_RULES.md | 4.1 KB | 合并到AGENTS.md的关键规则部分 | 4.1 KB |
| DELIVERY-PHASE3-1.md | 2.8 KB | 临时文件，不应长期注入 | 2.8 KB |
| BOOTSTRAP.md | 1.5 KB | 初始化完成后应删除（AGENTS.md已有此指令） | 1.5 KB |
| CRITICAL-MEMORY.md | 1.2 KB | 合并到MEMORY.md | 1.2 KB |

**关键操作**：将非核心文件从workspace根目录移走（OpenClaw只自动注入特定命名的文件：AGENTS.md, SOUL.md, TOOLS.md, IDENTITY.md, USER.md, HEARTBEAT.md, BOOTSTRAP.md, MEMORY.md）。

**等等——重要发现**：根据源码，`loadWorkspaceBootstrapFiles` 只加载以下固定文件名：
- AGENTS.md, SOUL.md, TOOLS.md, IDENTITY.md, USER.md, HEARTBEAT.md, BOOTSTRAP.md, MEMORY.md

那么 `CAPABILITY-ANCHOR.md`、`CONFIG-QUICK-REFERENCE.md`、`CRITICAL_ENFORCEMENT_RULES.md`、`DELIVERY-PHASE3-1.md`、`CRITICAL-MEMORY.md`、`PROJECT-TRACKER.md` 这些文件**不应该被自动注入**。

如果它们确实出现在了系统提示中，可能是通过以下途径：
1. Agent在AGENTS.md的"Every Session"指令中主动读取了它们
2. 某个bootstrap hook或plugin注入了它们

**验证方法**：检查AGENTS.md中是否有指令要求读取这些额外文件。如果是Agent自己读取的，那它们会作为工具调用结果出现在对话历史中，而不是系统提示中——这意味着它们会被compaction处理，问题不大。

**实际需要精简的系统提示注入文件**：

| 文件 | 当前大小 | 建议目标 |
|------|----------|----------|
| MEMORY.md | 24.5 KB | ≤ 12 KB（清理3月8日前的过期内容） |
| AGENTS.md | 19.8 KB | ≤ 10 KB（精简重复规则） |
| SOUL.md | 12.1 KB | ≤ 6 KB（精简冗余描述） |
| 其他5个文件 | 12.4 KB | 保持不变（已经很小） |

**预计节省：~28 KB ≈ 7,000 tokens（系统提示从39k降到32k）**

#### C2. 精简Skills列表（预计节省 1,000-2,000 tokens）

当前45个skill中有明显的冗余：
- 4个 `cras-generated-*` 自动生成的skill
- 多个功能重叠的skill（如 `seef` 和 `seef-evolution-pipeline`）

建议：清理不再使用的skill，将45个精简到25-30个。

#### C3. 优化工具调用模式（长期最大收益）

这是**最重要的优化方向**，因为工具结果占71.5%：

1. **图片处理**：避免在对话中直接读取大图片。如果需要分析图片，使用子agent处理后只返回分析结果
2. **sessions_list**：避免频繁调用完整的session列表（单次120KB）。使用过滤参数减少返回量
3. **文档读取**：使用 `offset/limit` 参数分段读取，避免一次性加载整个文档
4. **embedding数据**：不应在对话中传递原始向量数据（51KB的浮点数组毫无意义）

#### C4. 调整Compaction配置

可以在 `openclaw.json` 的 `agents.defaults.compaction` 中调整（**注意：不修改openclaw.json是铁律，此建议需要人类操作**）：

```json
{
  "agents": {
    "defaults": {
      "compaction": {
        "reserveTokens": 30000,      // 默认20000，增加到30000给新对话更多空间
        "keepRecentTokens": 40000    // 保留最近40k tokens不被压缩
      }
    }
  }
}
```

#### C5. 调整Session重置策略

当前配置 `idleMinutes: 120` 可能太长，导致session跨天运行。建议：
- 将 `idleMinutes` 降到 60 分钟
- 或者在HEARTBEAT.md中添加主动检查：当compaction次数超过15次时，提醒用户考虑重置session

---

## 五、推荐执行顺序

### 立即（今天）

1. ✅ **方案B**：新开session。确保 `memory/2026-03-11.md` 记录完整后，等待idle重置或手动重置
2. ✅ **C1局部**：清理 `MEMORY.md`，删除3月7日前的过期内容，目标控制在12KB以内

### 本周

3. 🔧 **C1完整**：精简 `AGENTS.md`（目标10KB）和 `SOUL.md`（目标6KB）
4. 🔧 **C2**：清理冗余skill（目标30个以内）
5. 🔧 **C4**：（需人类操作）调整compaction配置

### 持续

6. 📋 **C3**：在AGENTS.md中添加工具调用最佳实践规则：
   - "不要在主session中直接读取图片，委托子agent处理"
   - "sessions_list使用过滤参数"
   - "文档读取使用offset/limit分段"
7. 📋 **C5**：监控compaction频率，超过15次主动提醒

---

## 六、预期效果

| 优化项 | 预计节省tokens | 时间框架 |
|--------|---------------|----------|
| 新开session（方案B） | 立即恢复到~39k/200k | 今天 |
| 精简MEMORY.md | ~3,000 tokens/轮 | 今天 |
| 精简AGENTS.md + SOUL.md | ~5,000 tokens/轮 | 本周 |
| 优化工具调用模式 | 减少50%+ compaction频率 | 持续 |
| 调整compaction配置 | 延缓compaction触发 | 本周 |

**综合效果**：新session + workspace精简后，系统提示从~39k降到~30k，可用对话窗口从161k增加到170k，compaction频率预计降低40-60%。

---

_分析完成。核心结论：立即开新session恢复性能，同时精简workspace文件减少固定开销，长期通过优化工具调用模式减少compaction频率。_
