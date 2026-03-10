# 事件总线 1:N Handler 并发审计（2026-03-10）

**结论：当前 dispatcher 支持同一事件触发多个匹配规则（1:N），并对每条规则内的多个 action 逐个执行，不是只执行第一个匹配 action。**

## 证据（代码引用）

1. 匹配逻辑返回“所有匹配规则”而非首条命中即返回：
   - 文件：`/root/.openclaw/workspace/infrastructure/event-bus/dispatcher.js`
   - 关键代码：
     - `const matched = this._matchRules(eventType);`
     - `_matchRules` 中把 exact / `*` / `domain.*` 命中的规则都 `add` 到 `Set`，最后 `return [...results];`
   - 说明：`Set` 聚合后返回数组，未见“first match only”或 `break`。

2. dispatch 对 matched 做全量遍历执行：
   - 文件：`/root/.openclaw/workspace/infrastructure/event-bus/dispatcher.js`
   - 关键代码：
     - `for (const rule of matched) { ... }`
   - 说明：所有匹配到的规则都会进入执行流程。

3. 每条规则内对 actions 也做全量遍历执行：
   - 文件：`/root/.openclaw/workspace/infrastructure/event-bus/dispatcher.js`
   - 关键代码：
     - `const actions = this._extractActions(rule);`
     - `for (const action of actions) { await this._executeHandler(action, rule, ...); }`
   - 说明：规则内多 action 不是“只取第一个”，而是全部执行（当前为串行 `await`）。

4. 无“首条命中后停止”的控制语句：
   - 文件：`/root/.openclaw/workspace/infrastructure/event-bus/dispatcher.js`
   - 说明：dispatch 主流程中不存在在首个匹配后 `return` / `break` 的路径。

## 修复建议（如需要）

当前无需“1:1 -> 1:N”修复；系统已经是 1:N。若要增强“并发”能力（现在是多 handler 串行执行），可将规则内 action 执行改为 `Promise.allSettled(actions.map(...))`，并保留失败事件上报语义。