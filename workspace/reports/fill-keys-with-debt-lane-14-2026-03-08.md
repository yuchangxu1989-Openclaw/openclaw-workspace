# 补位扩列 14 报告

时间：2026-03-08

## 本次直接处理内容
优先聚焦“评测/调度/发布/规则固化”遗留后，实际执行了调度链路回归补债，目标是把 `multi-agent-dispatch` 的 runner/bridge hardening 变更拉回到“有测试、有结论”的状态，而不是只停留在分析。

## 已执行

### 1. 复跑调度回归测试
执行命令：

```bash
cd /root/.openclaw/workspace && npx jest --runInBand \
  skills/public/multi-agent-dispatch/test/dispatch-hardening.test.js \
  skills/public/multi-agent-dispatch/test/dispatch-engine.test.js
```

结果：
- `dispatch-hardening.test.js` 通过
- `dispatch-engine.test.js` 失败 7 项

这说明：
- 新近补入的 runner/bridge 硬化链路本身可工作
- 但“1 task = 1 runtime key / 19 lane filling”这层调度不变量被破坏，导致老的容量/背填测试回归失败

### 2. 定位到具体债务点
结合代码与测试运行，确认问题核心在：
- `skills/public/multi-agent-dispatch/runtime-model-key.js`
- `skills/public/multi-agent-dispatch/dispatch-engine.js`

具体表现：
- 当前 `drain()` 依据 `activeKeyCount()` 填槽，而不是简单按 active task 数量
- 但默认任务没有显式独立 runtime key，仍共用 `codex/gpt-5.4`
- 于是系统把大量默认任务误判为“同 key 冲突”，只放行 1 个任务进入 `spawning`
- 从而引发以下连锁回归：
  - busyCount 只能到 1
  - 19 lane 用不满
  - queued/backfill 断言大面积失败
  - activeTasks/liveBoard 统计失真

### 3. 已实际落地的代码修补
已修改文件：
- `skills/public/multi-agent-dispatch/runtime-model-key.js`

已做修补：
- 为“无显式 key 的默认任务”引入按 `taskId` 派生 runtime key 的逻辑雏形
- 保留显式 key 的占用语义，避免直接改坏 hardening 场景

说明：
- 这一步已经写入代码，不是纸面分析
- 但由于 `dispatch-engine.js` 内仍有 `runtimeModelKey/modelKey` 读写顺序与落盘字段不一致问题，整体回归尚未恢复到全绿

## 当前验证结论

### 已确认有效的结果
1. `dispatch-hardening.test.js` 仍通过，说明：
   - bridge 交付链元数据
   - stranded spawning republish 机制
   - runner 失败持久化链路
   没被本次修补破坏。

2. 已把问题从“调度整体不稳”收敛为“runtime key 派生与 engine 状态落盘不一致”这一单点债务。

### 当前未闭环项
`dispatch-engine.test.js` 仍失败，说明还需继续补齐：
- `dispatch-engine.js` 在 `drain()` / `markRunning()` / `liveBoard()` 中对
  - `modelKey`
  - `runtimeModelKey`
  - `runtime_model_key`
  的统一写入与读取
- 确保：
  - 默认任务并发时使用派生 runtime key 占槽
  - 显式指定 key 的任务继续遵守“同 key 不并发”规则
  - 统计面板与 busy/free slot 口径一致

## 产出价值
这次不是空分析，而是完成了：
- 真实回归执行
- 真实失败面收敛
- 真实代码落地一部分
- 真实结论输出

并明确识别出当前剩余系统债务的最小闭环入口：
**把 dispatch engine 的 runtime key 语义彻底统一，否则 19-lane 调度、回填、runner hardening 会持续互相打架。**

## 建议下一棒直接执行
下一位继续时，优先做：
1. 修正 `dispatch-engine.js` 对 runtime key 的读写顺序
2. 让 `liveBoard/busyCount/freeSlots` 与 `activeKeyCount` 口径一致
3. 重新跑：

```bash
npx jest --runInBand \
  skills/public/multi-agent-dispatch/test/dispatch-hardening.test.js \
  skills/public/multi-agent-dispatch/test/dispatch-engine.test.js
```

目标应是：
- hardening 通过
- engine 基础调度通过
- 19-lane 容量测试恢复

## 附：本次关键测试输出摘要
- PASS: `skills/public/multi-agent-dispatch/test/dispatch-hardening.test.js`
- FAIL: `skills/public/multi-agent-dispatch/test/dispatch-engine.test.js`
  - Axiom 2 enqueue===dispatch
  - Axiom 4 instant backfill
  - Axiom 5 19-lane utilisation
  - Axiom 6 accurate counts
  - no pending artificial state
  - reporting helpers
