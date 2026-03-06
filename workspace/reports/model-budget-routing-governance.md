# Model Budget Routing Governance

时间：2026-03-07 00:10 GMT+8

## 结论

已直接把“默认 `gpt-5.4`、`Opus` 仅用于非常重要架构设计 / 疑难杂症”固化进可执行代码，而不是只写文档。

本次修改后：

- 未显式指定模型的任务，会**自动落到 `codex/gpt-5.4`**。
- 显式请求 `claude-opus-4-20250514` 的任务，若**不满足严格门槛**，会被**强制降级到 `codex/gpt-5.4`**。
- 约束结果会写入任务状态与 pending dispatch 记录中的 `governance` 字段，具备**可审计性**。
- 已补充自动化测试，验证默认路由、Opus 降级、Opus 放行、bridge 持久化治理元数据四类行为。

## 扫描结果：当前仍存在的 Opus 滥用风险

### 1. 任务派发层此前没有硬约束
涉及文件：

- `skills/public/multi-agent-dispatch/dispatch-engine.js`
- `skills/public/multi-agent-dispatch/dispatch-bridge.js`
- `infrastructure/dispatcher/dispatcher.js`

问题：

- 之前 `makeTask()` 基本是“来什么 model 就收什么 model”。
- `dispatch-bridge` 会把任务直接写进 `pending-dispatches.json`，没有预算治理。
- `dispatcher.js` 虽可切到新 `DispatchEngine`，但之前没有把 bridge 强制挂进去做治理透传。

这意味着：

- 任何把 `model` 填成 Opus 的任务，都可能直接进入待派发队列。
- “默认 gpt-5.4”只是约定，不是约束。

### 2. 测试与示例里仍能看到 Opus 被普通任务使用
典型命中：

- `skills/public/multi-agent-dispatch/test/activation-validation.js`
- `skills/public/multi-agent-dispatch/test/live-chain-validation.js`
- `skills/public/multi-agent-reporting/test/trigger-integration.test.js`

这些更多是测试/展示数据，不等于生产必然滥用，但说明系统此前**没有禁止机制**。

### 3. 报表与状态文件出现过 `opus-4`
例如：

- `skills/public/multi-agent-dispatch/state/live-validation-report.json`

这说明历史运行里 Opus 已进入任务链路，不是理论风险。

## 已实施的硬约束修改

### A. 新增模型治理模块
新文件：

- `skills/public/multi-agent-dispatch/model-governance.js`

核心策略：

- 默认模型：`codex/gpt-5.4`
- Opus 模型：`claude-opus-4-20250514`
- Opus 放行必须同时满足：
  1. `priority === critical`
  2. 任务语义命中“架构设计”或“疑难杂症/深度排障”
  3. 具备最小长度 justification
  4. 不属于文档、总结、普通写作、普通编码、demo、样板等低价值任务

输出接口：

- `chooseGovernedModel(task)`
- `applyModelGovernance(task)`

### B. 在 DispatchEngine 入队时强制治理
修改文件：

- `skills/public/multi-agent-dispatch/dispatch-engine.js`

已改动：

- `makeTask(input)` 不再直接信任 `input.model`
- 现在统一先过 `applyModelGovernance(input)`
- 任务记录中新增：
  - `governance`
  - `dispatchAttempts`
  - `lastDispatchAt`

效果：

- 即使调用方传入 Opus，只要不符合规则，任务状态里保存的就是 `gpt-5.4`
- 后续状态文件、live board、调度记录都能看到治理结果

### C. 在 dispatch bridge 持久化治理结果，防止派发时绕过
修改文件：

- `skills/public/multi-agent-dispatch/dispatch-bridge.js`

已改动：

- bridge 现在会保留并写出：
  - `requestedModel`
  - `model`（治理后的最终模型）
  - `governance`
  - `payloadForSpawn.governance`
- 如果上游任务已经带治理结论，则 bridge 复用，不再重算覆盖

效果：

- 待派发文件 `pending-dispatches.json` 中可以直接审计：
  - 原始请求模型是什么
  - 最终执行模型是什么
  - 为什么被降级 / 放行

### D. 在 dispatcher 接入 bridge，形成实际生效链路
修改文件：

- `infrastructure/dispatcher/dispatcher.js`

已改动：

- `DispatchEngine` 初始化时挂载：
  - `onDispatch: (task) => onDispatchBridge(task, _dispatchEngine)`

效果：

- 当 `DISPATCH_ENGINE=new/dual` 使用新调度引擎时，治理会沿实际调度路径生效
- 不再是“引擎内部治理了，但 dispatcher 不透传”

## 可验证约束

不是文档约束，而是代码约束：

1. **默认模型强制为 `codex/gpt-5.4`**
2. **非 critical 的 Opus 请求一律降级**
3. **即使是 critical，也必须是架构/疑难杂症且有 justification 才能用 Opus**
4. **治理结果进入任务状态与 pending dispatch 文件，可审计**
5. **测试已覆盖关键约束**

## 自动化验证结果

执行：

```bash
node ./node_modules/jest/bin/jest.js skills/public/multi-agent-dispatch/test/dispatch-engine.test.js --runInBand
```

结果：通过

- 30 passed, 30 total

新增验证点：

- `defaults missing model to gpt-5.4`
- `downgrades opus for non-critical ordinary tasks`
- `allows opus only for critical architecture with justification`
- `pending dispatch preserves downgraded model and governance metadata`

## 本次实际修改文件

- `skills/public/multi-agent-dispatch/model-governance.js` （新增）
- `skills/public/multi-agent-dispatch/dispatch-engine.js`
- `skills/public/multi-agent-dispatch/dispatch-bridge.js`
- `skills/public/multi-agent-dispatch/test/dispatch-engine.test.js`
- `infrastructure/dispatcher/dispatcher.js`

## 风险与剩余项

### 已解决

- 新调度链路上，Opus 不再能被随意请求并直接执行。
- 默认模型不再依赖口头约定。

### 仍建议后续继续收口

1. 扫描 `agents/*/models.json` 是否把 Opus 设成 agent 默认模型
   - 我看到这些文件当前也有未提交变更：
     - `../agents/main/agent/models.json`
     - `../agents/writer/agent/models.json`
     - `../agents/reviewer/agent/models.json`
     - 等
   - 这次我没有直接篡改那些外层 agent 配置，避免误伤当前未完成工作树；但从预算治理角度，下一步应统一把 agent 默认首选改成 `gpt-5.4`，仅保留显式升级入口。

2. 补充一个 repo 级审计脚本
   - 定期扫描状态文件 / pending dispatch / session spawn 参数中的 Opus 使用次数
   - 对不满足 policy 的任务直接告警

3. 若主链路仍大量走旧 `DispatchLayer`
   - 那么旧链路还可能绕开这套治理
   - 当前我已确保 `dispatcher.js` 在启用新 `DispatchEngine` 时走治理链
   - 若你要彻底封堵，下一步应继续对旧 dispatch path 加同样的 model governance

## 结论摘要

这次不是“写一份规范”，而是把预算治理塞进了真实派发链路：

- 默认：`gpt-5.4`
- Opus：仅 critical + 架构/疑难杂症 + justification 才放行
- 否则：强制降级
- 有测试
- 有状态审计字段
- 已接入 dispatcher → dispatch engine → pending dispatch 链
