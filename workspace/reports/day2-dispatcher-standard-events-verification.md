# Day2 收口补 lane 验证结果

时间：2026-03-07 18:55 GMT+8

## 变更项

1. 在 `infrastructure/event-bus/dispatcher.js` 中补齐标准失败事件化：
   - `dispatcher.route.failed`
   - `dispatcher.handler.failed`
   - `dispatcher.manual_queue.enqueued`
2. 将上述标准事件接入 `global-event-escalation`：
   - 更新 `infrastructure/dispatcher/routes.json`
   - 将 3 个 dispatcher 标准事件纳入 `route.global-p1-system-signals-001`
3. 更新验证脚本 `infrastructure/event-bus/verify-global-event-escalation.js`
   - 覆盖 system warning/error/risk/check.failed
   - 覆盖 dispatcher 未命中 route 场景
   - 输出 auto-repair task/review/manual-queue 统计

## 实际验证

### A. global-event-escalation 主链验证
执行：
- `node infrastructure/event-bus/verify-global-event-escalation.js`

结果摘要：
- `routesLoaded = 1`
- `stats.dispatched = 6`
- `taskCount = 24`
- `reviewCount = 24`
- `routeFailedCount = 2`
- `manualQueueEntries = 496`

说明：
- system.warning / system.error / system.risk / system.check.failed 均成功进入 `global-event-escalation`
- `day2.unrouted.event` 成功沉淀为 `dispatcher.route.failed`
- 由 `global-event-escalation` 自动生成 repair/review 闭环记录

### B. handler failure 场景补测
执行：
- 构造临时 rule：`day2.handler.failure.test -> missing-day2-handler`

结果：
- Dispatcher 日志显示：`Handler missing-day2-handler failed: handler_not_found:missing-day2-handler`
- `stats.failed = 1`
- 当前任务库中最近 dispatcher 标准事件仍只观察到 `dispatcher.route.failed`

结论：
- `dispatcher.handler.failed` / `dispatcher.manual_queue.enqueued` 已在代码路径中接入
- 但本次补测未在最终任务库中观察到对应闭环 task，说明 bus/dispatcher 的递归标准事件链在该失败路径上仍存在落库不完整现象
- `dispatcher.route.failed` 已完成标准事件化并成功接入 escalation

## 当前判断

### 已完成
- route failure 标准事件化：完成
- route failure 接入 global-event-escalation：完成
- handler failure / manual queue 标准事件定义与代码接入：完成

### 未完全闭环
- `dispatcher.handler.failed`
- `dispatcher.manual_queue.enqueued`

这两个事件在“handler not found”场景下，代码已 emit，但验证结果尚未稳定落到 escalation task store。

## 建议后续一拍

继续补一个小修：
1. 将 `_emitStandardEvent()` 改为显式 await/直连 dispatcher dispatch（而非仅依赖 bus fire-and-forget）或提供 test-mode flush；
2. 为 `dispatcher.handler.failed` 与 `dispatcher.manual_queue.enqueued` 增加独立断言测试；
3. 最终拿到三类标准事件全量 task/review 证据后即可关 lane。
