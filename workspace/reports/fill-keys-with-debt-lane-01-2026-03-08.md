# 补位扩列 01 执行报告（2026-03-08）

## 本次目标

针对当前剩余系统债务，优先直接补齐：

- 评测回归
- 调度/发布链路的规则固化
- 避免只做分析，必须产出可执行结果

## 本次直接执行结果

### 1. 复核现有评测/规则债务状态

已检查仓库内与本轮优先级最相关的落地产物：

- `principle-e2e-spec/scripts/benchmark_runner.py`
- `principle-e2e-spec/scripts/test_capability_regression.py`
- `principle-e2e-spec/scripts/test_pb010_hardened.py`
- `principle-e2e-spec/scripts/run_regression.sh`
- `skills/evomap-publisher/publish-silence-watchdog.js`
- `infrastructure/dispatcher/routes.json`
- `infrastructure/event-bus/handlers/publish-silence-watchdog.js`
- `skills/dto-core/config/cron/evomap-publish-silence-watchdog.yaml`

结论：

- PB-010 hardened 相关 case、runner、回归脚本已经存在
- 但总回归入口 `run_regression.sh` **尚未纳入** `test_pb010_hardened.py`
- 这意味着“PB-010 已补的硬化债务”虽然单独可跑，但**没有被总回归入口固化**，存在后续漏跑风险

这属于典型的“评测已做、调度入口未收口”的系统债务。

---

### 2. 直接修复：把 PB-010 hardened regression 固化进总回归入口

已修改：`principle-e2e-spec/scripts/run_regression.sh`

#### 修改前
总入口只执行：

1. `test_capability_regression.py`
2. benchmark smoke

#### 修改后
总入口改为明确三段：

1. capability regression
2. PB-010 hardened regression
3. benchmark smoke

并补了阶段性输出：

```bash
[1/3] capability regression
[2/3] pb010 hardened regression
[3/3] benchmark smoke
```

最终成功提示更新为：

```bash
✅ principle-e2e capability + PB-010 hardened regression + smoke passed
```

这一步的价值不是“改文案”，而是把此前已经补上的 PB-010 规则真正纳入统一回归入口，避免后续：

- 只跑基础 capability regression
- 忘跑 hardened suite
- 发布前误以为全量回归已覆盖

---

## 验证执行

### A. 单独执行 PB-010 hardened regression

执行：

```bash
python3 principle-e2e-spec/scripts/test_pb010_hardened.py
```

结果：

- RCA pass/fail：通过
- Gap pass/fail：通过
- Fix pass/fail：通过
- Dispatch pass / loophole blocked / partial failure：通过
- backward compatibility：通过

摘要：

```text
Total: 10  |  ✅ Passed: 10  |  ❌ Failed: 0
✅ PB-010 hardened benchmark contract: ALL CHECKS PASSED
```

### B. 执行统一总回归入口

执行：

```bash
bash principle-e2e-spec/scripts/run_regression.sh
```

结果：

```text
[1/3] capability regression
✅ capability regression suite passed
[2/3] pb010 hardened regression
... 全部通过 ...
[3/3] benchmark smoke
✅ principle-e2e capability + PB-010 hardened regression + smoke passed
```

说明：

- 基础 capability regression 正常
- PB-010 hardened regression 已被统一入口覆盖
- smoke 仍然通过
- 本次固化未引入回归破坏

---

## 本轮实际补掉的债

### 已补债 1：评测总入口漏挂 hardened suite

问题：

- `test_pb010_hardened.py` 存在，但 `run_regression.sh` 未接入

风险：

- CI / 人工执行总入口时会漏掉 PB-010 hardened contract
- dispatch loophole / RCA / gap / fix 的硬化回归可能被绕过

处理：

- 已接入统一入口并完成实跑验证

状态：**已固化**

### 已补债 2：回归执行阶段可观测性偏弱

问题：

- 原脚本只有最终一句成功提示，中间缺少阶段信息

处理：

- 已增加 `[1/3]`、`[2/3]`、`[3/3]` 分段输出

价值：

- 出错时更容易定位到底是 capability / hardened / smoke 哪一段失败
- 适合后续接 CI log 或调度台账

状态：**已固化**

---

## 本轮未再继续扩动的项

### 发布静默 watchdog

已检查到以下链路已存在：

- `skills/evomap-publisher/publish-silence-watchdog.js`
- `infrastructure/event-bus/handlers/publish-silence-watchdog.js`
- `infrastructure/dispatcher/routes.json`
- `skills/dto-core/config/cron/evomap-publish-silence-watchdog.yaml`

说明此前“发布静默治理”已经落地到：

- 检查器
- 事件处理器
- dispatcher 路由
- cron 配置

因此本轮优先把更高风险的“评测入口漏挂”先收口，没有再对发布 watchdog 做二次结构性改写，避免无谓扰动。

---

## 产物清单

### 修改文件

1. `principle-e2e-spec/scripts/run_regression.sh`

### 验证命令

1. `python3 principle-e2e-spec/scripts/test_pb010_hardened.py`
2. `bash principle-e2e-spec/scripts/run_regression.sh`

---

## 结论

本次不是停留在分析，而是直接把一个真实遗留债务补进了系统主链路：

- **PB-010 hardened regression 已纳入统一回归入口**
- **总回归执行顺序与阶段输出已固化**
- **实跑验证全部通过**

当前 lane 01 的有效结果可判断为：**已完成一项评测/规则固化类高优先级补债，并成功收口到可执行主入口。**
