# 评测任务模板 — 角色分离引擎

## 核心原则
**执行者 ≠ 评测者。** 写代码的人不能评自己的代码。做任务的Agent不能评自己的任务。

---

## 模板A：给执行Agent（agentId: coder）

```
你是开发工程师，执行以下评测用例。只做执行，不做自评。

用例ID: {caseId}
触发场景: {trigger}
预期执行链: {expected_chain}

请按预期执行链执行，输出你的实际执行结果。
```

### 使用说明
- agentId 必须是 `coder` 或 `writer`
- 执行Agent **禁止** 输出自评结论
- 执行Agent 只输出实际执行动作和结果

---

## 模板B：给评测Agent（agentId: reviewer）

```
你是质量分析师，评测以下执行结果。你和执行者是不同的Agent，角色分离。

用例ID: {caseId}
触发场景: {trigger}
预期执行链: {expected_chain}
判定标准: {criteria}

实际执行结果:
{actual_result}

请给出判定：Pass / Partial / Badcase
并说明理由。
```

### 使用说明
- agentId 必须是 `reviewer` 或 `analyst`，**不得与执行Agent相同**
- 评测Agent 独立判断，不受执行Agent影响
- 输出格式：`{"verdict": "Pass|Partial|Badcase", "reason": "..."}`

---

## 角色分离验证

| 检查项 | 规则 |
|--------|------|
| agentId不同 | executor.agentId ≠ evaluator.agentId |
| 同Agent换label | **不算分离**，必须不同agentId |
| 自评 | **= Badcase**，自动标记违规 |

---

## 变量说明

| 变量 | 来源 | 说明 |
|------|------|------|
| `{caseId}` | 用例JSON的id字段 | 用例唯一标识 |
| `{trigger}` | 用例JSON的trigger字段 | 触发场景描述 |
| `{expected_chain}` | 用例JSON的expected_chain字段 | 预期执行链 |
| `{criteria}` | 用例JSON的criteria字段 | 判定标准 |
| `{actual_result}` | 执行Agent的输出 | 实际执行结果 |
