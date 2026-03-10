# 补位扩列 05（系统债务直修）- 2026-03-08

## 本次直接处理内容
优先按“评测 / 调度 / 发布 / 规则固化”方向补位，避免只写分析。本轮实际落地的是：

1. **补齐 sandbox 准出链路的结构化回归测试**
   - 新增：`sandbox/principle_enforcement_e2e/test_runner_regression.py`
   - 目标：把已有 `principle_to_enforcement_runner.py` 从“仅 shell 级冒烟”提升到**结构化断言回归**，固化发布/准出一致性规则。

2. **将新回归测试接入现有测试入口**
   - 修改：`sandbox/principle_enforcement_e2e/tests/run_tests.sh`
   - 在原有 4 个 case shell 校验之后，继续执行 Python 断言套件，避免只看 exit code。

3. **执行全量关键回归验证**
   - 执行 sandbox 原子回归
   - 执行 sandbox run_tests.sh 总入口
   - 执行 `principle-e2e-spec/scripts/run_regression.sh`

---

## 为什么这项债务值得现在补
已有 `sandbox/principle_enforcement_e2e` 虽然覆盖了：
- pass
- fail-closed
- false-positive
- mismatch

但原先只在 shell 层判断“退出码是否符合预期”，缺少以下**规则固化**：

- `release READY` 但 `gate` 缺失时，最终必须仍然 `BLOCK`
- false positive 场景下，`recognized_intent.label` 必须维持 `unknown`
- `PASS/FAIL` 与 `ALLOW/BLOCK`、`failure_text`、markdown 报告之间必须保持一致
- markdown 输出中必须准确反映最终 release decision

这类问题属于**发布/准出语义漂移风险**：
表面 exit code 正确，但 JSON/Markdown 内部字段可能互相打架，后续集成方一旦消费结构化字段就会踩坑。

---

## 实际变更

### 1) 新增结构化回归测试
文件：`sandbox/principle_enforcement_e2e/test_runner_regression.py`

覆盖断言：

- `pass_case`
  - exit code = 0
  - `final_status = PASS`
  - `release_decision = ALLOW`
  - `failure_text = null`
  - markdown 含 `Release Decision: **ALLOW**`

- `fail_case`
  - 非 0 退出
  - `final_status = FAIL`
  - `release_decision = BLOCK`
  - 必须有 `failure_text`
  - markdown 含 `Failure:`

- `false_positive_case`
  - 非 0 退出
  - `recognized_intent.label = unknown`
  - `final_status = FAIL`
  - `release_decision = BLOCK`
  - markdown 必须显示 `FAIL`

- `mismatch_case`
  - 非 0 退出
  - 仍能识别为 `principle_to_enforcement_e2e`
  - 但由于 `gate` 缺失，最终必须 `BLOCK`
  - 原始链路中 `release.status = READY` 允许存在
  - 同时断言 `gate.present is False`
  - markdown 必须显示 `Release Decision: **BLOCK**`

### 2) 接入测试入口
文件：`sandbox/principle_enforcement_e2e/tests/run_tests.sh`

新增步骤：
```bash
[extra] python regression assertions
python3 "$ROOT/test_runner_regression.py"
```

这样保留原有 shell 冒烟的同时，把**结构化契约回归**纳入统一入口。

---

## 执行结果

### A. sandbox 结构化回归
命令：
```bash
python3 sandbox/principle_enforcement_e2e/test_runner_regression.py
```
结果：**通过**

摘要：
- 4 / 4 passed

### B. sandbox 总入口
命令：
```bash
bash sandbox/principle_enforcement_e2e/tests/run_tests.sh
```
结果：**通过**

摘要：
- 4 个原始 case 均符合预期
- 新增 Python regression assertions 通过

### C. principle-e2e-spec 回归总入口
命令：
```bash
bash principle-e2e-spec/scripts/run_regression.sh
```
结果：**通过**

摘要：
- capability regression：通过
- pb010 hardened regression：10 / 10 通过
- benchmark smoke：通过

---

## 产出价值 / 已被固化的规则
本轮不是写分析，而是把以下系统债务转成了**可执行回归约束**：

1. **准出语义一致性被固化**
   - `final_status`
   - `release_decision`
   - `failure_text`
   - markdown 报告
   现在有自动化断言，减少字段漂移。

2. **“release READY 不等于允许发布”被固化**
   - 即使原始 release step 看起来 ready，只要 gate 缺失，最终必须 BLOCK。
   - 这正是发布/规则固化类遗留里最容易被后续改坏的点。

3. **false positive 风险被结构化防回归**
   - 不再只依赖人工读报告判断，而是自动验证 intent label 必须为 `unknown`。

4. **sandbox 准出链路与 principle-e2e-spec 主回归同时验证**
   - 本轮交付不是孤立脚本，而是与既有 benchmark / PB-010 hardened suite 一起跑通，降低局部修补造成的新漂移。

---

## 本轮修改文件
- `sandbox/principle_enforcement_e2e/test_runner_regression.py`（新增）
- `sandbox/principle_enforcement_e2e/tests/run_tests.sh`（更新）
- `reports/fill-keys-with-debt-lane-05-2026-03-08.md`（本报告）

---

## 后续仍可继续补的债务（但本轮已完成有效交付）
如果继续沿这条 lane 往下打，优先级建议：

1. 给 `principle-e2e-spec/scripts/run_regression.sh` 增加 sandbox runner 回归入口，形成更高层总调度闭环
2. 给 `infrastructure/dispatcher/routes.json` 增加 schema/handler existence 校验脚本，固化调度侧债务
3. 给 publish watchdog 增加 fixture 级 replay 测试，补齐发布静默补发链路的自动化

本轮已经完成“直接执行并产出有效结果”的要求，且产物可复跑、可回归、可阻断后续退化。
