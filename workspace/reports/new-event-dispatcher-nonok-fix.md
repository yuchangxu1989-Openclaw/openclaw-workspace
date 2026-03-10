# new-event-dispatcher non-ok 修复报告

- 时间：2026-03-07 00:25 GMT+8
- 目标：处理 heartbeat 报出的 `new-event-dispatcher` 非 ok 问题
- 结论：**当前任务状态本身已恢复为 ok，但历史 non-ok 记录真实存在；主因不是 dispatcher 代码崩溃，而是 cron payload 设计导致 Agent 经常超时/走网络回复链路失败。已直接修复配置以降低再次 non-ok 的概率。**

---

## 1. 现场核查结果

### 1.1 当前 job 状态
从 `/root/.openclaw/cron/jobs.json` 可见：

- job id: `new-event-dispatcher`
- enabled: `true`
- 最近状态：
  - `lastRunStatus: ok`
  - `lastStatus: ok`
  - `consecutiveErrors: 0`

说明 heartbeat 报的是**历史上的 non-ok 事件**，不是当前仍卡在 error。

### 1.2 历史 run 记录中的真实 non-ok
检查 `/root/.openclaw/cron/runs/new-event-dispatcher.jsonl`，统计到历史 non-ok 共 30 条，类型如下：

- `cron: job execution timed out`：26 次
- `Unhandled stop reason: network_error`：3 次
- `⚠️ ✉️ Message failed`：1 次

这说明它的非 ok **主要不是 dispatcher 业务失败**，而是：

1. Agent 没有稳定地“直接执行命令后快速返回”；
2. 任务说明是自然语言，模型会额外解释、分析、甚至尝试消息发送；
3. 在 60s timeout 下，容易被拖到超时；
4. 某些 run 还走到了消息/网络链路，导致 `message failed` 或 `network_error`。

---

## 2. 对 dispatcher 本体的验证

直接执行：

```bash
node /root/.openclaw/workspace/infrastructure/dispatcher/fast-check.js
node /root/.openclaw/workspace/infrastructure/dispatcher/dispatcher.js
```

现场结果：

- fast-check 返回：发现 8 条可能未消费事件
- dispatcher 返回：`Done: 8 dispatched, 0 failed, 0 skipped`

说明：

- `fast-check.js` 可运行；
- `dispatcher.js` 可运行；
- 当前事件分发主链路不是“起不来”，而是能正常消费事件。

所以 heartbeat 的 non-ok **根因不在 dispatcher 主程序已坏**。

---

## 3. 进一步发现的噪音问题

检查 `manual-queue.jsonl` 发现大量历史遗留：

- `git.pre_commit.detected`
- 报错：`No handler found for action: git.pre_commit.detected`

但当前 `routes.json` 已经把 `git.pre_commit.detected` 映射到 `log-action`，且 `handlers/log-action.js` 文件也存在。

这批 manual-queue 主要是**旧失败遗留噪音**，不是本次 heartbeat non-ok 的直接主因。它会制造“系统看起来一直有异常”的错觉，但不会解释那 26 次 timeout——timeout 的直接原因仍是 cron payload/Agent 行为不够收敛。

---

## 4. 已执行修复

直接修改了 `/root/.openclaw/cron/jobs.json` 中 `new-event-dispatcher` 的配置：

### 修复前
- payload 是自然语言多步骤说明；
- 允许模型自由组织执行与输出；
- timeoutSeconds = `60`

### 修复后
将 payload message 收敛为“**直接执行命令，不要额外分析/不要通知/不要写报告**”的硬约束，并明确输出格式：

```text
执行事件调度器（直接命令执行，不要做额外分析）：
cd /root/.openclaw/workspace && node infrastructure/dispatcher/fast-check.js && node infrastructure/dispatcher/dispatcher.js

要求：
1. 直接执行上面的命令。
2. 若 fast-check 显示无事件/跳过，则仅回复 HEARTBEAT_OK。
3. 若 dispatcher 执行成功，则仅用一行回复：DISPATCH_OK dispatched=<n> failed=<n> skipped=<n>。
4. 不要发送消息、不要额外解释、不要写报告、不要调用任何通知工具。
```

并把：

- `timeoutSeconds` 从 `60` 下调到 `45`

### 这样修的目的
不是“给它更多时间”，而是反过来：

- 减少模型自由发挥；
- 强制它只做命令执行；
- 避免走消息发送链路；
- 避免长篇总结导致 token/网络风险；
- 让失败更快暴露，而不是拖到 60s 才 timeout。

---

## 5. 根因结论

`new-event-dispatcher` 的 heartbeat non-ok，真实原因是：

> **cron 任务本质上是一个“应当直接执行脚本”的任务，却被设计成依赖 LLM 按自然语言自行理解执行。**
> 在这个设计下，任务会偶发出现：
> - 执行超时
> - 网络 stop reason
> - 消息发送失败

而不是 dispatcher.js 本体持续损坏。

换句话说：

- **业务链路**：基本可用
- **调度脚本**：可跑通
- **non-ok 主因**：cron payload 过于 agentic，导致执行不确定性过高

---

## 6. 修复后的状态判断

当前 job state 已是：

- `lastStatus = ok`
- `consecutiveErrors = 0`

且本次已完成配置收敛修复。后续若再出现非 ok，优先排查两类：

1. cron-worker 模型/网络层波动；
2. dispatcher 事件量突增导致 45s 内跑不完。

若后续仍频繁抖动，下一步建议是把这个 cron 从“agentTurn 自然语言执行”改成**纯脚本入口 cron**，彻底去掉 LLM 解释层。

---

## 7. 本次变更文件

- 已修改：`/root/.openclaw/cron/jobs.json`
- 已输出报告：`/root/.openclaw/workspace/reports/new-event-dispatcher-nonok-fix.md`

---

## 8. 最终结论

本次已完成：

- 查明真实原因：**历史 non-ok 主要由 timeout / network_error / message failed 构成，主因是 cron payload 设计，而非 dispatcher 主程序当前损坏**
- 可直接修的部分已修：**收敛 `new-event-dispatcher` 的 payload 与 timeout 配置**
- 报告已写入指定文件

状态：**已提交修复**
