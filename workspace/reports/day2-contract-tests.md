# Day 2: L3 模块间接口契约测试报告

**日期**: 2026-03-05  
**状态**: ✅ 全部通过 (32/32)

## 概要

对 L3 基础设施的 7 个核心模块进行了接口契约测试，验证模块间数据流的格式兼容性。

| 指标 | 值 |
|------|-----|
| 测试总数 | 32 |
| 通过 | 32 |
| 失败 | 0 |
| 覆盖模块对 | 9 组 |

## 测试覆盖的模块

| 模块 | 源码 | 关键接口 |
|------|------|---------|
| EventBus | `event-bus/bus-adapter.js` | emit(type, payload, source, metadata), consume(options) |
| IntentScanner | `intent-engine/intent-scanner.js` | scan(conversationSlice) → {intents, decision_logs, skipped} |
| ISCRuleMatcher | `rule-engine/isc-rule-matcher.js` | match(event), evaluate(rule, event), process(event) |
| Dispatcher | `dispatcher/dispatcher.js` | dispatch(rule, event, options) → {success, handler, duration} |
| L3Pipeline | `pipeline/l3-pipeline.js` | run() → {run_id, consumed_events, matched_rules, ...} |
| DecisionLog | `decision-log/decision-logger.js` | log(entry), query(opts), summarize(timeRange) |
| FeatureFlags | `config/feature-flags.js` | get(flag), isEnabled(flag), reload() |

## 契约测试分组

### Group 1: EventBus → IntentScanner (4 tests) ✅
验证 EventBus 事件能正确转换为 IntentScanner 的 conversationSlice 格式。
- 文本 payload (`text`/`content`/`message`) → 单条切片
- messages 数组直接透传
- 空 payload → 空切片（IntentScanner 返回 `skipped: true`）
- metadata（chain_depth, trace_id）在转换过程中保持可访问

### Group 2: IntentScanner → EventBus (2 tests) ✅
验证 IntentScanner 的意图结果能正确 re-emit 到 EventBus。
- 意图事件类型格式 `user.intent.{id}.inferred` 符合 EventBus.emit 契约
- 意图事件类型能被 EventBus 通配符模式匹配（`user.intent.*`、`*.inferred`）

### Group 3: IntentScanner → RuleMatcher (2 tests) ✅
验证 IntentScanner 产出的意图事件能被 RuleMatcher 匹配。
- 意图事件有完整的 event shape（type, payload, timestamp, source）
- RuleMatcher 的前缀通配 `user.intent.*` 能正确匹配意图事件
- confidence 范围 [0, 1] 一致

### Group 4: RuleMatcher → Dispatcher (3 tests) ✅
验证 RuleMatcher 的匹配结果能直接传给 Dispatcher 执行。
- `match()` 输出的 `{ rule, priority, match_type, pattern }` 是 Dispatcher 的有效输入
- `process()` 输出的完整结果（含 evaluation）可在 dispatch 循环中使用
- Dispatcher 处理 ISC 规则包装格式（从 `rule.rule` 提取 action，或回退到 `event.type`）

### Group 5: Pipeline → 所有子模块 (4 tests) ✅
验证 Pipeline 调用每个子模块的参数格式正确。
- Pipeline → EventBus.consume: `{ since }` 参数符合契约
- Pipeline → RuleMatcher.process: 直接传递 EventBus 事件
- Pipeline → IntentScanner.scan: 4 种 payload 格式全部正确转换
- Pipeline → Dispatcher.dispatch: 规则和事件格式匹配

### Group 6: 所有模块 → DecisionLog (8 tests) ✅
验证所有模块的日志条目格式符合 DecisionLog 契约。
- IntentScanner: `phase='sensing', component='IntentScanner'`
- RuleMatcher: `phase='cognition', component='ISCRuleMatcher'`
- Dispatcher: `phase='execution', component='Dispatcher'`
- Pipeline: `phase='execution', component='l3-pipeline'`
- 无效 phase/confidence/decision_method 被正确拒绝
- query 按 component 过滤功能正常

### Group 7: FeatureFlags → Pipeline (4 tests) ✅
验证 FeatureFlags 返回值类型与 Pipeline 期望一致。
- 所有 `*_ENABLED` flag 返回 boolean
- `L3_CIRCUIT_BREAKER_DEPTH` 返回 number
- `isEnabled()` 与 `get()` 返回值一致
- 默认值与 Pipeline 代码中的假设匹配

### Group 8: 跨模块事件 Schema 一致性 (3 tests) ✅
- EventBus emit → consume 往返保持事件结构完整
- RuleMatcher 直接接受 EventBus 事件格式
- Dispatcher 直接接受 EventBus 事件格式

### Group 9: RuleMatcher evaluate → Dispatcher (2 tests) ✅
- evaluate() 返回标准 `{ shouldFire, reason }` 结构
- 无条件规则默认返回 `shouldFire: true`

## 产出物

| 文件 | 描述 |
|------|------|
| `tests/contracts/event-bus.contract.json` | EventBus 接口契约 |
| `tests/contracts/intent-scanner.contract.json` | IntentScanner 接口契约 |
| `tests/contracts/rule-matcher.contract.json` | ISCRuleMatcher 接口契约 |
| `tests/contracts/dispatcher.contract.json` | Dispatcher 接口契约 |
| `tests/contracts/pipeline.contract.json` | L3Pipeline 接口契约 |
| `tests/contracts/decision-log.contract.json` | DecisionLog 接口契约 |
| `tests/contracts/feature-flags.contract.json` | FeatureFlags 接口契约 |
| `tests/contracts/contract-tests.js` | 契约测试代码 (32 tests) |
| `tests/contracts/contract-test-results.json` | 机器可读测试结果 |

## 发现的设计注意点

1. **RuleMatcher 的 `_loaded` 守卫**: `match()` 方法内部会检查 `_loaded`，未加载时自动调用 `loadRules()`。如果手动设置 `rules` 数组后不标记 `_loaded=true`，调用 `match()` 会覆盖已设置的规则。这是防御性设计，但在测试场景中需要注意。

2. **EventBus metadata 透传方式**: bus-adapter 将 metadata 作为 `payload._metadata` 存入旧 bus，consume 时提取到顶层 `metadata` 字段。这是适配层的实现细节，下游模块应通过 `event.metadata` 访问。

3. **Dispatcher 的 ISC 规则包装**: Dispatcher 同时支持扁平 `{ action }` 和 ISC 包装 `{ rule: ISC_RULE, priority, match_type }` 两种格式，通过内部归一化处理。这意味着 RuleMatcher 的输出可以直接传入 Dispatcher 无需转换。

4. **所有模块对 DecisionLog 的使用一致**: 三种 phase（sensing/cognition/execution）覆盖了完整的 OODA 感知-认知-执行链路，每个模块使用正确的 phase 标签。
