# fix-intent-ruleify-reflect-directive-routes

## 目标
修复 Day2 未收口项中的 P0：`intent.ruleify` / `intent.reflect` / `intent.directive` 仍然 no-route。

## 本次最小改动

### 1) 补齐真实消费 handler
文件：`infrastructure/dispatcher/handlers/intent-event-handler.js`

已将三个 intent 事件补成真实消费路径：

- `intent.ruleify`
  - 生成 `skills/isc-core/rules/rule.intent-*.json` 规则草案
  - 额外发出 `isc.rule.created`，让后续 ISC/本地任务编排 链路可继续消费
- `intent.reflect`
  - 调用 `skills/cras/event-bridge.js#analyzeRequest`
  - 真实落到 CRAS 洞察沉淀路径
- `intent.directive`
  - 调用 `skills/dto-core/event-bridge.js#createTaskFromEvent`
  - 真实在 本地任务编排 `tasks/` 下创建任务

同时增加了最小 jsonl 落盘：
- `infrastructure/logs/intent-event-handler.jsonl`

### 2) 路由保持最小改动
`infrastructure/dispatcher/routes.json` 已存在：
- `intent.ruleify -> intent-event-handler`
- `intent.reflect -> intent-event-handler`
- `intent.directive -> intent-event-handler`

因此本次不再扩展新路由文件，只修正 handler 的“真消费能力”。

## 最小验证
新增测试：`tests/unit/intent-event-handler.test.js`

覆盖点：
1. `intent.ruleify` 会创建 ISC 规则草案，并 emit `isc.rule.created`
2. `intent.reflect` 会进入 CRAS analyze bridge
3. `intent.directive` 会进入 本地任务编排 task create bridge

执行结果：

```bash
node tests/unit/intent-event-handler.test.js
```

输出：

```text
✅ intent.ruleify creates rule draft and emits isc.rule.created
✅ intent.reflect routes into CRAS analysis bridge
✅ intent.directive routes into 本地任务编排 task creation bridge
```

## 结果判断
本次修复后，这三个事件不再停留在 no-route / 只写报告：
- `intent.ruleify` → 真生成规则草案并发出下游事件
- `intent.reflect` → 真进入 CRAS 分析
- `intent.directive` → 真创建 本地任务编排 任务

## 提交
本次直接提交。