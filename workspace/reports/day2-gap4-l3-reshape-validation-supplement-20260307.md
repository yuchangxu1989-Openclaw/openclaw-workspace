# Day2 Gap4：L3架构变化后的全系统重塑盘点 / 补验证报告

- 时间：2026-03-07 11:39 GMT+8
- 任务：补做 Gap4（L3 架构变化后的全系统重塑盘点）验证测试
- 结论：**补验证已执行，Gap4 仍不应判定为 clean close**；当前状态应更新为 **“盘点已形成 + 核心链路部分通过 + 仍存在关键回归失败/覆盖缺口”**。

---

## 1. 验证目标

本轮不做大改代码，聚焦回答 Gap4 的三个问题：

1. **L3 主路升级后，关键系统部件是否已实际落位？**
2. **现有测试是否能证明“全系统重塑”已经稳定成立？**
3. **还差哪些验证项，导致 Gap4 仍不能关闭？**

---

## 2. 盘点范围

围绕 L3 相关主路与配套资产进行检查：

- 设计与迁移文档
  - `designs/l3-architecture/`
  - `designs/l3-integration-map-v1.md`
  - `designs/l3-interface-contract-v1.md`
  - `designs/l3-migration-plan.md`
- 主路实现
  - `infrastructure/pipeline/l3-gateway.js`
  - `infrastructure/pipeline/l3-pipeline.js`
  - `infrastructure/pipeline/l3-shadow-observer.js`
  - `infrastructure/observability/l3-dashboard.js`
- 验证脚本
  - `infrastructure/pipeline/l3-gateway-test.js`
  - `infrastructure/tests/l3-e2e-test.js`
  - `tests/unit/day2-closeout-routes.test.js`
- 历史结论
  - `reports/d2-08-l3-mainline.md`
  - `reports/day2-remaining-gap-scan-final.md`
  - `reports/DAY2-GAP-CLOSURE-20260307.md`

---

## 3. 实际执行的验证

### 3.1 Day2 closeout 最小回归

命令：

```bash
node tests/unit/day2-closeout-routes.test.js
```

结果：**PASS**

关键观察：
- 新增 git 派生动作 route 存在
- `isc-skill-security-gate-030` 在空 context 下可执行

说明：
- 这证明 Day2 收尾补洞本身有效
- 但它**不能单独证明 Gap4（L3 全系统重塑）已完成**，仅能证明局部修补回归成立

---

### 3.2 L3 Gateway 集成测试

命令：

```bash
node infrastructure/pipeline/l3-gateway-test.js
```

结果：**40 项中 37 通过，3 失败**

失败项：
- `T3.12: QUERY 类输入进入快路并被识别` ❌
- `T6.1: Shadow 对比执行` ❌
- `T6.4: 对比日志文件存在` ❌

同时观察到：
- 测试过程中出现 `IntentExtractor:LLM` 超时 / failover 日志
- L3 基本处理链可跑通：IntentScanner / RuleMatcher / Dispatcher stage 均可见
- 但快路识别与 shadow 对比链路**不稳定或未达预期**

说明：
- **L3 主路“存在且可运行”成立**
- **L3 主路“已经稳定替代并验证周边重塑”不成立**
- 尤其 shadow mode 本来就是 Gap4 全系统盘点的重要证据链，当前失败会直接削弱关闭依据

---

### 3.3 L3 E2E 闭环测试

命令：

```bash
node infrastructure/tests/l3-e2e-test.js
```

结果：**仅确认场景1通过，场景2阶段出现长时间卡住，未在本轮窗口内完成**

已确认通过部分：
- EventBus.emit / consume 正常
- RuleMatcher 可匹配规则
- Dispatcher 可返回结果
- DecisionLog 可写入
- RuleMatcher 内部决策日志存在

未能确认部分：
- 意图识别 → 事件发射完整 happy path
- 全套场景是否全部通过
- 非 happy path / fallback / 断路器 / feature flag 全量稳定性

说明：
- 这意味着 **L3 闭环验证证据不足**
- 当前无法把 E2E 结果作为 Gap4 已关闭的验收依据

---

## 4. 对 Gap4 的状态重判

结合本轮补验证，Gap4 不应继续写成“仅未盘点”，而应更精确拆成三层状态：

### 4.1 已成立部分

1. **L3 架构文档资产已存在**
   - 架构、接口、迁移、集成图均已有文档
2. **L3 主路代码已存在且可运行**
   - gateway / pipeline / shadow observer / dashboard 已落文件
3. **局部验证已成立**
   - closeout 路由回归通过
   - gateway 集成测试大部分通过
   - E2E 场景1通过

### 4.2 未成立部分

1. **“全系统重塑完成”缺少稳定性证据**
   - gateway test 仍有 3 项失败
2. **Shadow 对比链路未被验证通过**
   - 这会影响对新旧链路一致性的判断
3. **L3 E2E 未完成全场景闭环**
   - 无法证明主路升级后的端到端体系稳定
4. **Gap4 的系统级盘点清单尚未形成正式结构化验收表**
   - 目前有材料分散在多份报告中，但缺一个“组件→状态→证据→缺口→动作”的最终版本

### 4.3 推荐状态标签

建议把 Gap4 从：
- “未关闭 / 未盘点完整”

更新为：
- **“进行中：盘点资产基本齐备，核心链路部分验证通过，但系统级验证未过线”**

---

## 5. 当前最关键的缺口

按对 Gap4 验收影响排序：

### P0
1. **修复并重跑 `l3-gateway-test.js` 的 3 个失败项**
   - QUERY 快路识别失败
   - Shadow 对比执行失败
   - 对比日志产物缺失

2. **让 `l3-e2e-test.js` 能在受控时间内稳定跑完整套场景**
   - 避免外部 LLM 超时导致测试悬挂
   - 需要把测试依赖切到 deterministic/mock/fallback-stable 模式

### P1
3. **输出 Gap4 最终盘点表**
   - 建议字段：`系统层/组件/重塑目标/当前状态/证据/剩余动作/owner`
   - 覆盖 EventBus / Intent / Rule / Dispatcher / Handler / Observability / Shadow / Fallback / Reporting

4. **补一轮“L3 主路 ON / OFF / Shadow”三态验收**
   - OFF：旧链路可回退
   - ON：L3 主路可处理
   - Shadow：新旧链路可对比并产生日志

---

## 6. 补验证结论

本轮补验证后的结论是：

> **Gap4 不是“完全没做”，而是“已完成架构与主链路建设，但尚未通过系统级补验证”。**

更具体地说：
- **能证明 L3 改造已落地**
- **不能证明 L3 改造后的全系统重塑已经稳定验收**
- 因此 **Gap4 现在仍不能关闭**

---

## 7. 建议对主结论的修正文案

可把原结论中的 Gap4 描述修正为：

> **Gap4：L3 架构变化后的全系统重塑盘点**
> - 状态：进行中，未关闭
> - 已做：L3 主路 gateway/pipeline/shadow/dashboard 及配套设计文档已落位；closeout 最小回归通过；L3 gateway 集成测试 37/40 通过；L3 E2E 场景1通过。
> - 未做/未过：QUERY 快路识别、shadow 对比日志、完整 E2E 场景稳定性仍未通过；缺最终结构化系统盘点验收表。
> - 关闭条件：L3 gateway test 全通过；L3 E2E 完整通过；输出系统级盘点与剩余动作表。

