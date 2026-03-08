# Intent routing gap closeout

## 变更目标
补齐剩余关键意图事件的真实消费路径，优先修复：
- `intent.ruleify`
- `intent.reflect`
- `intent.directive`
- `aeo_evaluation_required`

遵循最小改动原则：优先复用现有 routes / handlers / bridges，仅补一层缺失接线。

## 实际改动

### 1) Dispatcher routes 增补
文件：`infrastructure/dispatcher/routes.json`

新增三条精确路由：
- `intent.ruleify` → `intent-event-handler`
- `intent.reflect` → `intent-event-handler`
- `intent.directive` → `intent-event-handler`

效果：不再落入 `no_route` / manual queue。

### 2) 新增最小真实消费 handler
文件：`infrastructure/dispatcher/handlers/intent-event-handler.js`

实现三类消费路径：
- `intent.ruleify`
  - 在 `skills/isc-core/rules/` 下生成最小可执行规则草案 JSON
  - 具备去重（同 target/summary hash）
- `intent.reflect`
  - 复用 `skills/cras/event-bridge.js#analyzeRequest`
  - 将 reflect 内容送入 CRAS 洞察沉淀路径
- `intent.directive`
  - 复用 `skills/dto-core/event-bridge.js#createTaskFromEvent`
  - 直接生成 本地任务编排 task 文件与 `dto.task.created` 事件

### 3) 修复 `aeo_evaluation_required` 的 handler 解析缺口
文件：`infrastructure/event-bus/dispatcher.js`

最小增强 `_resolveHandlerPath()`：
- 现有逻辑只会在 `infrastructure/event-bus/handlers/` 下找 handler
- 规则里像 `skill-isc-handler` / `skill-cras-handler` / `skill-dto-handler` 这类真实 handler 实际位于 `infrastructure/dispatcher/handlers/`
- 新增 fallback：若 event-bus handlers 未命中，再去 `infrastructure/dispatcher/handlers/` 查找

效果：
- `aeo_evaluation_required` 命中 N023/N024 后，不再只停留在 `log-action`
- 能进入真实 skill handler 路径

## 最小验证

### 路由验证
- 之前日志存在大量：
  - `intent.ruleify → none (no_route)`
  - `intent.reflect → none (no_route)`
  - `intent.directive → none (no_route)`
- 现在 routes 已有精确匹配项，dispatcher 可命中真实 handler

### handler 存在性验证
- 新增文件存在：`infrastructure/dispatcher/handlers/intent-event-handler.js`
- 复用 bridge 已存在：
  - `skills/dto-core/event-bridge.js` 导出 `createTaskFromEvent`
  - `skills/cras/event-bridge.js` 导出 `analyzeRequest`
  - `skills/isc-core/event-bridge.js` 导出 `checkRulesFromEvent`

### `aeo_evaluation_required` 路径验证
- 既有日志表明此前 N023/N024 仅执行到了 `log-action`
- 现在 event-bus dispatcher 能解析到 `infrastructure/dispatcher/handlers/skill-isc-handler.js`
- 因而 `aeo_evaluation_required` 已具备真实消费通路，而非仅记录报告

## 风险与边界
- `intent.ruleify` 当前生成的是“最小规则草案”，不是全自动高质量规则工程化；但它已是**真实消费路径**，不再停留在报告或人工队列。
- `intent.reflect` 当前通过 CRAS `analyzeRequest()` 进入洞察沉淀，属于最小闭环。
- `intent.directive` 当前落 本地任务编排 task，后续是否执行由 本地任务编排 体系负责。

## 提交说明
已按要求直接修改；如工作区允许，建议提交信息：
`fix(dispatcher): close remaining intent routing gaps and wire aeo_evaluation_required to real handlers`
