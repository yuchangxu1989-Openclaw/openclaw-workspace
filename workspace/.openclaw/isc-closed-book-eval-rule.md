# ISC Rule — Closed-Book Evaluation / 闭卷评测硬钢印

**长期有效钢印：闭卷评测时，严禁硬编码评测集；严禁在评测时读取记忆、标注、答案或任何等价参考作为判定依据。**

## Rule ID
ISC-CLOSED-BOOK-001

## Scope
适用于所有与以下主题有关的产出、流程与脚本：
- 评测、验收、review、gate、benchmark、sign-off、通过性结论
- 离线评测、在线评测、回归测试、抽检、对比实验
- 任何会对“模型/系统是否通过”形成结论的流程

## Hard Requirement
在**闭卷评测**场景下，以下行为一律禁止：
1. **硬编码评测集**
   - 将评测题目、case、样本、期望输出、答案片段直接写入代码、prompt、规则、白名单或分支判断
   - 基于样本 ID / 文本片段 / 指纹做定向特判
2. **读取参考答案或等价物**
   - 在评测时读取 memory、标注、answers、golden、labels、reference、ground truth、人工结论
   - 在推理前或推理中把答案、标签、标准结论注入上下文
3. **读取可泄漏评测结论的辅助文件**
   - 任何与评测样本一一对应、足以还原正确答案或判断方向的 sidecar 文件

若存在任一违规：
- **禁止** 输出“通过 / pass / green / sign-off / 可汇报通过”
- 必须输出 **FAIL-CLOSED**
- 必须明确说明：`closed-book violation: evaluation set hardcoded or reference material accessed`

## Machine-checkable Contract
在给出“通过”之前，必须同时具备以下证据：
1. `closed_book_eval.enabled = true`
2. `closed_book_eval.no_hardcoded_evalset = true`
3. `closed_book_eval.no_reference_reads = true`
4. `closed_book_eval.forbidden_paths_checked` 为非空数组
5. `closed_book_eval.evidence` 为非空数组
6. `gate_status = PASS`

只要任一项缺失，默认按失败处理，不允许口头豁免。

## Forbidden Reference Classes
以下目录、文件名、关键词默认视为高风险参考物，评测时不得读取：
- `memory/`, `MEMORY.md`
- `label`, `labels`, `annotation`, `annotations`
- `answer`, `answers`, `gold`, `golden`, `ground_truth`, `reference`, `references`
- `eval_set`, `benchmark_answers`, `expected_output`, `expected_outputs`

## Required Failure String
统一失败文案：
`FAIL-CLOSED: closed-book evaluation violated; hardcoded evalset or reference material access detected.`

## Persistence
- 本规则必须被上层 agent 规则、技能 runner、程序 gate 三层共同引用
- 后续任何流程如与本规则冲突，以本规则优先
