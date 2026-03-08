# ISC Rule — Intent-Led Evaluation Hard Gate

长期有效钢印：**没有 LLM 意图识别作为主基座的评测，不得按“通过 / pass / green / 可汇报通过”输出。**

## Rule ID
ISC-INTENT-EVAL-001

## Scope
适用于所有与以下主题有关的产出：
- 评测、验收、review、gate、sign-off、通过性结论
- 架构评审、效果评估、对比实验、方案验收
- 任何会向上游/外部汇报“通过”的结论

## Hard Requirement
若评测主基座不是 **LLM intent recognition / LLM-based intent understanding**，则：
- **禁止** 输出“通过”“pass”“green”“可汇报通过”“满足上线门槛”
- 必须输出 **FAIL-CLOSED**
- 必须明确说明：`缺少 LLM 意图识别主基座`

## Machine-checkable Evidence
在给出“通过”之前，必须同时具备：
1. 明确字段 `intent_basis.llm_as_primary = true`
2. 明确字段 `intent_basis.evidence` 为非空
3. Gate 校验结果为 `PASS`

只要任一项缺失，默认按失败处理，不允许口头豁免。

## Required Failure String
建议统一失败文案包含：
`FAIL-CLOSED: no LLM intent-recognition foundation, cannot report pass.`

## Persistence
- 本规则必须被上层 agent 规则、技能 runner、程序 gate 三层共同引用
- 后续任何流程如与本规则冲突，以本规则优先
