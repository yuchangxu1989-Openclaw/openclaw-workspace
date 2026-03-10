# LLM主基座评测 — 统一评测报告

**生成时间**: 2026-03-07 11:21:55 GMT+8  
**架构版本**: 2026-03-07.llm-primary-intent-gate  
**评测策略**: LLM意图识别主判断链 + 关键词/正则辅助交叉匹配  
**运行环境**: 沙盒/测试环境  

## 🎯 综合端到端成功率（E2E Overall）

> **100.0%** (96/96) — 架构钢印合规: ✅ 通过

## 📊 各轨道评测汇总

| 轨道 | 名称 | 通过 | 总计 | 准确率 | 说明 |
|------|------|------|------|--------|------|
| Track A | 意图识别准确率（LLM Primary） | 10 | 10 | **100.0%** |  |
| Track B | 多轮意图评测（LLM Primary） | 42 | 42 | **100%** | 加载上次LLM运行结果 |
| Track C | 事件/规则生成 Pipeline E2E | 38 | 38 | **100.0%** | 实时运行 |
| Track D | 本地任务编排/CRAS/AEO/LEP 执行链评测 | 6 | 6 | **100.0%** |  |
| Track E | 端到端真实对话评测（real-conv-2026-03-06） | 120 | - | **100.0%** |  |

## Track A — 意图识别准确率（LLM Primary）

- **准确率**: 100.0% (10/10)
- **架构合规**: ✅ 关键词/正则不参与最终裁定
- **评测策略**: llm_primary_keyword_regex_auxiliary
- **架构版本**: 2026-03-07.llm-primary-intent-gate

| 用例ID | 维度 | 结果 | F1 | 架构合规 |
|--------|------|------|----|----------|
| A-RULEIFY-001 | RULEIFY+FEEDBACK复合意图 | ✅ | 1.00 | ✅ |
| A-DIRECTIVE-001 | DIRECTIVE直接指令 | ✅ | 1.00 | ✅ |
| A-QUERY-001 | QUERY状态查询 | ✅ | 1.00 | ✅ |
| A-FEEDBACK-001 | FEEDBACK负向反馈 | ✅ | 1.00 | ✅ |
| A-REFLECT-001 | REFLECT反思复盘 | ✅ | 1.00 | ✅ |
| A-IMPLICIT-001 | 隐含多意图（催办场景） | ✅ | 1.00 | ✅ |
| A-ARCH-001 | LLM主判断链架构对齐（关键词不命中但语义明确） | ✅ | 1.00 | ✅ |
| A-GUARD-001 | 闲聊防护（不产生误识别） | ✅ | 1.00 | ✅ |
| A-COMPOSITE-001 | RULEIFY+DIRECTIVE复合意图 | ✅ | 1.00 | ✅ |
| A-THRESHOLD-001 | 低置信度过滤（单字/短句） | ✅ | 1.00 | ✅ |

## Track B — 多轮意图评测

- **数据集**: 多轮对话 42 条会话
- **最新运行结果**: 100% (42 样本)
- **最新运行时间**: 2026-03-07T05:56:29.286Z
- **说明**: 多轮LLM评测需实时API；最新结果来自 multi-turn-benchmark-2026-03-07.json

## Track C — 事件/规则生成 Pipeline E2E

- **E2E正确率**: 38/38
- **规则匹配**: 38/38
- **熔断保护**: 6/6
- **平均延迟**: 2734.1ms

## Track D — 本地任务编排/CRAS/AEO/LEP 执行链

- **链路准确率**: 100.0% (6/6)

| 执行阶段 | 通过 | 总计 |
|----------|------|------|
| 本地任务编排 | 1 | 1 |
| CRAS | 1 | 1 |
| AEO | 1 | 1 |
| LEP | 1 | 1 |
| FULL_CHAIN | 1 | 1 |
| ARCH_STAMP | 1 | 1 |

## Track E — 端到端真实对话覆盖（120 cases）

- **E2E成功率**: 100.0% (120/120)
- **维度覆盖**: 16 个维度

| 类别 | 通过 | 总计 | 成功率 |
|------|------|------|--------|
| actually_enabled | 4 | 4 | 100.0% |
| capability_missed | 6 | 6 | 100.0% |
| consistency | 10 | 10 | 100.0% |
| cron_judgment | 8 | 8 | 100.0% |
| dispatch_trigger | 7 | 7 | 100.0% |
| error_correction | 14 | 14 | 100.0% |
| follow_up_chain | 7 | 7 | 100.0% |
| global_state | 8 | 8 | 100.0% |
| intent_event_chain | 8 | 8 | 100.0% |
| proactive_dispatch | 7 | 7 | 100.0% |
| progress_report | 10 | 10 | 100.0% |
| risk_identification | 6 | 6 | 100.0% |
| rule_effectiveness | 8 | 8 | 100.0% |
| self_repair | 9 | 9 | 100.0% |
| tool_missed | 4 | 4 | 100.0% |
| urging | 4 | 4 | 100.0% |

## 🔒 架构钢印确认

> **钢印原则**（永久有效）：无LLM意图识别作为主基座的评测，不按"通过"汇报。

| 原则 | 状态 |
|------|------|
| LLM意图识别为主判断链 | ✅ 已执行 |
| 关键词/正则仅辅助交叉匹配 | ✅ usedForFinalDecision=false |
| 只在沙盒/测试环境运行 | ✅ SANDBOX_MODE 已确认 |
| 端到端成功率独立汇报 | ✅ E2E Overall: **100.0%** |
