# 全局自主决策流水线监控总仪表盘
- 生成时间: 2026-03-07T05:10:37.634Z
- 观察窗口: 最近 24 小时
- 总状态: 🟡 WARNING

## 总览
- 决策记录总计: 1853
- 执行层决策数: 1490
- 管道运行次数: 226
- 分发动作总计: 1934 (来源: dispatcher-actions.jsonl)
- 效果观测次数: 5
- 健康采样次数: 1

## 数据源状态
- decisions_jsonl: ✅
- run_log_jsonl: ✅
- dispatcher_actions_jsonl: ✅
- metrics_jsonl: ✅
- runtime_metrics: ⚠️ 无数据
- auto_response_jsonl: ✅
- health_jsonl: ✅

## 🟢 cognition
- 状态: healthy
- total: 363
- avg_confidence: 0.95
- degradation_rate: 0
- top_components: [["Dispatcher",1462],["ISCRuleMatcher",361],["L3Gateway",10],["l3-pipeline",8],["L3Alerts",8]]

## 🟢 decision
- 状态: healthy
- total: 361
- avg_confidence: 1
- degradation_rate: 0
- methods: {"rule_match":1831,"manual":20,"llm":2}

## 🟡 execution
- 状态: warning
- execution_decisions: 1490
- pipeline_runs: 226
- dispatch_total: 1934
- dispatch_source: dispatcher-actions.jsonl
- dispatch_success: 4
- dispatch_failed: 0
- dispatch_errors_in_runlog: 245
- run_error_rate: 42.48
- success_rate: 80
- avg_latency_ms: 0

## 🟡 effect
- 状态: warning
- observed: 5
- window_hours: 72
- escalations: 3
- auto_fix_candidates: 1
- log_and_monitor: 1
- categories: {"security":2,"critical_insight":1,"quality":1,"unknown":1}

## 🟡 system_health
- 状态: warning
- warnings: []
- errors: []
- latest: {"ts":"2026-03-05T23:25:09.060Z","eventId":"evt_mme3f0kr_fsv45q","type":"system.health.request","source":"test","status":"unknown","checks":["cpu","memory","disk","load","process","eventbus","pipeline","breaker","decision","flags"]}
- window_hours: 72
- unhealthy_samples: 1
- l3: {"eventbus":{"emitted":0,"processed":0,"dropped":0,"drop_rate":0,"status":"healthy"},"eventbus_backlog":{"total_events":1,"consumers":2,"status":"healthy"},"pipeline":{"total":0,"success":0,"failed":0,"timeout":0,"retry":0,"success_rate":100,"avg_latency_ms":0,"p95_latency_ms":0,"status":"healthy"},"breaker":{"trips":0,"status":"healthy"},"decision":{"total":397,"avg_confidence":1,"degradation_count":0,"degradation_rate":0,"by_phase":{"execution":{"count":50,"avg_confidence":1},"cognition":{"count":347,"avg_confidence":1}},"status":"healthy"},"flags":{"total_flags":22,"changes_from_default":0,"changed_flags":[],"status":"info"}}
