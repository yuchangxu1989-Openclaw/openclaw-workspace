# 补位扩列 15 报告（2026-03-08）

## 本轮直接补位内容

本轮优先针对**评测 / 调度 / 发布 / 规则固化**债务做了可执行补齐，避免只停留在分析：

### 1. 固化统一回归入口，补上 hard-gate 自测
已直接修改：`principle-e2e-spec/scripts/run_regression.sh`

#### 变更前问题
原脚本只覆盖：
- capability regression
- PB010 hardened regression
- benchmark smoke

但**没有把 `.openclaw` 下的程序钢印 gate 自测纳入统一回归入口**，导致存在一类剩余系统债务：
- 规则文件和 gate 存在，但发布前 / 验收前的默认回归入口不一定能证明 gate 仍可执行；
- 评测链条可能“只测 benchmark，不测 hard gate 本体”；
- 规则固化还不够“默认化”。

#### 已执行补齐
现在 `run_regression.sh` 已升级为 4 段：
1. hard-gate self tests
2. capability regression
3. pb010 hardened regression
4. benchmark smoke

即统一回归入口现在会先执行：
- `bash "$ROOT/../.openclaw/tests/run_tests.sh"`

这把**闭卷评测 gate + intent-eval gate**的自测收口进主回归脚本，降低“规则在，默认回归不覆盖”的债务。

---

## 实际执行结果

已执行命令：

```bash
cd /root/.openclaw/workspace-coder/principle-e2e-spec
bash scripts/run_regression.sh
```

### 回归结果

#### [1/4] hard-gate self tests
- Closed-book gate: 5/5 通过
- Intent-eval gate: 5/5 通过
- 合计: **10 passed, 0 failed**

#### [2/4] capability regression
- `test_capability_regression.py`：**通过**

#### [3/4] pb010 hardened regression
- RCA pass/fail：通过
- Gap pass/fail：通过
- Fix pass/fail：通过
- Dispatch pass：通过
- Dispatch loophole blocked：通过
- Dispatch partial failure：通过
- Backward compatibility：通过
- 合计: **10 passed, 0 failed**

#### [4/4] benchmark smoke
- smoke benchmark：**通过**

### 最终结果
统一回归入口执行成功，输出：

```text
✅ hard-gate + principle-e2e capability + PB-010 hardened regression + smoke passed
```

---

## 产出物

### 已修改文件
- `principle-e2e-spec/scripts/run_regression.sh`

### 修改摘要
将回归入口从 **3 步** 扩展为 **4 步**，补入 `.openclaw/tests/run_tests.sh`，使其成为：
- 程序钢印 gate 自测
- capability regression
- PB010 hardened regression
- benchmark smoke

的统一入口。

---

## 这次实际消掉的债务

### A. 规则固化债务
从“规则存在”推进到“规则默认被统一回归入口执行”。

### B. 发布前验收债务
后续若把 `run_regression.sh` 作为发布前 / 合并前默认检查，能直接证明：
- hard gate 还活着；
- benchmark contract 没回退；
- hardened case 没被破坏。

### C. 评测链闭环债务
此前评测链更偏 benchmark runner 侧；现在已补上 gate 本体自测，形成：
- gate self-test
- capability regression
- hardened regression
- smoke

四层闭环。

---

## 仍可继续追的后续债务（未在本轮展开）

如果继续补位，建议下一优先级按下面顺序推进：

1. **发布接入**：把 `principle-e2e-spec/scripts/run_regression.sh` 接到真正发布/发版脚本或 CI 钩子，避免只停留在本地入口；
2. **调度接入**：让调度/dispatcher 相关变更默认要求过该回归入口后才能汇报“通过”；
3. **结果归档**：给 `run_regression.sh` 增加带时间戳的产物落盘（例如写到 `reports/` 或 `artifacts/`），便于发布审计；
4. **规则漂移监控**：新增一个“规则文件存在但未被入口引用”的探测，防止未来再出现新 gate 未接回归的问题。

---

## 结论

本轮不是只写分析，而是**直接补了统一回归入口**，把 hard-gate 自测并入默认 regression 主链，并完成实跑验证，全链路通过。
