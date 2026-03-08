# Skill: architecture-review-pipeline

## Purpose
对评测/验收/架构评审输出进行程序化约束，默认 **fail-closed**：
- 禁止在**没有 LLM 意图识别作为主基座**时输出“通过”
- 禁止在**闭卷评测中硬编码评测集，或读取记忆/标注/答案/参考**时输出“通过”

## Non-bypass Rules
引用规则：
- `.openclaw/isc-closed-book-eval-rule.md`
- `.openclaw/isc-intent-eval-rule.md`

### Rule A — ISC-CLOSED-BOOK-001
**硬门槛：**
- 闭卷评测未声明 `closed_book_eval.enabled = true`
- 或 `closed_book_eval.no_hardcoded_evalset != true`
- 或 `closed_book_eval.no_reference_reads != true`
- 或没有 `closed_book_eval.forbidden_paths_checked`
- 或没有 `closed_book_eval.evidence`
- 或 gate 结果不是 `PASS`

则一律：
- 不得按通过汇报
- 必须输出 `FAIL-CLOSED: closed-book evaluation violated; hardcoded evalset or reference material access detected.`

### Rule B — ISC-INTENT-EVAL-001
**硬门槛：**
- 没有 `intent_basis.llm_as_primary = true`
- 或没有 `intent_basis.evidence`
- 或 gate 结果不是 `PASS`

则一律：
- 不得按通过汇报
- 必须输出 `FAIL-CLOSED: no LLM intent-recognition foundation, cannot report pass.`

## Required Evaluation Contract
任何评测 JSON 至少包含：

```json
{
  "summary": "...",
  "closed_book_eval": {
    "enabled": true,
    "no_hardcoded_evalset": true,
    "no_reference_reads": true,
    "forbidden_paths_checked": [
      "memory/",
      "MEMORY.md",
      "labels/",
      "answers/",
      "references/"
    ],
    "forbidden_paths_accessed": [],
    "evidence": [
      "reviewed eval pipeline config",
      "confirmed no answer/reference files mounted into eval runtime"
    ]
  },
  "intent_basis": {
    "llm_as_primary": true,
    "evidence": ["prompt-based intent router", "llm intent classifier run log"]
  },
  "gate_status": "PASS",
  "report_recommendation": "通过"
}
```

## Runner
执行：

```bash
python3 .openclaw/gate_closed_book_eval.py <evaluation.json>
python3 .openclaw/gate_intent_eval.py <evaluation.json>
```

或：

```bash
bash skills/architecture-review-pipeline/run_gate.sh <evaluation.json>
```

- 只有两个 gate 都 exit code 0，才允许输出通过
- 任一 gate 返回 exit code 1/2，均按失败处理

## Required Workflow
1. 先形成 `evaluation.json`
2. 先跑 closed-book gate
3. 再跑 intent-eval gate
4. 任一 gate 未通过时，禁止生成“通过”结论
5. 如需汇报，只能汇报失败原因和缺失项

## Canonical Failure Text
- `FAIL-CLOSED: closed-book evaluation violated; hardcoded evalset or reference material access detected.`
- `FAIL-CLOSED: no LLM intent-recognition foundation, cannot report pass.`
