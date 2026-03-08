# 补位扩列 13：系统债务直执行结果

时间：2026-03-08
任务：针对当前剩余系统债务，优先处理评测 / 调度 / 发布 / 规则固化相关遗留，直接执行并产出有效结果。

## 本次直接落地

### 1. 评测回归链补强：把“workspace 作用域运行”固化成自动回归
已修改：`principle-e2e-spec/scripts/test_capability_regression.py`

#### 做了什么
- 在原有 capability regression 基础上，新增了一条真正执行 `benchmark_runner.py` 的 smoke 回归。
- 该 smoke 显式注入：
  - `OPENCLAW_WORKSPACE=/root/.openclaw/workspace-coder`
- 用真实样例验证：
  - `principle-e2e-spec/examples/benchmark_case_pass.json`
  - `principle-e2e-spec/examples/closed_book_pass.json`
- 若脚本在当前 workspace 作用域下未产出 out 文件，测试会直接 fail，并输出 stderr，避免“脚本看似通过，实际写到别的 workspace”这类隐性债务继续存在。

#### 为什么这是有效补债
此前该类发布/巡检/评测脚本普遍依赖 `skills/shared/paths.js` 中的默认：
- `OPENCLAW_WORKSPACE || /root/.openclaw/workspace`

而当前子任务实际工作目录是：
- `/root/.openclaw/workspace-coder`

这意味着如果不显式固化 workspace 变量，很多脚本会：
- 读取错的事件总线文件
- 把状态/报告写到别的 workspace
- 在当前仓看起来“没效果”，形成伪通过

这次把该约束转成 regression，属于把一次性发现固化为长期门槛，而不是只写分析。

#### 验证结果
已执行：
```bash
python3 principle-e2e-spec/scripts/test_capability_regression.py
```
结果：通过

并且完整回归也已执行：
```bash
python3 principle-e2e-spec/scripts/test_pb010_hardened.py
python3 principle-e2e-spec/scripts/benchmark_runner.py \
  --case principle-e2e-spec/examples/benchmark_case_pass.json \
  --runtime principle-e2e-spec/examples/closed_book_pass.json \
  --out /tmp/p2e-smoke.json
```
结果：全部通过。

---

### 2. 发布静默治理链实际跑通：确认 watchdog 在当前 workspace 可落盘
已执行：
```bash
OPENCLAW_WORKSPACE=/root/.openclaw/workspace-coder \
node skills/evomap-publisher/publish-silence-watchdog.js check
```

#### 实际产物
已在当前仓生成：
- `infrastructure/publish-watchdog/last-run.json`
- `infrastructure/publish-watchdog/state.json`

#### 本次运行结果
- `scannedEvents = 0`
- `pendingCount = 0`
- `replayed = []`
- `replayFailed = []`

#### 结论
这说明 watchdog 代码路径本身能在当前 workspace 正常执行、落盘和退出 0。
同时也暴露出一个真实现状：
- 当前 `workspace-coder` 下没有对应的 `infrastructure/event-bus/events.jsonl` 运行数据，导致这次巡检扫描到 0 个事件。

这不是 watchdog 逻辑失败，而是“数据接入尚未灌到当前 workspace”的环境债务。相比只写报告，本次已经把：
- 代码可运行性
- 落盘路径正确性
- workspace 绑定是否生效

都实际验证过了。

---

### 3. 调度 / 规则固化侧的有效推进
本次没有新增一套大而空的规则文档，而是把一个关键系统债务做成自动化约束：

#### 新固化规则
- 评测 runner / smoke / watchdog 这类脚本，若依赖 `skills/shared/paths.js` 的默认 workspace，则必须通过测试显式验证 workspace 作用域正确。
- 否则容易出现：
  - 调度在 A workspace 触发
  - 状态写到 B workspace
  - 报告在 C workspace 查看
  - 最终形成“调度链看似活着，实际无有效产物”的系统假阳性

本次通过新增回归，已经把这类债务从“经验问题”升级为“可自动发现的问题”。

---

## 关键命令与结果

### 回归
```bash
python3 principle-e2e-spec/scripts/test_capability_regression.py
```
- 结果：✅ 通过

```bash
python3 principle-e2e-spec/scripts/test_pb010_hardened.py
```
- 结果：✅ 10/10 通过

```bash
python3 principle-e2e-spec/scripts/benchmark_runner.py \
  --case principle-e2e-spec/examples/benchmark_case_pass.json \
  --runtime principle-e2e-spec/examples/closed_book_pass.json \
  --out /tmp/p2e-smoke.json
```
- 结果：✅ SUCCESS

### 发布静默巡检
```bash
OPENCLAW_WORKSPACE=/root/.openclaw/workspace-coder \
node skills/evomap-publisher/publish-silence-watchdog.js check
```
- 结果：✅ 退出码 0
- 产物：`infrastructure/publish-watchdog/last-run.json`

---

## 变更文件
- `principle-e2e-spec/scripts/test_capability_regression.py`
- `infrastructure/publish-watchdog/last-run.json`
- `infrastructure/publish-watchdog/state.json`
- `reports/fill-keys-with-debt-lane-13-2026-03-08.md`

---

## 还剩的真实债务
这次不是全清，但明确推进了两类关键遗留：

1. **评测链的 workspace 假阳性风险**：已转成自动回归，算已实质治理。
2. **发布 watchdog 在当前 workspace 的可运行性**：已实际跑通并产出状态文件，算已验证打通。

仍未在本子任务内彻底解决的是：
- 当前 workspace 的 EventBus 历史事件为空，导致发布静默巡检暂时无真实业务样本可扫。
- 若要继续补位，下一步最值钱的是把 dispatch / publish 主链事件统一灌到当前 workspace，随后补一个“非空事件流下的 watchdog 断言回归”。

## 总结
本 lane 不是只写分析，已完成两项有效补债：
- **把 workspace 作用域正确性纳入评测回归**
- **把发布静默 watchdog 在当前 workspace 实际跑通并落盘**

这两项都直接减少“脚本执行了但没落在当前系统真链路”的系统性假通过风险。
