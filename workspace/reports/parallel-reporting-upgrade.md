# Parallel Reporting Skill — Upgrade Summary

**Date:** 2026-03-06  
**Skill:** `skills/public/multi-agent-reporting`  
**Version:** 1.0.0 → 2.0.0

---

## What Changed

### Core Philosophy Shift

v1 was a **verbal status broadcaster** — it rendered a single flat table and appended a summary paragraph.  
v2 is a **dispatch-board / scheduler** — it renders a structured dashboard where the reader's eye goes directly to the zone that needs attention.

---

## New Dashboard Output Format

Default output (`outputFormat: "dashboard"`) now renders these sections:

| # | Section | Content |
|---|---------|---------|
| 1 | **Overview** | ASCII progress bar, per-status counts, completion/coverage/blocked rates |
| 2 | **Running** | Agent · Model · Task · Duration · Next Action |
| 3 | **Completed** | Agent · Model · Task · Duration · Commit / Artifact |
| 4 | **Blocked / Failed** | Agent · Model · Task · Status icon · Blocker / Error |
| 5 | **Needs Decision** | Agent · Task · Decision question · Owner · ETA |
| 6 | **Model Breakdown** | Per-model task load: total / done / running / blocked / pending |
| 7 | **Next Actions** | Actionable bullets per blocked/decision/running/pending task |
| 7b| **Per-Task Next Hop** | (if `nextAction` fields present) Agent · Task · Next Action · Owner · ETA |

---

## New Fields in TaskEntry Schema

```
blocker        — human-readable block reason (alternative to error for blocked tasks)
decision       — the question that needs answering (needs_decision tasks)
decisionOwner  — who decides
nextAction     — what happens next after this task
nextOwner      — who executes the next action
nextETA        — when (e.g. "15m", "EOD", "1h")
handoffTo      — downstream agent or system
artifact       — output artifact (alternative to commit, e.g. "PR #42", "doc link")
branch         — branch name
updatedAt      — ISO timestamp of last status update
```

---

## New Status: `needs_decision`

Gates that require human or orchestrator decision are now a first-class status,
surfaced in their own dashboard section with owner and ETA columns.

---

## Statistics Additions

`computeStats()` now returns:
- `needs_decision`, `waiting`, `cancelled` counts
- `blockedRate` — `(blocked + failed + needs_decision) / total`

---

## Backward Compatibility

- All existing `TaskEntry` objects work as-is (new fields are optional)
- Legacy output still available: `formatReport(tasks, { outputFormat: 'table' })`
- `formatReport`, `validateReport`, `generateTemplate`, `computeStats` — unchanged signatures
- New export: `formatDashboard(tasks, options?)` (also callable directly)

---

## Test Results

```
43 passed, 0 failed
```

(+13 new tests covering dashboard sections, model breakdown, next-hop, and `needs_decision` zone)

---

## Files Modified

| File | Change |
|------|--------|
| `index.js` | Full rewrite — dashboard engine added (`formatDashboard`, `groupByZone`, `shortModel`) |
| `config.json` | New optional fields, new statuses, `outputFormat: "dashboard"`, validation toggles |
| `SKILL.md` | Full v2 docs — new schema, new API, dashboard section map, migration guide |
| `examples/basic-usage.js` | Rewritten to showcase all formats including dashboard |
| `test/report-validator.test.js` | Updated to test dashboard behavior; legacy table tests preserved |
