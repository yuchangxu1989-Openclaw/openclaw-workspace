# Benchmark Runner / Timeout 根因治理（2026-03-07）

## 根因定位

在 `principle-e2e-spec/scripts/` 下两个 runner 脚本中发现 **3 个根因**：

### RC-1: subprocess.run 无 timeout — 可无限挂起（已修复 ✅）
- **文件**: `benchmark_runner.py` → `run_closed_book()` 
- **问题**: 调用 `closed_book_gate.py` 的 `subprocess.run()` 没有 `timeout` 参数。如果 gate 进程卡死（如模型通道超时、I/O hang），runner 会无限等待。
- **修复**: 增加 `timeout=30` 秒，超时返回结构化 `GATE_TIMEOUT` 错误而非挂起。

### RC-2: 回归测试 subprocess.run 无 timeout（已修复 ✅）
- **文件**: `test_capability_regression.py` → `run_case()`
- **问题**: 调用 `benchmark_runner.py` 的 `subprocess.run()` 同样无 `timeout`。如果单个 case 卡死，整个回归测试集不会终止。
- **修复**: 增加 `timeout=60` 秒，超时抛出带 case_id 的 `AssertionError`。

### RC-3: Case list 输入导致 AttributeError 崩溃（已修复 ✅）
- **文件**: `benchmark_runner.py` → `evaluate_case()`
- **问题**: `--case` 参数如果传入一个 JSON 数组文件（case list），`case_obj.get()` 会抛出 `AttributeError: 'list' object has no attribute 'get'`，退出码为 1 但无有效产出。
- **修复**: 在 `evaluate_case()` 入口增加 `isinstance(case_obj, dict)` 校验，非 dict 输入返回结构化 FAIL 裁决，包含清晰的错误提示。

## 变更清单

| 文件 | 变更 |
|------|------|
| `principle-e2e-spec/scripts/benchmark_runner.py` | 版本 1.1.0→1.2.0；增加 `GATE_TIMEOUT_SECONDS=30`；`run_closed_book()` 加 timeout + TimeoutExpired 处理；`evaluate_case()` 加 list-input guard |
| `principle-e2e-spec/scripts/test_capability_regression.py` | 增加 `RUNNER_TIMEOUT_SECONDS=60`；`run_case()` 加 timeout + TimeoutExpired 处理 |

## 验证结果

```
✅ capability regression suite passed
✅ principle-e2e capability regression + smoke passed
✅ list-input guard: 传入 case 列表文件 → 返回结构化 FAIL（不再 crash）
✅ timeout guard: subprocess.TimeoutExpired 正确捕获
```

## 与前序报告关系

前序报告（`benchmark-shard-b/c-repickup`、`benchmark-final-aggregation-repickup`）已定位到超时来源于 cron/agentTurn/模型通道层面。本次在 runner 代码层面做了最后一道防线：

- **即使上游（模型/gate）卡死，runner 也不会无限挂起** — 超时后 fail-closed 返回
- **即使调用方误传参数，runner 也不会 crash** — 校验后结构化失败

## 状态

- `benchmark_timeout` 根因治理：**CLOSED** ✅
- 遗留项：PB-001~PB-038 全量逐 case 复跑归档仍需后补（缺源 case 文件）
