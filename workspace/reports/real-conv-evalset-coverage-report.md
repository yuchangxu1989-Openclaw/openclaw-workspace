# Real-conv evalset last-24h coverage report

- generated_at: `2026-03-08T00:57:15.727671+00:00`
- source_cases_file: `/root/.openclaw/workspace-coder/principle-e2e-spec/08-capability-test-cases.json`
- total_cases: `11`
- confidence: **high**

## Verdict
Ledger active: 7 candidates, 4 selected, 3 dropped. Freshest: 2026-03-08T08:00:00+08:00. Confidence: high.

## Coverage counts
- weak: 7
- partial: 1
- strong: 3

## Strong/partial matches
### strong_case_ids
- p2e-ext-005
- p2e-ext-006
- p2e-ext-007

### partial_case_ids
- p2e-ext-002

### weak_case_ids
- p2e-ext-003
- p2e-ext-001
- p2e-ext-004
- pb-010a
- pb-010b
- pb-010c
- pb-010d

## Top ranked cases
- `p2e-ext-005` [strong] cap=`intent_expansion` score=9 hints=real,sediment,evaluation
- `p2e-ext-006` [strong] cap=`event_completion` score=9 hints=sediment,evaluation
- `p2e-ext-007` [strong] cap=`task_expansion` score=8 hints=coverage,sediment,evaluation
- `p2e-ext-002` [partial] cap=`event_completion` score=4 hints=evaluation
- `p2e-ext-003` [weak] cap=`task_expansion` score=3 hints=real,evaluation
- `p2e-ext-001` [weak] cap=`intent_expansion` score=2 hints=evaluation
- `p2e-ext-004` [weak] cap=`task_expansion` score=2 hints=evaluation
- `pb-010a` [weak] cap=`intent_expansion` score=2 hints=evaluation
- `pb-010b` [weak] cap=`event_completion` score=2 hints=evaluation
- `pb-010c` [weak] cap=`task_expansion` score=2 hints=evaluation

## Gaps
- All identified gaps are now addressed by the ledger.

## Safe actionable fix
- type: `observability-active`
- description: Ledger is active and emitting KPIs. Wire production conversation sources into skills/aeo/last24h_ledger.py ingest for continuous coverage.
- artifact: `/root/.openclaw/workspace-coder/reports/real-conv-evalset-coverage-report.json`
- artifact: `/root/.openclaw/workspace-coder/reports/real-conv-evalset-coverage-report.md`
- artifact: `/root/.openclaw/workspace-coder/skills/aeo/generated/real-conv-last24h-eval-seed.json`
- artifact: `/root/.openclaw/workspace-coder/skills/aeo/generated/last24h-kpi.json`

## Ledger KPIs (from last24h-ledger)

| Metric | Value |
|--------|-------|
| candidate_count | 7 |
| selected_count | 4 |
| dropped_count | 3 |
| freshest_conversation_at | `2026-03-08T08:00:00+08:00` |

### Conversation → Eval Case Mappings

- `feishu-sess-20260307-0914` → `p2e-ext-005`, `p2e-ext-007`, `p2e-ext-006`
- `feishu-sess-20260307-1042` → `p2e-ext-006`, `pb-010b`, `p2e-ext-005`, `p2e-ext-007`
- `feishu-sess-20260307-1605` → `p2e-ext-005`, `p2e-ext-007`, `p2e-ext-006`, `pb-010b`
- `feishu-sess-20260308-0215` → `p2e-ext-006`, `pb-010b`, `p2e-ext-002`, `p2e-ext-005`, `p2e-ext-007`

