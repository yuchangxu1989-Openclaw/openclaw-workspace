# Fill Keys with Debt Lane 12 Report

**Date**: 2026-03-08
**Lane**: 12
**Task**: 补位扩列 12：针对当前剩余系统债务，直接执行并产出有效结果。优先处理评测/调度/发布/规则固化相关遗留，避免只写分析。

## 本次直接执行结果

本轮没有停留在分析，已直接补上一个明显的评测/调度固化债务：**benchmark 仅支持单 case 文件，遇到 case-list JSON 会 fail closed，但缺少正式 batch runner 与回归固化**。

这会导致：
- 调度侧若直接把整份 case 列表喂给 `benchmark_runner.py`，只能得到 `INPUT_VALIDATION` 失败
- 发布/评测流水线若想对整组用例做统一跑批，需要额外脚本拼接，契约不统一
- 当前仓库已有 08/10 两类 case-list 文件，但缺少正式的批量入口，属于评测调度层遗留债务

## 已完成改动

### 1. 新增批量评测入口

新增文件：
- `principle-e2e-spec/scripts/batch_benchmark_runner.py`

功能：
- 接受 `--cases <json数组文件>`
- 对每个 case 自动拆分成临时单 case 文件
- 逐条调用现有 `benchmark_runner.py`
- 汇总输出 batch summary JSON
- 保持 fail-closed 语义：**只要任一 case FAIL，batch exit code = 2**

批量汇总输出包含：
- `batch_verdict`
- `counts.SUCCESS / SKIP / FAIL`
- 每条 case 的 `case_id / returncode / verdict / gates_applied`

这相当于把“评测调度”从手工拼 case 提升为可程序化批跑。

---

### 2. 新增 batch runner 回归测试

新增文件：
- `principle-e2e-spec/scripts/test_batch_benchmark_runner.py`

覆盖场景：
1. `08-capability-test-cases.json + capability_runtime_pass.json`
   - 预期 batch SUCCESS
   - 验证存在 SUCCESS / SKIP，且 FAIL=0
2. `10-pb010-hardened-cases.json + pb010_runtime_pass.json`
   - 预期 batch FAIL
   - 因 `pb010-dispatch-002-loophole-block` 为故意负例，确认 batch 能正确 fail-closed
3. `10-pb010-hardened-cases.json + pb010_runtime_fail.json`
   - 预期 batch FAIL
   - 验证 fail runtime 下出现多条 FAIL

这一步把“批量评测能力”从一次性脚本变成了**有回归保护的正式能力**。

---

### 3. 固化到统一回归入口

更新文件：
- `principle-e2e-spec/scripts/run_regression.sh`

现状已纳入统一回归链路：
1. hard-gate self tests
2. capability regression
3. pb010 hardened regression
4. **batch benchmark regression**
5. benchmark smoke
6. publish silence watchdog regression

说明：
- 这次不仅补了评测批跑，还确认该能力已经被统一回归脚本覆盖
- 回归链路同时还串上了发布侧 watchdog 测试，符合“评测/调度/发布/规则固化”优先方向

## 实测验证

执行命令：

```bash
bash principle-e2e-spec/scripts/run_regression.sh
```

实测结果：**全链路通过**。

关键输出摘要：

```text
[1/6] hard-gate self tests
... 10 passed, 0 failed ...

[2/6] capability regression
✅ capability regression suite passed

[3/6] pb010 hardened regression
✅ PB-010 hardened benchmark contract: ALL CHECKS PASSED

[4/6] batch benchmark regression
✅ batch benchmark runner regression passed

[5/6] benchmark smoke

[6/6] publish silence watchdog regression
✅ publish silence watchdog regression passed

✅ hard-gate + principle-e2e capability + PB-010 hardened + batch regression + smoke + publish watchdog passed
```

## 额外确认的债务闭环

我还直接验证了一个实际误用场景：

```bash
python3 ./principle-e2e-spec/scripts/benchmark_runner.py \
  --case ./principle-e2e-spec/10-pb010-hardened-cases.json \
  --runtime ./principle-e2e-spec/examples/pb010_runtime_pass.json \
  --out /tmp/bad.out.json
```

结果会返回：
- `case_obj` 是 `list`
- `INPUT_VALIDATION` fail-closed
- 明确提示应使用 batch runner，而不是把 case-list 直接喂给单 case runner

因此本次新增 batch runner 不是“锦上添花”，而是在补**真实存在的评测调度断点**。

## 产出文件

- `principle-e2e-spec/scripts/batch_benchmark_runner.py`
- `principle-e2e-spec/scripts/test_batch_benchmark_runner.py`
- `principle-e2e-spec/scripts/run_regression.sh`（已纳入 batch regression）
- `reports/fill-keys-with-debt-lane-12-2026-03-08.md`

## 结论

本 lane 已实际消化一项系统债务：

**把 benchmark 从“仅支持单 case 的局部评测脚本”，补成“支持 case-list 批量调度、具备 fail-closed 汇总、已纳入统一回归”的正式评测能力。**

这项补位直接改善了：
- 评测：整组 case 可正式跑批
- 调度：统一批量入口，避免手工拆 case
- 规则固化：batch 结果继承单 case hard gate / fail-closed 语义
- 发布前校验：已接入回归主入口，后续变更不易回退
