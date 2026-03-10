# 补位扩列 07：系统债务处理报告（2026-03-08）

## 本次直接执行结果

本轮优先处理了**评测 / 调度 / 发布 / 规则固化**链路里最直接影响可用性的遗留，且已实际执行验证，不是只做分析。

### 1. 修复 capability regression 的 pre-existing fixture 漂移

定位到 `principle-e2e-spec` 已知遗留里提到的老问题：

- case: `p2e-ext-002`
- 期望：`event_completion.expected_source_event = "pull_request.merged"`
- 但 pass runtime fixture 中实际写成：`nightly_regression.missed`

这会导致：

- `test_capability_regression.py` 失败
- `run_regression.sh` 无法全绿
- 评测基线不稳定，影响后续调度/发布前 smoke 信心

### 2. 已执行的代码修复

已直接修复：

- 文件：`principle-e2e-spec/examples/capability_runtime_pass.json`
- 修改项：
  - `capability_outputs.event_completion.source_event`
  - 从 `nightly_regression.missed`
  - 改为 `pull_request.merged`

这属于**fixture 对齐修复**，不是放水：是把 pass fixture 调整回与 case 契约一致。

---

## 验证执行

### A. 回归脚本全量执行

执行：

```bash
bash principle-e2e-spec/scripts/run_regression.sh
```

实际结果：**通过**。

回归项包含：

1. hard-gate self tests
2. capability regression
3. pb010 hardened regression
4. batch benchmark regression
5. benchmark smoke
6. publish silence watchdog regression

终态输出：

```text
✅ hard-gate + principle-e2e capability + PB-010 hardened + batch regression + smoke + publish watchdog passed
```

### B. 单独确认 PB-010 hardened 回归

执行：

```bash
python3 principle-e2e-spec/scripts/test_pb010_hardened.py
```

结果：10/10 通过。

说明此前补强的：

- RCA
- Gap
- Fix
- Dispatch
- loophole block
- backward compatibility

没有被这次修复打坏。

---

## 本次补掉的债务价值

### 已闭环

1. **评测债**
   - 修复 capability pass fixture 漂移
   - 恢复 capability regression 绿色基线

2. **调度/发布前 smoke 债**
   - `run_regression.sh` 现在可作为统一回归入口稳定执行
   - 已覆盖 hard-gate / capability / pb010 / batch / smoke / publish watchdog

3. **规则固化债**
   - 通过实际回归确认：
     - closed-book gate 仍 fail-closed
     - intent-eval gate 仍 fail-closed
     - PB-010 dispatch 最小下限 hardening 仍生效

### 为什么这项优先级高

因为它是“**让已有规则与发布前验证链路真正能跑通**”的阻塞项：

- 不修这个 fixture，整套统一回归入口就是红的
- 红基线会掩盖新的真实故障
- 也会让后续调度/发布动作缺少可信 smoke

---

## 产出文件

本次实际变更：

- `principle-e2e-spec/examples/capability_runtime_pass.json`
- `reports/fill-keys-with-debt-lane-07-2026-03-08.md`

---

## 结论

本次没有停留在分析层，而是直接完成了一项当前系统债务中的**高杠杆阻塞修复**：

- 修复了 capability regression 的 pre-existing fixture 漂移
- 让统一回归入口重新全绿
- 实证确认评测 / 发布 / 规则固化相关链路仍然有效

可作为后续继续清理剩余 benchmark / batch / dispatch 债务的稳定基线。
