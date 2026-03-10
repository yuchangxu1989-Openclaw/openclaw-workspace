# Memory-loss-proof 评测扩充报告（2026-03-08）

## 任务结论
已直接把“记忆丢失后还能扛住并快速找回”相关评测用例补进 `principle-e2e-spec`，并且补的是**可程序运行**的 case、runtime fixture、回归脚本断言，不是纯说明。

## 实际改动

### 1) 扩充评测 case 文件
文件：`principle-e2e-spec/08-capability-test-cases.json`

新增 3 个与 memory-loss / handoff / recovery 直接相关的用例：
- `p2e-ext-005`：记忆丢失后，意图扩充必须先做 `state_reconstruction`，再做 `resume_action`
- `p2e-ext-006`：记忆缺口下，从交接线索恢复事件入口，要求补全 `source_event` 与 `run_id`
- `p2e-ext-007`：记忆丢失后的任务扩列，必须覆盖 `state_rebuild` / `execution_resume` / `verification`

同时为这些 case 增加了 `expected.dataset_weighting.must_prioritize_dimensions`，以适配仓库里已经存在的 `DATASET-WEIGHTING-HARDENING` 硬门。

### 2) 扩充可运行 runtime fixture
文件：
- `principle-e2e-spec/examples/capability_runtime_pass.json`
- `principle-e2e-spec/examples/capability_runtime_fail_missing_outputs.json`

补充了：
- pass fixture 中的 recovery 相关 capability outputs：
  - `intent_expansion` 里的 `state_reconstruction`、`resume_action`
  - `event_completion` 里的 `run_id`
  - `task_expansion` 里的 `state_rebuild`、`execution_resume`、额外 `verification`
- pass fixture 中的 `dataset_weighting.prioritized_dimensions`
- fail fixture 中空/缺失的输出与空的 `dataset_weighting`，用于 fail-closed 断言

### 3) 扩充程序化回归脚本
文件：`principle-e2e-spec/scripts/test_capability_regression.py`

新增对 `p2e-ext-005/006/007` 的程序化断言：
- PASS runtime 下必须通过
- FAIL runtime 下必须 fail-closed
- 精确校验 recovery 相关 kind / field：
  - `state_reconstruction`
  - `resume_action`
  - `run_id`
  - `state_rebuild`
  - `execution_resume`
  - `verification`

## 运行验证
已执行：

```bash
cd /root/.openclaw/workspace-coder/principle-e2e-spec
python3 scripts/test_capability_regression.py
```

结果：

```text
✅ capability regression suite passed
```

## 为什么这次改动算“直接补债”
这次不是只写文档，而是把“失忆后别硬编、先重建状态、再恢复执行、最后校验”的要求固化成了：
- 可被 runner 读取的 benchmark case
- 可被脚本消费的 pass/fail runtime fixture
- 可被 CI/人工复跑的 regression test

也就是说，后续如果有人把“记忆丢失后的恢复链”做坏：
- 要么在 `CAP-INTENT_EXPANSION`
- 要么在 `CAP-EVENT_COMPLETION`
- 要么在 `CAP-TASK_EXPANSION`
- 要么在 `DATASET-WEIGHTING-HARDENING`

会直接红。

## 备注
调试过程中发现本仓库当前 `benchmark_runner.py` 比最开始看到的版本更“硬化”，除了 capability gate 之外，还额外启用了 `DATASET-WEIGHTING-HARDENING`。因此最终落地时，我顺手把新增 case 对齐到了这个硬门，不然新增用例会因为权重维度声明不全而假失败。
