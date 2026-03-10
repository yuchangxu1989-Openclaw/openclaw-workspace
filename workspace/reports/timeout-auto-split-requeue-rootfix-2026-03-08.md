# timeout 自动 split/requeue 根治报告（2026-03-08）

## 结论
已完成根治：timeout 不再以“停留在 timeout 状态”作为终点，而是在 reaper/runner 默认链路里**立即收敛为 failed 终态 + 自动派生 follow-up + 重新入调度**。

## 根因
原实现里：
- `reapStale()` 只对 `restart/replace` 派生 follow-up；
- `archive/human_handoff` 只打决策标记，不会自动生成后续任务；
- 因此 timeout 虽然离开 active，但没有统一进入“自动拆解与重派”闭环；
- 默认 runner 链路也未显式返回 reaped/follow-up 数，验证可观测性不足。

## 本次修复

### 1) timeout 后默认自动 split/requeue
修改文件：`skills/public/multi-agent-dispatch/dispatch-engine.js`

核心变更：
- 扩展 `deriveTimeoutFollowup()`，由原来仅支持 `restart/replace`，变为覆盖全部 4 类 timeout 决策：
  - `restart` → 生成 `[restart]` follow-up
  - `replace` → 生成 `[replacement]` follow-up
  - `archive` → 生成 `[archive-review]` follow-up
  - `human_handoff` → 生成 `[handoff-package]` follow-up
- 所有派生任务统一携带：
  - `payload.timeoutAutoSplitRequeue = true`
  - `payload.timeoutFollowupFor`
  - `payload.timeoutOriginDecision`
  - `parentTaskId/rootTaskId`

结果：timeout 不再只是“一个被标注过的失败”，而是自动进入下一跳任务。

### 2) 对本轮 4 个 timeout 类型给出可执行 follow-up 派生
4 类 follow-up 现在全部可执行并可重新入调度：

| timeout 决策 | 派生标题 | source | 语义 |
|---|---|---|---|
| restart | `[restart]` | `timeout_restart` | 原任务重启再跑 |
| replace | `[replacement]` | `timeout_replace` | 换实例/换执行轮次重派 |
| archive | `[archive-review]` | `timeout_archive_review` | 审核部分产出、归档/保留、整理可续跑说明 |
| human_handoff | `[handoff-package]` | `timeout_handoff_package` | 自动整理人工接管包：阻塞点、进度、缺失输入、所需决策 |

注意：这里的“split/requeue”不是机械拆成 N 片，而是 timeout 后**自动派生下一轮可执行任务**并重新进入调度。

### 3) 接进调度技能默认链路
修改文件：`skills/public/multi-agent-dispatch/dispatch-runner.js`

变更：
- 默认 `drainAndRun()` 中保留原有 `engine.reapStale(); engine.drain();` 链路；
- 增加返回字段：
  - `reaped`
  - `reapedFollowups`

效果：
- runner 每轮先 reap stale timeout；
- reap 过程中自动生成派生任务；
- 这些 follow-up 会立即进入 `onDispatchBridge` / pending / spawn 的默认调度链路；
- 最小验证里已证明 runner 能直接接住 timeout follow-up 并继续派发。

### 4) 最小验证
新增测试：`skills/public/multi-agent-dispatch/test/timeout-auto-split-requeue.min.test.js`

覆盖：
1. `restart` timeout → 自动派生 follow-up，原任务离开 active；
2. `replace` timeout → 自动派生 follow-up，原任务离开 active；
3. `archive` timeout → 自动派生 `[archive-review]`；
4. `human_handoff` timeout → 自动派生 `[handoff-package]`；
5. `dispatch-runner` 默认链路能 reap + republish + spawn timeout follow-up。

执行结果：

```bash
node skills/public/multi-agent-dispatch/test/timeout-governance.min.test.js
node skills/public/multi-agent-dispatch/test/timeout-auto-split-requeue.min.test.js
```

均通过。

## 影响面
- timeout 语义从“终点状态描述”升级为“闭环恢复入口”；
- 所有 4 类 timeout 决策都能自动产出下一步任务；
- 不需要人工再额外盯住 timeout 项去补派；
- runner/bridge 默认链路即可承接。

## 风险与边界
- `archive/human_handoff` 的 follow-up 目前是“可执行打包/审查任务”，不是直接调用外部人工系统；
- 若后续希望更强语义，可把 `timeout_archive_review` / `timeout_handoff_package` 对接专门 handler 或主 agent 规范模板；
- 当前保持最小侵入，不改 gateway，不改总调度架构。

## 产出文件
- `skills/public/multi-agent-dispatch/dispatch-engine.js`
- `skills/public/multi-agent-dispatch/dispatch-runner.js`
- `skills/public/multi-agent-dispatch/test/timeout-auto-split-requeue.min.test.js`
- `reports/timeout-auto-split-requeue-rootfix-2026-03-08.md`
