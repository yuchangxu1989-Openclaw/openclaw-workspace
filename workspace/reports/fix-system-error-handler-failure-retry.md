# fix-system-error-handler-failure-retry

## 结论
已重试并修复 `system.error` 遗留项：**路由能命中，但 dispatcher 执行 handler 失败/空跑**。

## 真实失败点
不是 `routes.json` 本身匹配失败，而是：

- `infrastructure/dispatcher/routes.json` 中将 `system.error` 路由到 `notify-alert`
- 但 `infrastructure/dispatcher/handlers/` 目录下**没有** `notify-alert.js`
- dispatcher 执行层实际优先从 dispatcher handlers 目录解析 handler
- 因此出现：**route hit，但 handler 无法在 dispatcher 执行层被正确加载**

仓库中虽然存在真正实现：

- `infrastructure/event-bus/handlers/notify-alert.js`

但 dispatcher 路径没有同名桥接文件，导致 Day2 所说“命中但执行失败”仍然残留。

## 修复内容
新增桥接别名文件：

- `infrastructure/dispatcher/handlers/notify-alert.js`

内容是最小 alias：

```js
module.exports = require('../../event-bus/handlers/notify-alert');
```

这样不改动现有实现，只补齐 dispatcher 执行层的 handler 解析路径。

## 最小验证
新增最小单测：

- `tests/unit/system-error-route.test.js`

验证点：

1. dispatcher alias 文件存在
2. 调用 `infrastructure/dispatcher/dispatcher.js` 对 `system.error` 执行 dispatch
3. 返回 `success === true`
4. 实际向 `infrastructure/logs/alerts.jsonl` 追加一条记录
5. 最后一条记录包含：
   - `handler: "notify-alert"`
   - `eventType: "system.error"`

执行结果：

```bash
node tests/unit/system-error-route.test.js
# => system.error notify-alert alias test: ok
```

## 变更文件
- `infrastructure/dispatcher/handlers/notify-alert.js`
- `tests/unit/system-error-route.test.js`

## 备注
在排查中发现 `infrastructure/event-bus/dispatcher.js` 另有独立问题：某些规则（如 `rule.knowledge-must-be-executable-001`）在 `system.error` 上会因 context 缺失触发 `knowledge-executable` 的 `logger.info` 报错。但这不是本次 Day2 遗留项的真实失败点；本次修复聚焦于 **dispatcher route hit → handler load failure** 的主问题，并已最小验证通过。
