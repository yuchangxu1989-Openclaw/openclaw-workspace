# 补位扩列 03：系统债务直执行结果报告

时间：2026-03-08

## 本轮目标
针对当前剩余系统债务，优先补齐 **评测 / 调度 / 发布 / 规则固化** 相关遗留，并直接产出可运行结果，而不是停留在分析。

## 本轮实际执行

### 1. 评测回归入口补齐：把 PB-010 hardened regression 固化进统一回归脚本
已修改：`principle-e2e-spec/scripts/run_regression.sh`

**变更前问题**
- 虽然 `principle-e2e-spec/scripts/test_pb010_hardened.py` 已存在且可运行；
- 但统一回归入口 `run_regression.sh` 只跑：
  - capability regression
  - smoke benchmark
- **PB-010 hardened regression 没有被统一入口覆盖**，这意味着：
  - 本地/CI 只执行 `run_regression.sh` 时，PB-010 相关 contract 可能静默回退；
  - “规则已补”但“主入口未接入”，仍属于系统债务。

**本次改动**
将 `run_regression.sh` 升级为三段式：
1. capability regression
2. PB-010 hardened regression
3. benchmark smoke

并补充阶段日志，便于发布/调度链路快速定位失败段。

**当前脚本行为**
```bash
[1/3] capability regression
[2/3] pb010 hardened regression
[3/3] benchmark smoke
```

### 2. 直接执行验证：统一回归脚本已跑通
实际执行命令：
```bash
python3 principle-e2e-spec/scripts/test_capability_regression.py
python3 principle-e2e-spec/scripts/test_pb010_hardened.py
bash principle-e2e-spec/scripts/run_regression.sh
```

### 3. 实际结果

#### 3.1 capability regression
结果：**通过**

关键输出：
```text
✅ capability regression suite passed
```

#### 3.2 PB-010 hardened regression
结果：**通过，10/10**

关键输出：
```text
🔧 PB-010 Hardened Benchmark Contract Regression
...
Total: 10  |  ✅ Passed: 10  |  ❌ Failed: 0
✅ PB-010 hardened benchmark contract: ALL CHECKS PASSED
```

#### 3.3 统一回归入口 run_regression.sh
结果：**通过**

关键输出：
```text
[1/3] capability regression
✅ capability regression suite passed
[2/3] pb010 hardened regression
...
✅ PB-010 hardened benchmark contract: ALL CHECKS PASSED
[3/3] benchmark smoke
✅ principle-e2e capability + PB-010 hardened regression + smoke passed
```

## 本轮补掉的债

### 已消除债务 A：PB-010 未接入主回归入口
状态：**已补齐**

影响：
- 后续只要跑统一回归入口，就会自动覆盖 PB-010 hardened contract；
- 降低“局部测试存在、主入口漏跑”的回退风险；
- 更贴近发布前检查与调度入口的真实使用方式。

### 已消除债务 B：回归阶段缺少清晰分段日志
状态：**已补齐**

影响：
- 失败时能快速定位在 capability / pb010 / smoke 哪一段；
- 对调度器、发布守护、cron 执行日志更友好；
- 属于轻量但有效的工程固化。

## 产出物清单
- 修改：`principle-e2e-spec/scripts/run_regression.sh`
- 报告：`reports/fill-keys-with-debt-lane-03-2026-03-08.md`

## 结论
本轮没有停留在债务盘点，而是完成了一个**直接落地且有效**的补位：

1. **把 PB-010 hardened regression 接入统一回归主入口**；
2. **已实际执行验证通过**；
3. **主回归脚本现已覆盖 capability + pb010 + smoke 三段**；
4. 对后续 **评测、调度、发布前检查、规则固化** 都形成了更可靠的统一执行面。

## 仍可继续补的后续债务（未在本轮展开）
1. 给 `run_regression.sh` 增加 machine-readable summary（例如 JSON 汇总），便于调度器/发布器直接消费；
2. 将 `run_regression.sh` 接到实际 CI / cron / dispatcher 事件入口；
3. 为 publish watchdog 增加对应最小回归测试，避免只有实现没有 regression harness；
4. 为 `.openclaw` 两个 hard gate 增加统一 runner 脚本，形成“单命令全门禁验证”。
