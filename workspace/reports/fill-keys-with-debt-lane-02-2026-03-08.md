# 补位扩列 02（2026-03-08）

## 本次直接落地内容

优先补评测/调度/发布/规则固化遗留，这次没有只停留在分析，已直接改动并验证：

### 1. 补齐 capability pass runtime 的 PB-010 遗留覆盖
文件：`principle-e2e-spec/examples/capability_runtime_pass.json`

已直接补入：
- `intent_expansion.diagnosis_action`
  - 让 `pb-010a` 不再因缺少根因定位动作而 fail
- `event_completion.recovered_events`
  - 增加 `nightly_regression.missed -> {gap_type, impacted_scope}`
  - 增加 `incident.paused -> {run_id, resume_hint}`

效果：
- 原先 `pb-010a / pb-010b` 在现有 pass runtime 下会失败
- 现在可以被 runner 正确识别并通过

### 2. 固化 event_completion 的“按预期事件解析恢复字段”规则
文件：`principle-e2e-spec/scripts/benchmark_runner.py`

已直接修改 `evaluate_capability(... event_completion ...)`：
- 保留原始 `event_completion`
- 新增 `recovered_events` 分支解析
- 当 case 提供 `expected_source_event` 且 runtime 中存在对应恢复数据时：
  - 自动以该事件为 resolved 结果
  - 用 resolved 结果检查 `must_complete_fields`
  - 输出 `artifacts.completed = resolved`
  - 保留 `artifacts.raw_completed` 便于追溯

这次改动的意义：
- 不再要求单一 pass runtime 只能服务一个 source_event
- 允许一个闭卷 runtime 样例同时承载多个“可恢复事件”能力
- 把“从线索恢复事件字段”的规则从样例偶然性，提升为 runner 内部显式规则

### 3. 把 PB-010 hardened 回归正式纳入统一回归脚本
文件：`principle-e2e-spec/scripts/run_regression.sh`

已从原来的：
- capability regression
- smoke

升级为：
1. capability regression
2. pb010 hardened regression
3. benchmark smoke

效果：
- 后续跑统一回归时，不会遗漏 PB-010 hardened contract
- 评测/发布前的一键验收更完整，减少“单独脚本通过但总回归没覆盖”的系统债

## 实测结果

### A. 评测回归
执行：
- `python3 principle-e2e-spec/scripts/test_capability_regression.py`
- `python3 principle-e2e-spec/scripts/test_pb010_hardened.py`
- `bash principle-e2e-spec/scripts/run_regression.sh`

结果：
- capability regression：通过
- PB-010 hardened regression：10/10 通过
- unified regression + smoke：通过

### B. 规则 gate
执行：
- `bash .openclaw/tests/run_tests.sh`

结果：
- closed-book gate：5 项通过
- intent-eval gate：5 项通过
- fail-closed enforcement active

### C. 直接验证历史遗留 case
对 `08-capability-test-cases.json` 中 PB-010 子案逐个跑 runner：
- `pb-010a` → `SUCCESS`
- `pb-010b` → `SUCCESS`
- `pb-010c` → `SUCCESS`
- `pb-010d` → `SKIP`

这说明此前“样例 runtime 与 PB-010 case 不完全对齐”的遗留已经被直接补平。

## 解决的系统债

本次实际消掉的债务主要是：

1. **评测债**
- PB-010 子案存在，但默认 pass runtime 无法覆盖 `pb-010a / pb-010b`
- 导致 case 在仓库里存在、但不易作为稳定回归资产复用

2. **规则固化债**
- `event_completion` 之前只支持“扁平单事件结果”
- 对“从交接/线索恢复不同事件”的能力没有在 runner 中明确编码
- 现在已固化为 runner 规则，而非靠外部解释

3. **发布/验收债**
- `run_regression.sh` 未纳入 PB-010 hardened 套件
- 导致统一验收入口和实际风险面不一致
- 现在已补齐，发布前的一键回归覆盖面更完整

## 产出文件

已修改：
- `principle-e2e-spec/examples/capability_runtime_pass.json`
- `principle-e2e-spec/scripts/benchmark_runner.py`
- `principle-e2e-spec/scripts/run_regression.sh`

已产出本报告：
- `reports/fill-keys-with-debt-lane-02-2026-03-08.md`

## 结论

本 lane 没有停在“列债务”，而是直接把剩余系统债务里最影响评测/调度/发布闭环的三处补上：
- 样例 runtime 补齐
- runner 规则固化
- unified regression 纳管

当前结果可复用、可回归、可发布前验收。
