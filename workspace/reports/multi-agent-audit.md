# 多Agent角色体系审计报告

> 审计时间: 2026-03-11 11:42 (Asia/Shanghai)
> 审计范围: openclaw.json 19个agent配置 + 61个provider + 调度脚本 + 实际运行数据

## 一、总览

| 维度 | 数据 |
|------|------|
| Agent总数 | 19 (8主力 + 7副手-02 + 4通用worker-03~06) |
| Provider总数 | 61 (Claude×20 + Boom×13 + Zhipu×28) |
| API Key总数 | 58 (3组Zhipu重复) |
| 模型层级 | 3层fallback: Claude Opus 4-6 → GPT-5.3 Codex → GLM-5 |
| 并发上限 | maxConcurrent=24, maxSpawnDepth=2 |

## 二、发现的坑（按严重度排序）

### 🔴 P0 — 严重问题

#### 坑1: 所有Agent没有role定义

19个agent的`role`字段全部为空。这意味着：
- 调度器无法按角色分配任务
- 所有agent本质上是同质的，"researcher"和"coder"只是名字不同
- 浪费了角色分工的设计意图

```
main                 -> role: (空)
researcher           -> role: (空)
coder                -> role: (空)
...全部19个都是空的
```

**修复建议**: 为每个agent定义明确的role字段，如 `"role": "research"`, `"role": "code"`, `"role": "review"` 等。

#### 坑2: 零个Agent有自定义系统提示词

检查了所有19个agent的agentDir目录，没有一个包含 `system.md`、`identity.md` 或 `prompt.md`。每个目录只有 `models.json`（和部分有 `AGENTS.md`）。

这意味着所有agent共享完全相同的系统提示词，角色分工完全依赖identity.name这个纯装饰字段。一个叫"系统架构师"的agent和一个叫"开发工程师"的agent行为完全一样。

**修复建议**: 为每个角色编写专属system prompt，定义其职责边界、输出规范、工具使用偏好。

#### 坑3: 只有main有治理配置，其他18个裸奔

| 配置项 | main | 其他18个 |
|--------|------|----------|
| subagents (子Agent权限) | ✅ allowAgents: ["*"] | ❌ 无 |
| tools.deny (工具限制) | ✅ 禁write/edit等 | ❌ 无限制 |
| failover (故障转移) | ✅ 有 | ❌ 无 |

后果：
- 任何子Agent都可以无限制使用所有工具（包括write/edit），没有安全边界
- 子Agent没有failover配置，primary挂了不会自动切换
- reviewer可以写代码，coder可以写文档——角色边界形同虚设

**修复建议**: 至少为每个角色配置tools.deny和failover。reviewer应禁止write/edit，researcher应禁止破坏性操作。

#### 坑4: runTimeoutSeconds=0 — 僵尸Session无限存活

`agents.defaults.subagents.runTimeoutSeconds: 0` 表示没有超时限制。子Agent如果卡住（如等待gateway restart），会永远占用一个并发槽位。

历史上已经多次出现僵尸session问题（见之前的修复记录）。

**修复建议**: 设置合理超时，如 `"runTimeoutSeconds": 600`（10分钟）。

### 🟡 P1 — 中等问题

#### 坑5: Identity命名off-by-one错误

```
worker-03  ->  执行者-02  (应该是 执行者-03)
worker-04  ->  执行者-03  (应该是 执行者-04)
worker-05  ->  执行者-04  (应该是 执行者-05)
worker-06  ->  执行者-05  (应该是 执行者-06)
```

编号全部偏移了1位。虽然不影响功能，但在看板和日志中会造成混淆。

#### 坑6: Boom Fallback Provider命名不匹配

```
worker-03 的boom fallback → boom-main-02  (应该是 boom-worker-03)
worker-04 的boom fallback → boom-main-03  (应该是 boom-worker-04)
worker-05 的boom fallback → boom-main-04  (应该是 boom-worker-05)
worker-06 的boom fallback → boom-main-05  (应该是 boom-worker-06)
```

provider名字和agent名字不对应，增加运维排查难度。虽然API key是独立的所以功能不受影响，但命名混乱是维护噩梦。

#### 坑7: scout主力模型不一致

| Agent | Primary Model |
|-------|--------------|
| scout | claude-opus-4-6 (非thinking) |
| scout-02 | claude-opus-4-6-thinking |
| 其他所有 | claude-opus-4-6-thinking |

scout是唯一一个用非thinking模型的非cron agent。如果是有意为之（情报收集不需要深度推理），应该在配置中注释说明。否则就是配置遗漏。

#### 坑8: cron-worker vs cron-worker-02 策略矛盾

| Agent | Primary | 策略 |
|-------|---------|------|
| cron-worker | zhipu-cron-worker/glm-5 | 省钱优先 |
| cron-worker-02 | claude-cron-worker-02/claude-opus-4-6-thinking | 质量优先 |

同一角色的主副手用了完全相反的模型策略。cron-worker用最便宜的GLM-5，cron-worker-02用最贵的Claude Opus Thinking。应该统一策略。

#### 坑9: 3组Zhipu API Key重复

```
zhipu-embedding + zhipu-researcher     → 共享 key ...z89NN8JC
zhipu-multimodal + zhipu-core + zhipu-coder → 共享 key ...tVmXJKkz
zhipu-cron + zhipu-main               → 共享 key ...xSYTUXst
```

共享key意味着：
- 并发请求时可能触发同一key的rate limit
- 无法按agent粒度追踪Zhipu API用量
- 如果一个key被封，多个agent同时失效

#### 坑10: agent-pool.json 不存在

`/root/.openclaw/workspace/scripts/agent-pool.json` 文件不存在。`get-free-agent.sh` 会fallback到硬编码的18个agent列表（不含main）。

问题：
- 硬编码列表和openclaw.json的agent list可能不同步
- 无法动态调整agent池（如临时禁用某个agent）

**修复建议**: 创建 agent-pool.json，从openclaw.json自动生成或手动维护。

### 🟢 P2 — 低优先级

#### 坑11: worker-03~06从未被使用

```
worker-03: 0 sessions
worker-04: 0 sessions
worker-05: 0 sessions
worker-06: 0 sessions
```

4个通用worker配置了独立的Claude + Boom + Zhipu API key（12个provider），但从未被调度过。资源浪费。

可能原因：调度脚本优先分配有角色名的agent（researcher/coder等），worker-03~06没有明确角色所以永远排在最后。

#### 坑12: memorySearch默认禁用

```json
"memorySearch": { "enabled": false }
```

所有子Agent默认无法搜索记忆。这意味着跨session的知识传递完全依赖task描述中的上下文注入，而不是agent自主检索。

#### 坑13: -02副手定位不清晰

-02系列agent（researcher-02, coder-02等）和主力agent的配置完全相同（除了API key不同）。没有任何配置层面的差异化：
- 没有不同的role
- 没有不同的system prompt
- 没有不同的工具限制
- 没有不同的模型偏好

它们存在的唯一价值是提供额外的并发槽位（不同API key避免rate limit）。这个设计是合理的，但应该在配置中明确标注。

## 三、调度效率分析

### sessions_spawn 的 agentId 支持

✅ `sessions_spawn` 确实支持 `agentId` 参数。代码中多处使用：
- `batch-dispatch-from-queue.sh` 中通过 `item.agent || boardTask?.agentId` 路由
- `evolver/src/evolve.js` 中显式传递 `agentId: AGENT_NAME`
- `architecture-review-pipeline/index.js` 中按角色分配

但验证方式有限——没有日志确认agentId是否真的路由到了对应agent的API key。

### 并发限制

```json
"maxConcurrent": 24,
"maxSpawnDepth": 2,
"maxChildrenPerAgent": 20
```

- 全局最多24个并发子Agent
- 最大嵌套深度2层
- 每个agent最多20个子session
- **无gateway级别的并发限制**——如果24个agent同时请求Claude API，可能触发provider级rate limit

### API Key隔离验证

Claude和Boom的key全部独立（每个agent一个），可以真正并行。Zhipu有3组重复，并发时可能互相干扰。

## 四、修复优先级建议

| 优先级 | 坑 | 工作量 | 建议 |
|--------|-----|--------|------|
| P0 | #4 runTimeout=0 | 1分钟 | 改为600 |
| P0 | #3 治理配置缺失 | 30分钟 | 至少加tools.deny和failover |
| P0 | #1 role为空 | 10分钟 | 定义role字段 |
| P0 | #2 无系统提示词 | 2小时 | 为每个角色写system.md |
| P1 | #5 命名off-by-one | 2分钟 | 修正identity.name |
| P1 | #6 boom命名不匹配 | 5分钟 | 重命名provider |
| P1 | #7 scout模型不一致 | 1分钟 | 确认意图或修正 |
| P1 | #8 cron策略矛盾 | 1分钟 | 统一策略 |
| P1 | #9 Zhipu key重复 | 10分钟 | 申请独立key |
| P1 | #10 agent-pool.json缺失 | 5分钟 | 创建文件 |
| P2 | #11 worker未使用 | 调度层修复 | 调整调度优先级 |
| P2 | #12 memorySearch禁用 | 1分钟 | 评估是否开启 |
| P2 | #13 -02定位不清 | 文档 | 注释说明设计意图 |

## 五、结论

**核心问题：19个agent的角色分工是"纸面工程"。** 没有role、没有system prompt、没有工具限制，所有agent本质上是同一个agent的19个副本，只是API key不同。这个架构的实际价值仅限于：

1. ✅ API key隔离，避免rate limit（这个是有效的）
2. ✅ 并发槽位扩展（24个并发）
3. ❌ 角色分工（完全无效）
4. ❌ 安全边界（完全无效）
5. ❌ 行为差异化（完全无效）

要让多Agent体系真正发挥作用，最关键的是**坑#2（系统提示词）**和**坑#3（治理配置）**。没有这两个，其他都是装饰。
