# Event Routing Closeout Review

时间：2026-03-06 19:42 GMT+8  
范围：仅基于当前代码与可验证结果做二次验收

## 验收结论

### still-open

1. **P0：`intent.ruleify / intent.reflect / intent.directive` 仍未闭环**
   - 代码现状：Dispatcher 对这 3 类事件匹配结果仍为 0。
   - 可验证结果：
     - `intent.ruleify` / `intent.reflect` / `intent.directive` 在 `Dispatcher._matchRules()` 下均无规则。
     - 历史可见大量 `no_route`：
       - `infrastructure/dispatcher/decision.log`
       - `infrastructure/dispatcher/manual-queue.jsonl`
       - `infrastructure/decision-log/decisions.jsonl`
   - 结论：**这是明确的 P0 未闭环，需要直接点名。**

2. **`system.error` 路由虽命中，但执行闭环未成立**
   - 代码现状：`rule.knowledge-must-be-executable-001` 已监听 `system.error`。
   - 可验证结果：
     - `Dispatcher._matchRules('system.error')` 命中 1 条规则。
     - 但真实 dispatch 时 `knowledge-executable` handler 报错：`Cannot read properties of undefined (reading 'info')`。
     - 根因是 `dispatcher.js` 调 handler 时传入的 context 是 `{}`，而 `knowledge-executable.js` 直接使用 `context.logger` / `context.bus`。
   - 结论：**路由修了，执行没闭环，不能算 fully fixed。**

3. **`aeo_evaluation_required` 只到“被调用”，未到“可用”**
   - 代码现状：命中两条规则：
     - `rule.n023-auto-aeo-evaluation-standard-generation-023`
     - `rule.n024-aeo-dual-track-orchestration-024`
   - 可验证结果：
     - 两条规则都调用 `eval-quality-check`。
     - handler 返回：`未实现该规则检查逻辑`。
   - 结论：**路由存在，但功能仍未实现，属于未闭环。**

### fixed

1. **`intent.detected` 已修复**
   - 代码现状：
     - 规则：`skills/isc-core/rules/rule.semantic-intent-event-001.json`
     - handler：`infrastructure/event-bus/handlers/semantic-intent-event.js`
   - 可验证结果：
     - `Dispatcher._matchRules('intent.detected')` 命中 1 条规则。
     - 实际 dispatch 可执行，handler 返回成功结果。
   - 结论：**fixed**。

2. **`git.commit.completed` 已从 no-route 修到可命中+可执行**
   - 代码现状：
     - 规则：`skills/isc-core/rules/rule.git-commit-dispatch-001.json`
     - handler：`infrastructure/event-bus/handlers/completeness-check.js`
   - 可验证结果：
     - `Dispatcher._matchRules('git.commit.completed')` 命中 1 条规则。
     - 实际 dispatch 成功执行 handler，返回 `56个技能目录完整性检查通过`。
   - 结论：**fixed（至少 no-route P0 已关闭）**。

3. **`threshold.*` 目标事件已修复到可命中+可执行**
   - 覆盖事件：
     - `isc.yellow_light.threshold_crossed`
     - `system.eventbus.size_threshold_crossed`
     - `system.handler.failure_threshold_crossed`
     - `system.eventbus.backlog_threshold_crossed`
   - 代码现状：
     - 规则：`skills/isc-core/rules/rule.threshold-alert-routing-001.json`
     - handler：`infrastructure/event-bus/handlers/notify-alert.js`
   - 可验证结果：
     - 四类事件均能命中同一条规则。
     - 实际 dispatch 至少已验证 `isc.yellow_light.threshold_crossed` 可成功调用 `notify-alert`。
   - 结论：**fixed（P0 no-route 已关闭）**。

### risky

1. **Dispatcher 把很多描述性 `conditions` 当作 `needs_llm` 后默认放行**
   - 现象：`git.commit.completed` 与 `system.error` 验证过程中都出现 `needs_llm` 日志，但仍继续执行。
   - 风险：规则“存在”不等于规则“严格生效”，可能造成误放行。

2. **Dispatcher 对 handler 失败处理过轻，统计上仍可能表现为 executed**
   - 现象：`knowledge-executable` 明确报错，但外围 dispatch 仍记录该 rule 为 `executed`。
   - 风险：会制造“已修复”假象，掩盖真正未闭环问题。

3. **`eval-quality-check` 是假接通，不是能力接通**
   - 现象：`aeo_evaluation_required` 已有路由，但对应规则逻辑未实现。
   - 风险：如果只看 rule match，会误判为关闭；实际上评测链仍是空壳。

4. **现有 E2E 通过不代表本批目标都通过**
   - `tests/e2e-event-pipeline.test.js` 全绿（40 passed），但没有覆盖：
     - `intent.ruleify`
     - `intent.reflect`
     - `intent.directive`
     - `aeo_evaluation_required` 的真实功能结果
     - `system.error` handler 上下文完整性
   - 风险：测试绿灯不能作为本次 closeout 证据。

## 直接点名的 P0

- **P0 未闭环：`intent.ruleify / intent.reflect / intent.directive` 仍然 no-route。**
- 如果本轮 closeout 声称“最新事件链修复已完成”，这个点**不能通过验收**。

## 最小验收命令

```bash
cd /root/.openclaw/workspace

# 1) 看规则是否命中目标事件
node - <<'NODE'
const { Dispatcher } = require('./infrastructure/event-bus/dispatcher');
(async () => {
  const disp = new Dispatcher();
  await disp.init();
  const types = [
    'intent.detected',
    'git.commit.completed',
    'isc.yellow_light.threshold_crossed',
    'system.eventbus.size_threshold_crossed',
    'system.handler.failure_threshold_crossed',
    'system.eventbus.backlog_threshold_crossed',
    'system.error',
    'aeo_evaluation_required',
    'intent.ruleify',
    'intent.reflect',
    'intent.directive'
  ];
  for (const t of types) {
    const m = disp._matchRules(t) || [];
    console.log(JSON.stringify({type:t, matched:m.length, rules:m.map(r=>r.id)}));
  }
})();
NODE

# 2) 跑当前唯一现成的事件链 E2E
node tests/e2e-event-pipeline.test.js

# 3) 抽样验证关键事件真实 dispatch 结果
node - <<'NODE'
const { Dispatcher } = require('./infrastructure/event-bus/dispatcher');
(async () => {
  const disp = new Dispatcher();
  await disp.init();
  await disp.dispatch('git.commit.completed', { categories:['code'] });
  await disp.dispatch('isc.yellow_light.threshold_crossed', { value:1 });
  await disp.dispatch('system.error', { content:'每次发布前必须验证配置；不要盲写代码' });
  await disp.dispatch('aeo_evaluation_required', { skill:'demo' });
  await disp.dispatch('intent.ruleify', { summary:'demo' });
})();
NODE
```

## 本次验收判定

- `intent.detected`: **fixed**
- `git.commit.completed`: **fixed**
- `threshold.*`: **fixed**
- `system.error`: **still-open**
- `intent.ruleify / reflect / directive`: **still-open（且为 P0）**
- `aeo_evaluation_required`: **still-open**

