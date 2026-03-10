# 基操类任务自动扩列 / 自动派生 / 立即执行全局固化：验收闭环补齐

- 日期：2026-03-07
- 范围：`infrastructure/dispatcher/handlers/dev-task-handler.js`
- 目标：把“基操类任务自动扩列 / 自动派生 / 立即执行全局固化”这个超时项补成**可验收闭环**，并给出最小可复验验证材料。

## 本次结论

已补齐闭环验证，当前链路可以验收：

1. 用户消息经 `basic-op-policy` 命中“基操类任务”信号；
2. `dev-task-handler` 接收 `context.basicOp` 后，立即派生可执行 sibling tasks；
3. 通过 `DispatchEngine.enqueueBatch()` **立即入队并触发 drain**，状态从 `queued` 直接推进到 `spawning`；
4. 同时发出：
   - `intent.directive`
   - `workflow.requested`
5. handler 返回结构化 `auto_expand` 结果，可直接作为验收回执。

## 代码观察

目标文件已有主体实现，无需再改 handler 逻辑本体：

- `buildDispatchTask(...)`
  - 将派生任务统一包装为 `source: 'user-message-auto-expand'`
  - 自动打上 `basic-op-auto-expand`、任务类型等 tags
  - payload 中固化：
    - `parentEventId`
    - `eventType`
    - `autoExpand: true`
    - `derivedKind`

- `handle(event, context)`
  - 从 `context.basicOp` 读取：
    - `shouldExpand`
    - `derivedTasks`
    - `signal`
  - `shouldExpand === true` 时：
    - 批量构造 dispatch tasks
    - `engine.enqueueBatch(dispatchTasks)`
    - emit `intent.directive`
    - emit `workflow.requested`
    - 返回 `action: 'dev_task_auto_expanded'`
    - 返回 `auto_expand.enqueuedTaskIds / statuses / derivedCount`

这说明“实现”本身已经具备，之前缺的是**明确验收用例**，导致超时项没有闭环证据。

## 本次补齐内容

新增测试文件：

- `tests/unit/dev-task-handler-basic-op-auto-expand.test.js`

覆盖两个关键验收场景。

### 场景 A：命中基操类任务时自动扩列并立即执行

输入模拟：

- 文本包含：
  - `基操类任务`
  - `自动扩列`
  - `自动派生`
  - `立即执行`
  - `补正式钢印/规则`
  - `接入 ISC / 意图 / 事件 / 执行链`
  - `补最小验证形成验收闭环`

断言点：

1. handler 返回：
   - `status = handled`
   - `action = dev_task_auto_expanded`
   - `auto_expand.enabled = true`
   - `derivedCount = 3`
2. 派生任务已经进入 dispatch engine：
   - `queued = 0`
   - `spawning = 3`
3. 任务标题正确带序号：
   - `补正式钢印/规则 [1/3]`
   - `接入 ISC / 意图 / 事件 / 执行链 [2/3]`
   - `补最小验证 [3/3]`
4. 任务 payload 已固化来源链路：
   - `source = user-message-auto-expand`
   - `payload.autoExpand = true`
   - `payload.parentEventId = evt-basic-op-001`
5. 事件总线闭环信号已发出：
   - `intent.directive`
   - `workflow.requested`

### 场景 B：非基操类请求不误触发扩列

输入模拟：

- `做一个简单网页展示产品介绍`

断言点：

1. handler 返回：
   - `action = dev_task_created`
   - `auto_expand.enabled = false`
2. dispatch engine 没有新增派生任务：
   - `queued = 0`
   - `spawning = 0`
3. 不发送总线扩列信号。

## 验证命令

```bash
cd /root/.openclaw/workspace
npx jest tests/unit/dev-task-handler-basic-op-auto-expand.test.js --runInBand
```

## 验证结果

```text
PASS tests/unit/dev-task-handler-basic-op-auto-expand.test.js
  dev-task-handler basic-op auto expansion closed loop
    ✓ auto-expands derived tasks, enqueues immediately, and emits closure signals
    ✓ non-basic-op request keeps normal dev task flow without expansion

Test Suites: 1 passed, 1 total
Tests:       2 passed, 2 total
```

## 补充运行证据

对真实文案进行一次 Node 级调用验证，`basic-op-policy` 与 `dev-task-handler` 联动结果如下：

- `basicOp.shouldExpand = true`
- `signal.score = 4`
- `signal.reasons = [basic-op-keyword, batch-cue, executional-cue]`
- `derivedTasks = 3`
- handler 返回：
  - `action = dev_task_auto_expanded`
  - `next_steps = ['derived_tasks_enqueued', 'workflow_requested', 'execute_task', 'validate_output']`
  - `auto_expand.statuses[*].status = spawning`

这说明从“命中策略”到“派生任务入 engine”再到“输出可执行 next steps”，链路是连通的。

## 为什么这次算“可验收闭环”

因为现在已经同时具备：

1. **规则命中证据**：`basic-op-policy.shouldAutoExpandBasicOp()` 命中；
2. **执行证据**：`enqueueBatch()` 后 engine 状态落盘，任务进入 `spawning`；
3. **编排证据**：总线事件 `intent.directive` / `workflow.requested` 被发出；
4. **回执证据**：handler 返回结构化 `auto_expand` 对象；
5. **反例保护**：非基操请求不会误触发。

即：不是“看起来会做”，而是“已经可被测试稳定复验”。

## 交付物

- 验证测试：`tests/unit/dev-task-handler-basic-op-auto-expand.test.js`
- 验收报告：`reports/basic-ops-auto-expansion-2026-03-07.md`

## 建议后续

如果要把这个闭环再往前推进一层，建议补一个 router 级集成测试，直接覆盖：

`user-message-router -> basic-op-policy -> dev-task-handler -> dispatch-engine`

这样可以把当前“handler 级闭环”提升为“路由到执行层的端到端闭环”。
