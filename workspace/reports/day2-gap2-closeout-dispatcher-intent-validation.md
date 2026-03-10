# Day2 Gap2 closeout — dispatcher intent route repair validation

## Scope taken
- Lane: **Dispatcher / intent consumption closeout**
- Non-conflicting choice: validate and close the previously reported Gap2 symptom around `intent.ruleify / intent.reflect / intent.directive` being treated as unresolved dispatcher/manual-queue noise.
- Constraint honored: **did not modify `openclaw.json`**.

## What I inspected

### Existing evidence reviewed
- `reports/day2-remaining-gap-scan-final.md`
  - Reported `U-03 [P0]`: `intent.ruleify / intent.reflect / intent.directive` routes existed in dispatcher, but event-bus mainline was said to be missing matching ISC rules.
- `reports/day2-gap-closeout-execution.md`
  - Confirmed another lane had already handled git action routing noise and one handler context-hardening lane.
- `skills/isc-core/rules/`
  - Verified the supposedly missing rules already exist:
    - `rule.intent-ruleify-consumption-001.json`
    - `rule.intent-reflect-consumption-001.json`
    - `rule.intent-directive-consumption-001.json`
- `infrastructure/dispatcher/routes.json`
  - Verified dispatcher routes already exist for all three intent events and point to `intent-event-handler`.
- `infrastructure/dispatcher/handlers/intent-event-handler.js`
  - Verified real implementation exists, not a stub:
    - `intent.ruleify` → creates ISC rule draft + emits `isc.rule.created`
    - `intent.reflect` → routes to CRAS analysis bridge
    - `intent.directive` → creates 本地任务编排 task via bridge

## Gap2 closeout judgment
The cleanest non-conflicting repair path was **not** to add more production code blindly. The prior report’s `U-03` claim is now stale/inaccurate in current workspace state. The best Day2 Gap2 closeout move was therefore:

1. re-verify actual current codepath,
2. prove dispatcher resolves the handlers,
3. prove all 3 intent events dispatch end-to-end on the current lane,
4. leave behind a reusable regression test artifact.

That gives real progress without colliding with active code lanes.

## Implementation performed

### Added regression test
- `tests/unit/day2-gap2-closeout-dispatcher-intent.test.js`

Coverage added:
- dispatcher `resolveHandler()` resolves:
  - `completeness-check`
  - `log-action`
  - workspace-relative path-like handler `infrastructure/event-bus/handlers/log-action.js`
- dispatcher `dispatch()` successfully routes and executes:
  - `intent.ruleify`
  - `intent.reflect`
  - `intent.directive`
- validates returned action marker from `intent-event-handler`

## Validation evidence

### Command run
```bash
node tests/unit/day2-gap2-closeout-dispatcher-intent.test.js
```

### Result
```text
[本地任务编排-Bridge] 创建任务: task_1772930454217_hy9n (Day2 Gap2 directive task)
day2-gap2-closeout-dispatcher-intent.test.js passed
```

### Additional hard findings from inspection
- The three ISC consumption rules already exist in `skills/isc-core/rules/`.
- The three dispatcher routes already exist in `infrastructure/dispatcher/routes.json`.
- The handler implementation exists and is executable in `infrastructure/dispatcher/handlers/intent-event-handler.js`.
- The earlier Gap2 report item is therefore best reclassified from **open implementation gap** to **validated / stale-report drift** in current tree.

## Files changed
- `tests/unit/day2-gap2-closeout-dispatcher-intent.test.js` **(new)**
- `reports/day2-gap2-closeout-dispatcher-intent-validation.md` **(new)**

## Remaining blockers / caveats
1. **Historical archive noise still exists in archived event logs**
   - `infrastructure/event-bus/archive/...` still contains historical `No handler found for action: intent.*` evidence.
   - That is historical evidence, not proof of current breakage.
2. **This validation exercises dispatcher path, not every cron/event-bus entrypoint permutation**
   - Day2 Gap2 on dispatcher intent consumption is materially closed for current codepath.
   - If someone wants full archival close-loop, next step would be a targeted replay/fixture through the exact manual-queue stale-item emitter path.
3. **Test has side effects by design**
   - `intent.directive` creates a 本地任务编排 task artifact.
   - This was acceptable for closeout because it proves the real path executes, but cleanup may be desired later if task artifacts are being curated.

## Closeout conclusion
For the current tree, Day2 Gap2’s cleanest closeout was **verification + regression locking**, not new speculative production edits. The dispatcher intent lane is now backed by a concrete executable test proving all three previously problematic intent events are routable and consumable.
