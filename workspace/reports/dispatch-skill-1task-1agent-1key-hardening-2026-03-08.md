# Agent 调度技能 1任务=1Agent=1模型Key 硬化报告

时间：2026-03-08
文件：`reports/dispatch-skill-1task-1agent-1key-hardening-2026-03-08.md`

## 结论

已对 `dispatch-engine / dispatch-bridge / dispatch-runner / reporting` 做程序化硬化，目标是把“并行数 / active / Agent占用”从“任务条目数”改为“真实运行中模型 key 占用事实”。

这次修复的硬约束已经落到代码里：

1. **1任务 = 1Agent = 1模型key**：调度时不再允许已占用 key 的任务继续并发进入真实 active 口径。
2. **active 只能代表真实占用 key 的运行中任务**：reporting 只统计 `running + 有 runtime model key` 的任务。
3. **Agent并行总数从真实 key 占用推导**：live board 增加 `occupiedModelKeys / occupiedModelKeyCount`，并由此推导 free slots / utilisation。
4. **程序化防呆**：增加 runtime invariant 检查，发现 key collision 直接报错，而不是继续“看起来很忙”。
5. **最小验证已补**：新增 `runtime-model-key-hardening.min.test.js`。

## 根因分析

### 根因 1：系统把“任务对象”误当成“真实运行资源”

原实现里：

- `busyCount = spawning + running` 任务数
- `drain()` 按空槽数直接拉队列
- reporting 主要按任务状态渲染

这有一个致命问题：

**任务数 != 真正占用的模型 key 数**。

如果多个任务使用同一个 key，系统会把它们都算作“并发中”，但底层真实资源并没有变多，于是出现：

- 卡片里 active 虚高
- 并行数虚高
- 一个 key 被“伪装成多个 agent 在并行”
- 调度层和汇报层口径失真

### 根因 2：缺少“runtime model key”这个强约束字段

之前代码只有：

- `model`
- `agentId`
- `sessionKey`

没有一个统一、强制、贯穿 dispatch → runner → reporting 的**真实运行 key 标识**。于是：

- dispatch 无法基于 key 去避碰
- reporting 无法基于 key 去算真实 active
- bridge 无法链路留痕 key 占用

### 根因 3：active 口径混用了 spawning / running / unfinished

旧链路存在两种常见偏差：

- 调度层把 spawning + running 一起算 busy
- 汇报层虽然收窄到 running，但没有强制要求“必须有真实 runtime model key”

结果就是“已建单 / 已入队 / 已尝试派发”很容易被错报成“真实运行中”。

## 本次代码改动

## 1. 新增 runtime key 统一来源

新增文件：

- `skills/public/multi-agent-dispatch/runtime-model-key.js`

职责：

- 统一推导 `modelKey / runtimeModelKey`
- dispatch / bridge / reporting 共用同一套推导函数

这避免了每个模块自己猜“这个任务到底算不算真实 key 占用”。

## 2. dispatch-engine 硬化

修改文件：

- `skills/public/multi-agent-dispatch/dispatch-engine.js`

关键改动：

### 2.1 任务创建时写入 key

`makeTask()` 现在会给任务补齐：

- `modelKey`
- `runtimeModelKey`

保证后续链路不再缺少运行 key 维度。

### 2.2 增加真实 key 占用映射

新增方法：

- `activeKeyMap()`
- `activeKeyCount()`
- `assertKeyOccupancyInvariant()`

作用：

- 从真实 active 任务推导当前被占用的 key
- 检测“一个 key 被多个 active 任务同时占用”
- 检测“active 数 != occupied key 数”

一旦出现，直接抛错，防止静默失真。

### 2.3 drain() 改为“按 key 避碰调度”

原来是：

- 有 free slot 就继续 dispatch

现在是：

- 有 free slot 还不够
- 还必须 **候选任务的 model key 未被 active key 集合占用**

这就把“一个 key 伪装多并行”在调度入口处卡死。

### 2.4 busy / free / utilisation 改为从 occupied key 推导

`liveBoard()` 现在增加：

- `occupiedModelKeys`
- `occupiedModelKeyCount`

并且：

- `freeSlots = maxSlots - occupiedModelKeyCount`
- `utilisation = occupiedModelKeyCount / maxSlots`

这满足“Agent并行总数必须从真实 key 占用推导”。

### 2.5 activeTasks() 收紧为“有 key 的 active”

`activeTasks()` 不再无脑返回全部 spawning/running，而是过滤出：

- 处于 active 生命周期
- 且能推导出 runtime model key

避免无 key 幽灵任务污染 active 口径。

## 3. dispatch-bridge / runner 硬化

修改文件：

- `skills/public/multi-agent-dispatch/dispatch-bridge.js`
- `skills/public/multi-agent-dispatch/dispatch-runner.js`

关键改动：

### 3.1 pending-dispatches 写入 modelKey

bridge 的 pending record 现在显式携带：

- `modelKey`
- `runtimeModelKey`

使 dispatch-ready 记录也能追踪真实资源身份。

### 3.2 runner 在 markRunning / markSpawned / markDelivered 时回填 runtime key

runner 现在会把 runtime model key 贯穿写回：

- engine state
- pending delivery chain

这样 reporting 不再只能看状态，而可以看“这个 running 是否真的绑到了某个 key”。

## 4. reporting 硬化

修改文件：

- `skills/public/multi-agent-reporting/report-trigger.js`

关键改动：

### 4.1 reporting task 增补 modelKey/runtimeModelKey

`toReportingTask()` 现在会把 runtime key 带入 reporting task。

### 4.2 active 只统计“running + 有真实 runtime key”

`buildReport()` 现在显式只取：

- `state.running`
- 且 `model` 存在
- 且 `inferModelKey(...)` 成功

这保证 active 不是“已入场景”，而是“真实占 key 在运行”。

### 4.3 reporting 链路直接检查重复 key

如果发现 running 集合里：

- active task 数 > active model key 数
- 或出现 duplicated key

则直接报错，不允许继续产出失真报告。

## 测试与验证

新增测试：

- `skills/public/multi-agent-dispatch/test/runtime-model-key-hardening.min.test.js`

已验证：

1. **同一个 key 不能被并行调度成多个真实 active**
2. **reporting 的 active 只统计真实 running key 占用**
3. **runtime invariant 对 key collision 能直接报错**

运行结果：

- `node skills/public/multi-agent-dispatch/test/runtime-model-key-hardening.min.test.js` ✅ 通过

额外说明：

- 旧测试 `lifecycle-basics.min.test.js` 中有一条“同 model 连续任务可并行占满 busySlots”的旧预期，和本次硬要求冲突，因此出现失败。这不是新 bug，而是旧测试口径仍然基于“任务数并行”，尚未按“真实 key 占用并行”更新。

## 仍需继续收口的点

本次已经把核心失真链路钉死，但还建议继续做两件事：

1. **把历史测试全部改口径**：凡是默认“相同 model 也能并发占槽”的测试，都应改成“相同 key 不并发，排队等待”。
2. **把 `maxSlots` 语义文档化为 key capacity**：不是任务条目 capacity，而是“最大可同时占用 key 数”。

## 最终判断

这次不是靠口头规范，而是做成了代码级硬约束：

- 调度时按 key 避碰
- 运行时按 key 校验
- 汇报时按 key 统计
- 并行总数按 key 占用推导

因此，已经实质性根治“1 个 key 伪装多个 Agent 并行任务”的主要失真来源。