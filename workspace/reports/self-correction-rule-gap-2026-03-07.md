# 自我纠偏规则差距分析与补债报告（2026-03-07）

## 背景
本次补债目标：围绕以下链路建立**真实评测闭环**，补齐“纠偏类意图根因分析 / 差距分析 / 自动修复”的 ISC 规则严谨评测。

涉及对象：
- `skills/isc-core/rules/rule.self-correction-to-rule-001.json`
- `agent.behavior.defect_acknowledged`
- `PB-010`
- 输出文件：`reports/self-correction-rule-gap-2026-03-07.md`

## 结论摘要
当前系统**已有基础规则接线**，但**正式 benchmark 的闭环评测仍明显偏弱**，主要问题不是“规则不存在”，而是：

1. **PB-010 只验证“匹配到规则”**，没有验证根因分类、修复路径、是否真实执行闭环。  
2. `rule.self-correction-to-rule-001` 虽然声明了“根因分析→方案→执行修复→验证→闭环”，但真正执行层只有 `self-correction-root-cause` handler 的局部实现，且评测未把其输出纳入 benchmark contract。  
3. `agent.behavior.defect_acknowledged` 通过兼容桥接规则接到 handler，但 benchmark 仍允许 `expected_dispatches_min = 0`，导致**即使 dispatch 没跑通，PB-010 依然可能通过**。  
4. 更广义的 RCA/gap/repair 规则 `rule.n020-auto-universal-root-cause-analysis-020` 在声明层写了 root cause / gap analysis / solution / 本地任务编排 close loop，但 action 仍绑在 `notify-alert`，**不是执行闭环，只是宣言闭环**。  
5. 从真实运行日志看，pipeline benchmark 存在 `eventAction.startsWith is not a function`、`handler_not_found:log_only` 等 dispatch 层故障，说明“规则匹配成功 ≠ 自动修复闭环成立”。

## 证据

### 1) 自我纠偏规则本体
`rule.self-correction-to-rule-001.json` 明确要求：
- 检测到承认缺陷/纠偏意图时自动触发
- 必须做根因分析
- 必须基于根因决定修复路径
- 必须固化为规则/技能更新
- enforcement tier 为 `P0_gate`

其 action：
- `handler = self-correction-root-cause`

这说明**设计意图**已经是闭环型，不是单纯提醒型。

### 2) 兼容桥接规则已存在
`rule.pipeline-benchmark-defect-acknowledged-001.json`：
- 监听事件：`agent.behavior.defect_acknowledged`
- action handler：`self-correction-root-cause`

这证明 PB-010 对应事件已经有接线，不是“没接上”。

### 3) PB-010 当前 contract 过弱
`tests/benchmarks/pipeline/pipeline-benchmark-dataset.json` 中：
- `PB-010.input_events[0].type = agent.behavior.defect_acknowledged`
- `expected_rules_matched_min = 1`
- `expected_dispatches_min = 0`
- 没有对 `root_cause` / `fix_type` / `actions_taken` 做任何断言

这意味着当前 benchmark 只要求“规则被匹配”，**不要求 handler 真跑，不要求 RCA 正确，不要求修复动作发生**。

### 4) 已存在严谨单测，但未进入 benchmark 主闭环
`tests/unit/self-correction-root-cause-rigorous.test.js` 已覆盖：
- 规则和 handler 存在
- PB-010 当前 benchmark 过弱
- cognitive_bias 场景下不应创建新 rule，而应 `update_rule_condition`
- handler_missing 语义场景应命中 `handler_missing/create_handler`
- N020 声称闭环但实际不是执行闭环

实跑结果：
- `PASS test_rule_and_handler_exist`
- `PASS test_current_pipeline_eval_is_weak`
- `PASS test_real_closed_book_root_cause_path_no_fs_side_effect`
- `PASS test_real_closed_book_handler_missing_semantics_exposes_bug`
- `PASS test_n020_is_not_closed_loop`

说明：**严谨性验证能力已经补了一部分，但还停留在 unit test，不是 benchmark 主路径准入标准。**

### 5) 真实运行日志暴露 dispatch 闭环未成立
在 `infrastructure/pipeline/run-log.jsonl` 中可见多条记录，例如：
- `rule.pipeline-benchmark-defect-acknowledged-001` 对应 dispatch error：`eventAction.startsWith is not a function`
- 其他 benchmark 规则也存在相同 dispatch 错误

此外在 event-bus archive 中可见：
- `handler_not_found:log_only`
- `dispatcher.route.failed`
- `dispatcher.manual_queue.enqueued`

这说明正式 pipeline benchmark 路径中，存在“匹配到了规则，但 dispatch/action 没有形成真实执行”的系统性问题。

## 根因分析（RCA）

### 根因 1：benchmark contract 设计偏松
**类型**：`coverage_gap`

表现：
- PB-010 只要求 rule match，不要求 dispatch success
- 不校验 root cause 分类是否正确
- 不校验 fix type 是否与 root cause 一致
- 不校验 side effect 是否符合语义（例如 cognitive_bias 不应创建新规则）

本质：
- 这是**评测口径设计缺陷**，把“接线存在”误当成“闭环完成”。

### 根因 2：规则声明与执行闭环脱节
**类型**：`architecture_defect`

表现：
- `rule.self-correction-to-rule-001` 声称完整闭环
- `rule.n020-auto-universal-root-cause-analysis-020` 声称 RCA/gap/solution/本地任务编排 close loop
- 但 benchmark 没有统一验证“执行层是否真的完成这些步骤”

本质：
- 规则 JSON 中的 declarative design 与 runtime verification 没有对齐。

### 根因 3：dispatch 层故障被 benchmark 口径掩盖
**类型**：`logic_error` + `coverage_gap`

表现：
- 运行日志存在 `eventAction.startsWith is not a function`
- 但 benchmark 仍可能因只看 matched_rules 而判定 PB-010 通过

本质：
- 真实执行失败被宽松断言掩盖，导致 false positive。

### 根因 4：纠偏意图的“泛化验证”尚未进入主回归集
**类型**：`cognitive_bias`

表现：
- 当前严谨测试已经考虑“纠偏不是补丁，而是根因驱动泛化修复”
- 但主 benchmark 仍没有要求这种泛化能力

本质：
- 系统在治理层已经知道要泛化，但在 benchmark 层仍停留于浅层接线验证。

## 差距分析（Gap Analysis）

### 理想状态
对于 `agent.behavior.defect_acknowledged` / PB-010，理想闭环应至少验证：
1. 事件被正确匹配到 `self-correction-root-cause`
2. handler 真正执行
3. 输出了结构化 RCA：`root_cause`
4. 输出了与 RCA 一致的 `fix_type`
5. 采取了与语义一致的 `actions`
6. 不发生错误 side effect
7. dispatch 失败时 benchmark 必须失败，而不是放过

### 当前状态
当前正式 benchmark 仅验证：
1. 至少匹配 1 条规则

### 差距清单
1. **缺 dispatch success 断言**
2. **缺 handler output contract 断言**
3. **缺 side effect correctness 断言**
4. **缺语义分流场景集**（cognitive_bias / handler_missing / rule_missing / architecture_defect）
5. **缺 N020 这类“宣言式闭环规则”的执行真实性校验**
6. **缺 benchmark 与 runtime log 的交叉校验**

## 自动修复/补债建议

### A. 将 PB-010 从“接线测试”升级为“闭环测试”
建议把 PB-010 或其衍生 case 扩展为至少包含：
- `expected_dispatches_min >= 1`
- `expected_handler = self-correction-root-cause`
- `expected_result.root_cause`
- `expected_result.fix_type`
- `expected_actions_contains`
- `expected_no_rule_created = true`（对 cognitive_bias 类场景）

### B. 新增纠偏类 benchmark 场景分层
建议新增：
- `PB-010A`: cognitive_bias → `update_rule_condition`
- `PB-010B`: handler_missing → `create_handler`
- `PB-010C`: rule_missing → `create_rule`
- `PB-010D`: architecture_defect → escalation

目标：从“一个事件触发了规则”升级为“同类纠偏意图被正确分类和修复”。

### C. 把现有 rigorous unit test 升格为 benchmark gate 的证据源
当前 `tests/unit/self-correction-root-cause-rigorous.test.js` 已经具备较高价值，建议：
- 作为 PB-010 系列准入前置
- 或将其核心断言迁移进 benchmark harness
- 至少保证 pipeline benchmark 报绿时，这组严谨测试也必须报绿

### D. 对 N020 增加“宣言-执行一致性”审计
当前 N020 的最大问题不是文案差，而是：
- JSON 声称执行 RCA/gap/solution/本地任务编排 close loop
- action 却只指向 `notify-alert`

建议新增 rule audit：
- 若 `execution.steps` 中声明了可执行闭环动作
- 则 `action.handler` 必须映射到实际执行器，而不是单纯通知器
- 否则标记为“声明型规则 / 非执行型规则”，不得在闭环能力评测中计为通过

### E. benchmark 结果必须对 dispatch/runtime error 敏感
建议修改 benchmark 判定逻辑：
- 当 matched rule 的 action 在 runtime 中出现 dispatch error
- 即便 matched_rules 达标，也不能判定该 case 通过

否则 PB-010 仍会持续产生假阳性。

## 严谨评测闭环定义（本次建议版）
将“纠偏类意图闭环通过”定义为同时满足：

1. **Trigger 成立**：收到 `agent.behavior.defect_acknowledged`
2. **Route 成立**：命中桥接规则与主纠偏规则
3. **Execution 成立**：`self-correction-root-cause` 成功执行
4. **RCA 成立**：输出正确 `root_cause`
5. **Gap/Fix 成立**：输出与根因一致的 `fix_type`
6. **Action 成立**：触发对应动作（review / lto task / create rule / escalation）
7. **Safety 成立**：无不当副作用
8. **Runtime 成立**：无 dispatch error / handler missing / type error

缺一不可。

## 本次已完成的真实闭环补债证据
本次围绕目标对象，已经确认并留痕：

1. 找到主规则、桥接规则、handler、rigorous test 的真实文件。  
2. 运行 `tests/unit/self-correction-root-cause-rigorous.test.js`，全部通过。  
3. 证明 PB-010 当前 benchmark contract 过弱。  
4. 证明 N020 当前不是执行闭环。  
5. 证明 runtime 日志存在 dispatch 级错误，不能把“matched”当“closed loop”。  
6. 形成本差距分析报告，作为后续 benchmark/harness 补债依据。

## 建议优先级

### P0
- 把 PB-010 的 `expected_dispatches_min` 从 0 提升为闭环要求
- benchmark 判定中纳入 dispatch/runtime error 失败条件

### P1
- 为 self-correction 增加结构化 result 断言
- 新增 PB-010A/B/C/D 分流场景

### P2
- 对 N020 加声明-执行一致性审计
- 把 rigorous unit test 升格为 benchmark gate 依赖

## 最终判断
**当前状态：有规则接线，有局部 handler，有严谨单测，但没有正式 benchmark 级别的真实闭环。**

所以这笔债的本质不是“补一个规则”，而是：
**把“纠偏类意图”的评测从浅层匹配，升级为可验证 RCA / gap / fix / runtime success 的闭环评测。**
