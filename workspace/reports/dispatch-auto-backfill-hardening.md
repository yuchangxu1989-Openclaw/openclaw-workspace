# dispatch-auto-backfill-hardening

- 时间：2026-03-07 00:10 GMT+8 后执行
- 目标：把“识别出确定性任务就立即入队、空槽立即补位、对话不中断调度”尽量固化为程序行为，而不是靠提示词约定。

## 扫描结论

我直接扫描了当前调度接入点，重点看了：

- `skills/public/multi-agent-dispatch/dispatch-engine.js`
- `skills/public/multi-agent-dispatch/dispatch-bridge.js`
- `skills/public/multi-agent-dispatch/cli.js`
- `skills/public/multi-agent-dispatch/SKILL.md`
- 相关测试与 live validation

### 已有正确点

1. `enqueue()` 已经内置 `drain()`，不是“先入队再等人工 dispatch”。
2. `markDone / markFailed / cancel` 已经在释放槽位后自动 `drain()`，基础自动补位逻辑是对的。
3. `dispatch-engine` 里没有引入额外 pending 状态，状态机仍然保持 `queued -> spawning -> running`。

### 仍然存在的关键缺口

虽然引擎本身已经接近正确，但**接线层仍然可能出现“只解释不派发 / 只写 pickup 文件不真正持续推进”的问题**：

1. `dispatch-bridge.js` 只是把任务写入 `pending-dispatches.json`
   - 这仍然依赖“主 agent 下一个回合再读文件、再手动 spawn”。
   - 如果对话继续解释、但没有主动消费 pending，就会出现“状态里是 spawning，但实际上没有真正 sessions_spawn”的假性调度。

2. `onDispatch` 没有把 `engine` 上下文传入 callback
   - bridge 只能被动记账，无法在 callback 里做更强的持续 drain / 校正。

3. 缺少程序化的持续 drain runner
   - 现状更多是“约定主 agent 每回合记得读取 pending”。
   - 这会让“对话不中断调度”依赖操作习惯，而不是代码路径。

4. spawning 卡住时，缺少 bridge 侧的再发布机制
   - 如果任务进入 `spawning`，但 bridge pickup 丢失/未消费，就会长期占槽，直到 stale reap。
   - stale reap 能回收槽位，但不能保证 pickup 丢失时的自动补发。

## 已做修改

### 1) 强化 dispatch-engine：把派发尝试写成显式程序状态

修改文件：`skills/public/multi-agent-dispatch/dispatch-engine.js`

新增：

- `dispatchAttempts`
- `lastDispatchAt`

并在 `drain()` 中：

- 每次从 `queued -> spawning` 时递增 `dispatchAttempts`
- 记录 `lastDispatchAt`
- `onDispatch(task, engine)` 现在把 `engine` 一起传给 callback

效果：

- 派发行为不再只是“解释上发生过”，而是写入任务状态。
- 后续 bridge / runner 可以基于 `lastDispatchAt` 做补发与纠偏。

### 2) 强化 dispatch-bridge：让 bridge 持有更多调度上下文

修改文件：`skills/public/multi-agent-dispatch/dispatch-bridge.js`

变更：

- `onDispatchBridge(task)` -> `onDispatchBridge(task, engine = null)`
- pending 记录中增加：
  - `status`
  - `dispatchAttempts`
- 若传入 engine，则读取 live board 做基本校验；在极端情况下继续触发 `engine.drain()`

效果：

- bridge 不再只是极薄的“抄一份 taskId”。
- pending 文件里能看出是否真的经历过派发尝试。

### 3) 新增 dispatch-runner：把“持续 drain + 自动补位 + 自动派发”落到程序

新增文件：`skills/public/multi-agent-dispatch/dispatch-runner.js`

这个文件做三件事：

1. `engine.reapStale()`
   - 先回收卡死 spawning/running 的槽位。

2. `engine.drain()`
   - 先把所有空槽尽量填满。

3. 消费 `pending-dispatches.json` 并真正调用 `globalThis.sessions_spawn`
   - 成功后自动 `markRunning(taskId, { sessionKey, ... })`
   - 失败后自动 `markFailed(...)`
   - 同时 `ackTask(taskId)`，避免重复 pickup

此外增加了：

- `republishStrandedSpawning(engine, { republishSpawningMs })`
  - 对已经处于 `spawning` 但 pending pickup 丢失的任务，按阈值重新发布到 bridge
  - 避免“状态占槽但 bridge 没任务可拿”的卡死

这一步是本次 hardening 的核心：

> 从“主 agent 记得读 pending 并手动 spawn”
> 改成
> “runner tick 时自动 drain + 自动消费 pending + 自动 markRunning/markFailed + 自动补发 stranded spawning”。

也就是说，**把不中断调度从流程约定尽量下沉为代码路径**。

### 4) 增加 hardening 测试

新增文件：`skills/public/multi-agent-dispatch/test/dispatch-hardening.test.js`

覆盖两类问题：

1. `onDispatch` 现在确实拿到 `engine`，并把 `status / dispatchAttempts` 写进 pending
2. `republishStrandedSpawning()` 会把丢失 pickup 的 spawning 任务重新发布回 bridge

## 验证结果

执行：

```bash
npx jest /root/.openclaw/workspace/skills/public/multi-agent-dispatch/test/dispatch-hardening.test.js --runInBand
```

结果：通过

- 2 tests passed
- 0 failed

说明至少新增的 hardening 行为已经被测试覆盖并通过。

## 对“只解释不派发”的最终判断

### 修改前

引擎层基本对，但接线层仍可能：

- enqueue 了
- 写了 pending
- agent 去解释了
- 但没有立即真正 sessions_spawn

于是形成“口头已经调度、程序实际上没 dispatch”的灰区。

### 修改后

仍然要分两层看：

1. **引擎层**：已经更硬
   - enqueue 立即 drain
   - 释放槽位立即补位
   - 每次 dispatch 尝试留下计数与时间戳

2. **接线层**：已经从“纯约定”前进到“可运行程序”
   - `dispatch-runner.js` 可以作为统一入口持续执行 drain + pickup + spawn + backfill
   - stranded spawning 可以自动 republish

因此现在的状态是：

- **“只解释不派发”风险明显下降**
- **“空槽不补位”已经进一步由代码保障**
- **“对话不中断调度”已有 runner 级程序接线，而不再只靠 prompt 纪律**

## 仍建议的下一步（未在本次强行扩大改动）

为了完全闭环，建议后续把主编排入口统一切到 `dispatch-runner.drainAndRun()`，而不是让不同 agent 各自手写：

- 识别任务 -> `engine.enqueue/enqueueBatch`
- 然后立即调用一次 `dispatch-runner.drainAndRun()`
- 在有 completion 事件时再次调用 `drainAndRun()`

这样可以把“识别确定性任务就立即入队并立即真实派发”进一步固定成唯一主路径。

## 本次变更文件

- 修改：`skills/public/multi-agent-dispatch/dispatch-engine.js`
- 修改：`skills/public/multi-agent-dispatch/dispatch-bridge.js`
- 新增：`skills/public/multi-agent-dispatch/dispatch-runner.js`
- 新增：`skills/public/multi-agent-dispatch/test/dispatch-hardening.test.js`

## 结论

本次已经把三件事进一步程序化：

1. **识别出确定性任务就立即入队**：仍由 `enqueue === drain` 保证，并补充 dispatch bookkeeping。
2. **空槽立即补位**：仍由 `markDone/markFailed/cancel -> drain` 保证，并增加 stranded spawning 的 republish 修复。
3. **对话不中断调度**：新增 `dispatch-runner.js`，把持续 drain / 自动 pickup / 自动真实 spawn 落成代码，不再只靠“主 agent 下一回合记得做”。

本次按要求直接执行并落盘，无额外确认。
