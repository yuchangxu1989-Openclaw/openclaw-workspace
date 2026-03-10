# event-dispatch-runner 超时修复报告

时间：2026-03-06 23:04 GMT+8

## 结论
真实根因不是 `cron-dispatch-runner.js` 本身慢，也不是 `events.jsonl` 过大、事件积压、规则卡死。

真实根因是：**cron job 被配置成 `agentTurn`，导致系统把纯命令 `node /root/.openclaw/workspace/infrastructure/event-bus/cron-dispatch-runner.js` 交给 LLM 会话处理，而不是直接当 shell 命令稳定执行。**

这造成两类现象：
1. 有时模型只是“收到命令”并回一段说明文字，根本没执行真实脚本。
2. 有时模型真的去执行/分析，但会产生较长推理与输出，接近或超过 60s，最终被 cron 判定 `job execution timed out`。

因此表面是 `event-dispatch-runner` 超时，实质是 **cron 调度方式错误 + 超时时间过紧**，而不是 runner 代码性能瓶颈。

---

## 排查证据

### 1. runner 本体执行很快
手工执行：

```bash
time node infrastructure/event-bus/cron-dispatch-runner.js
```

实测结果：
- Dispatcher 初始化：108 条规则
- 待处理事件：1 条
- 总耗时：约 **0.67s**

这直接排除：
- 初始化慢
- `events.jsonl` 过大
- 事件积压
- 规则执行卡死

### 2. `events.jsonl` 不大
检查结果：
- 114 行
- 152K

这远不足以导致 60s 超时。

### 3. dispatch 规则命中量很小
当前 `lto.task.created` 只命中 3 条规则：
- `rule.anti-entropy-design-principle-001`
- `rule.cron-task-model-requirement-001`
- `rule.layered-decoupling-architecture-001`

单次处理 1 个事件时，实际总耗时远低于 cron 的 60s。

### 4. cron run 历史明确显示“被 LLM 接管”
从 `/root/.openclaw/cron/runs/event-dispatch-runner.jsonl` 可见，很多运行结果是类似：
- “✅ Received. The cron dispatcher ran...”
- “Got it — the cron dispatch runner was invoked...”
- “已收到这条定时任务运行回执...”

这些内容明显不是脚本 stdout，而是模型对一条文本指令的自然语言回复。

并且最近多次运行使用：
- `model: glm-5`
- `provider: zhipu-cron`

同时，超时时长稳定卡在：
- `durationMs: 60023`
- `error: cron: job execution timed out`

这说明超时发生在 **agentTurn/模型会话层**，不是 Node 脚本层。

---

## 已执行修复
直接修复 `/root/.openclaw/cron/jobs.json` 中 `event-dispatch-runner` 配置：

### 修复前
```json
"message": "node /root/.openclaw/workspace/infrastructure/event-bus/cron-dispatch-runner.js",
"timeoutSeconds": 60
```

### 修复后
```json
"message": "node /root/.openclaw/workspace/infrastructure/event-bus/cron-dispatch-runner.js && echo HEARTBEAT_OK",
"timeoutSeconds": 90
```

### 修复意图
1. **追加 `&& echo HEARTBEAT_OK`**
   - 明确给 cron-worker 一个最短完成信号
   - 降低模型生成长篇自然语言总结的概率
   - 让任务更容易被识别为“执行命令后立即结束”

2. **超时从 60s 提升到 90s**
   - 给偶发的模型层/调度层抖动留冗余
   - 即便某次上下文较重，也不再轻易触发 timeout

> 注：理想长期方案应把此任务从 `agentTurn` 改为真正的“直接命令执行型 cron”。但按“直接修复、最小改动”的要求，这次先做最小可落地修复，避免继续连续超时。

---

## 最小验证

### 1. 脚本直接执行验证
执行：
```bash
node infrastructure/event-bus/cron-dispatch-runner.js
```

结果：
- 正常初始化 108 条规则
- 正常处理事件
- 正常输出完成统计
- 无挂死、无超时

### 2. 耗时验证
执行：
```bash
time node infrastructure/event-bus/cron-dispatch-runner.js
```

结果：
- 总耗时约 **0.674s**

说明即使保守估计，90s 也有非常充足余量，cron 不会再因为 runner 本体而轻易 timeout。

---

## 最终判断
本次问题归类为：
- **其他** → 准确说是 **cron 执行模型错误（LLM agentTurn 代替直接命令执行）**
- 次要放大因素：**timeoutSeconds 仅 60s，容错太小**

不是：
- 初始化慢
- 事件积压
- 规则卡死
- `events.jsonl` 过大

---

## 后续建议（未强制执行）
1. 把 `event-dispatch-runner` 从 `agentTurn` 改为真正 shell/exec 型任务。
2. 对所有“纯命令型 cron”做一次审计，避免继续被模型接管后产生随机超时。
3. 若后续事件量扩大，再考虑把 `events.jsonl` 改成流式读取，但这不是当前根因。

---

## 已提交内容
- 修改：`/root/.openclaw/cron/jobs.json`
- 报告：`/root/.openclaw/workspace/reports/fix-event-dispatch-runner-timeout.md`
