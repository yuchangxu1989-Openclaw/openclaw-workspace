# Last-24h Real-Conversation Evaluation Ledger Report

- **window**: `2026-03-07T00:55:47.821414+00:00` → `2026-03-08T00:55:47.821414+00:00`
- **computed_at**: `2026-03-08T00:55:47.824101+00:00`
- **schema_version**: `1.0.0`

## KPIs

| Metric | Value |
|--------|-------|
| candidate_count | 7 |
| selected_count | 4 |
| dropped_count | 3 |
| freshest_conversation_at | `2026-03-08T08:00:00+08:00` |

## Dropped Reasons Breakdown

| Reason | Count |
|--------|-------|
| no eval case matched (failure modes or problem summary had no overlap) | 3 |

## Conversation → Eval Case Mappings

| conversation_id | eval_case_ids |
|----------------|---------------|
| `feishu-sess-20260307-0914` | `p2e-ext-005`, `p2e-ext-007`, `p2e-ext-006` |
| `feishu-sess-20260307-1042` | `p2e-ext-006`, `pb-010b`, `p2e-ext-005`, `p2e-ext-007` |
| `feishu-sess-20260307-1605` | `p2e-ext-005`, `p2e-ext-007`, `p2e-ext-006`, `pb-010b` |
| `feishu-sess-20260308-0215` | `p2e-ext-006`, `pb-010b`, `p2e-ext-002`, `p2e-ext-005`, `p2e-ext-007` |

## All Entries

### `feishu-sess-20260307-0914` — ✅ selected
- source: `session` | messages: 12 | lang: `zh`
- period: `2026-03-07T09:14:00+08:00` → `2026-03-07T09:38:00+08:00`
- problem: agent记忆丢失后无法恢复上下文，导致意图扩充链断裂
- failure_modes: memory_loss, intent_drift
- selection_reason: auto-matched 3 case(s), top=p2e-ext-005 score=9
  - → `p2e-ext-005`: failure_mode:memory_loss→tag_match; keyword:memory_loss; capability_align:intent_expansion; memory_loss_tag_boost
  - → `p2e-ext-007`: failure_mode:memory_loss→tag_match; capability_align:task_expansion; memory_loss_tag_boost
  - → `p2e-ext-006`: failure_mode:memory_loss→tag_match; memory_loss_tag_boost
- hash: `550a9afe30a116a0` | ingested: `2026-03-08T00:55:47.821559+00:00`

### `feishu-sess-20260307-1042` — ✅ selected
- source: `session` | messages: 8 | lang: `zh`
- period: `2026-03-07T10:42:00+08:00` → `2026-03-07T11:05:00+08:00`
- problem: session重启后handoff上下文丢失，任务未能正确恢复
- failure_modes: handoff_gap
- selection_reason: auto-matched 4 case(s), top=p2e-ext-006 score=6
  - → `p2e-ext-006`: failure_mode:handoff_gap→tag_match; memory_loss_tag_boost
  - → `pb-010b`: failure_mode:handoff_gap→tag_match
  - → `p2e-ext-005`: memory_loss_tag_boost
  - → `p2e-ext-007`: memory_loss_tag_boost
- hash: `a163449af6549c6f` | ingested: `2026-03-08T00:55:47.821620+00:00`

### `feishu-sess-20260307-1430` — ❌ dropped
- source: `session` | messages: 4 | lang: `zh`
- period: `2026-03-07T14:30:00+08:00` → `2026-03-07T14:45:00+08:00`
- problem: 简单天气查询，无异常
- failure_modes: (none)
- drop_reason: no eval case matched (failure modes or problem summary had no overlap)
- hash: `54fecbb0b5cde6dc` | ingested: `2026-03-08T00:55:47.821645+00:00`

### `feishu-sess-20260307-1605` — ✅ selected
- source: `session` | messages: 22 | lang: `zh`
- period: `2026-03-07T16:05:00+08:00` → `2026-03-07T16:52:00+08:00`
- problem: 评测脚本运行后记忆丢失，agent重建状态后完成任务扩列但验证步骤缺失
- failure_modes: memory_loss, verification_gap
- selection_reason: auto-matched 4 case(s), top=p2e-ext-005 score=9
  - → `p2e-ext-005`: failure_mode:memory_loss→tag_match; keyword:memory_loss; capability_align:intent_expansion; memory_loss_tag_boost
  - → `p2e-ext-007`: failure_mode:memory_loss→tag_match; capability_align:task_expansion; memory_loss_tag_boost
  - → `p2e-ext-006`: failure_mode:memory_loss→tag_match; memory_loss_tag_boost
  - → `pb-010b`: failure_mode:verification_gap→tag_match
- hash: `44f3251717c675a8` | ingested: `2026-03-08T00:55:47.821661+00:00`

### `feishu-sess-20260307-2130` — ❌ dropped
- source: `session` | messages: 15 | lang: `zh`
- period: `2026-03-07T21:30:00+08:00` → `2026-03-07T22:10:00+08:00`
- problem: 代码生成任务，agent正常完成
- failure_modes: (none)
- drop_reason: no eval case matched (failure modes or problem summary had no overlap)
- hash: `7969afbfa7db397b` | ingested: `2026-03-08T00:55:47.821676+00:00`

### `feishu-sess-20260308-0215` — ✅ selected
- source: `session` | messages: 9 | lang: `en`
- period: `2026-03-08T02:15:00+08:00` → `2026-03-08T02:40:00+08:00`
- problem: event completion failed after handoff — source_event not recovered from context
- failure_modes: handoff_gap, event_completion_failure
- selection_reason: auto-matched 5 case(s), top=p2e-ext-006 score=15
  - → `p2e-ext-006`: failure_mode:handoff_gap→tag_match; failure_mode:event_completion_failure→tag_match; keyword:event; keyword:completion; keyword:after
  - → `pb-010b`: failure_mode:handoff_gap→tag_match; failure_mode:event_completion_failure→tag_match; keyword:event; keyword:completion; keyword:source_event
  - → `p2e-ext-002`: failure_mode:event_completion_failure→tag_match; keyword:event; keyword:completion; keyword:source_event; keyword:context
  - → `p2e-ext-005`: keyword:context; memory_loss_tag_boost
  - → `p2e-ext-007`: keyword:context; memory_loss_tag_boost
- hash: `a8c4cc0cf51a0ee6` | ingested: `2026-03-08T00:55:47.821690+00:00`

### `feishu-sess-20260308-0730` — ❌ dropped
- source: `session` | messages: 6 | lang: `zh`
- period: `2026-03-08T07:30:00+08:00` → `2026-03-08T08:00:00+08:00`
- problem: 日报生成任务正常完成，无特殊故障
- failure_modes: (none)
- drop_reason: no eval case matched (failure modes or problem summary had no overlap)
- hash: `a4fe600875e8b644` | ingested: `2026-03-08T00:55:47.821705+00:00`

## Integrity Check

✅ All invariants pass. Ledger is consistent.

