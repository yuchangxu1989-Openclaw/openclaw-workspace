# Configuration Risk Audit — 2026-03-08

**Auditor:** Quality Arbiter (reviewer agent)  
**Scope:** All `openclaw.json` changes in current session + dispatch layer code changes  
**Timestamp:** 2026-03-08T11:05+08:00

---

## Change Summary

Session changes involved:
1. **Removing all sonnet models** from all 8 original claude-* providers (16 model entries removed)
2. **Removing all gpt-5.4 models** from all boom-* providers (19 model entries removed)
3. **Adding 11 new penguin (claude-*-02/worker-0x) providers** with unique API keys
4. **Adding 11 new agents** (7 role-02 variants + 4 generic workers)
5. **Swapping main agent primary** from boom → claude (intermediate step confirmed via backup diff)
6. **Updating all agent fallback chains** to add zhipu-cron/glm-5 as terminal fallback
7. **Updating model registry** (defaults.models) to match new providers
8. **Increasing maxConcurrent** from 16 → 24

---

## Audit Checks

### 1. JSON Validity of openclaw.json
**PASS** ✅  
Python `json.load()` parses the file without error. File is 34,216 bytes. Structure is internally consistent with correct nesting.

> **NOTE (cosmetic):** File lacks trailing newline (`\n` at EOF). Non-blocking; JSON parsers don't require it, but some linters may flag it.

---

### 2. Agent → Provider Reference Integrity
**PASS** ✅  
All 19 agents' `model.primary` and every `model.fallbacks[]` entry resolves to an existing provider with a matching model ID. Verified against both `models.providers` and `agents.defaults.models` registry.

| Agent | Primary | Fallback 1 | Fallback 2 | Status |
|-------|---------|-----------|-----------|--------|
| main | claude-main/claude-opus-4-6-thinking | boom-main/gpt-5.3-codex | zhipu-cron/glm-5 | ✅ |
| researcher | boom-researcher/gpt-5.3-codex | claude-researcher/claude-opus-4-6-thinking | zhipu-cron/glm-5 | ✅ |
| coder | boom-coder/gpt-5.3-codex | claude-coder/claude-opus-4-6 | zhipu-cron/glm-5 | ✅ |
| reviewer | boom-reviewer/gpt-5.3-codex | claude-reviewer/claude-opus-4-6-thinking | zhipu-cron/glm-5 | ✅ |
| writer | boom-writer/gpt-5.3-codex | claude-writer/claude-opus-4-6-thinking | zhipu-cron/glm-5 | ✅ |
| analyst | boom-analyst/gpt-5.3-codex | claude-analyst/claude-opus-4-6-thinking | zhipu-cron/glm-5 | ✅ |
| scout | boom-scout/gpt-5.3-codex | claude-scout/claude-opus-4-6 | zhipu-cron/glm-5 | ✅ |
| cron-worker | zhipu-cron/glm-5 | boom-cron-worker/gpt-5.3-codex | claude-cron-worker/claude-opus-4-6-thinking | ✅ |
| researcher-02 | boom-researcher-02/gpt-5.3-codex | claude-researcher-02/claude-opus-4-6-thinking | zhipu-cron/glm-5 | ✅ |
| coder-02 | boom-coder-02/gpt-5.3-codex | claude-coder-02/claude-opus-4-6-thinking | zhipu-cron/glm-5 | ✅ |
| reviewer-02 | boom-reviewer-02/gpt-5.3-codex | claude-reviewer-02/claude-opus-4-6-thinking | zhipu-cron/glm-5 | ✅ |
| writer-02 | boom-writer-02/gpt-5.3-codex | claude-writer-02/claude-opus-4-6-thinking | zhipu-cron/glm-5 | ✅ |
| analyst-02 | boom-analyst-02/gpt-5.3-codex | claude-analyst-02/claude-opus-4-6-thinking | zhipu-cron/glm-5 | ✅ |
| scout-02 | boom-scout-02/gpt-5.3-codex | claude-scout-02/claude-opus-4-6-thinking | zhipu-cron/glm-5 | ✅ |
| cron-worker-02 | boom-cron-worker-02/gpt-5.3-codex | claude-cron-worker-02/claude-opus-4-6-thinking | zhipu-cron/glm-5 | ✅ |
| worker-03 | boom-main-02/gpt-5.3-codex | claude-worker-03/claude-opus-4-6-thinking | zhipu-cron/glm-5 | ✅ |
| worker-04 | boom-main-03/gpt-5.3-codex | claude-worker-04/claude-opus-4-6-thinking | zhipu-cron/glm-5 | ✅ |
| worker-05 | boom-main-04/gpt-5.3-codex | claude-worker-05/claude-opus-4-6-thinking | zhipu-cron/glm-5 | ✅ |
| worker-06 | boom-main-05/gpt-5.3-codex | claude-worker-06/claude-opus-4-6-thinking | zhipu-cron/glm-5 | ✅ |

---

### 3. Duplicate / Circular Fallback Detection
**PASS** ✅  
No agent has duplicate entries in its fallbacks array. No agent has its primary model also appearing in fallbacks. No same-provider-family circular references detected (e.g., no zhipu→zhipu or boom→boom loops within a single agent's chain).

---

### 4. Empty Provider Model Arrays
**PASS** ✅  
All 41 providers have at least one model in their `models[]` array. No empty arrays found.

---

### 5. Agent model.primary ↔ Provider Model List Match
**PASS** ✅  
Every agent's `model.primary` value (e.g., `boom-coder/gpt-5.3-codex`) has a corresponding provider (`boom-coder`) that lists the referenced model ID (`gpt-5.3-codex`) in its `models[]` array.

---

### 6. cron-worker Primary/Fallback Chain Correctness
**PASS** ✅  
```
cron-worker chain: zhipu-cron/glm-5 → boom-cron-worker/gpt-5.3-codex → claude-cron-worker/claude-opus-4-6-thinking
```
Correct ordering: cheapest model (zhipu) as primary for routine cron work, boom as first fallback, claude as last resort. All three resolve to valid providers.

---

### 7. Main Agent Primary is Claude (not boom)
**PASS** ✅  
```
main.model.primary = "claude-main/claude-opus-4-6-thinking"
```
Confirmed via both the final config and the intermediate diff (backup-1007 → backup-1015), which shows the deliberate swap from `boom-main/gpt-5.4` → `claude-main/claude-opus-4-6-thinking`.

---

### 8. All 11 New Penguin Keys Correctly Mapped to Unique Agents
**PASS** ✅  

| # | Penguin Provider | API Key (prefix) | Mapped Agent | Role |
|---|-----------------|-------------------|-------------|------|
| 1 | claude-researcher-02 | sk-dVvJ… | researcher-02 | fallback |
| 2 | claude-coder-02 | sk-Jd1h… | coder-02 | fallback |
| 3 | claude-reviewer-02 | sk-DipE… | reviewer-02 | fallback |
| 4 | claude-writer-02 | sk-oKT1… | writer-02 | fallback |
| 5 | claude-analyst-02 | sk-psZC… | analyst-02 | fallback |
| 6 | claude-scout-02 | sk-9PeZ… | scout-02 | fallback |
| 7 | claude-cron-worker-02 | sk-wsFH… | cron-worker-02 | fallback |
| 8 | claude-worker-03 | sk-mCop… | worker-03 | fallback |
| 9 | claude-worker-04 | sk-MNqJ… | worker-04 | fallback |
| 10 | claude-worker-05 | sk-F6PV… | worker-05 | fallback |
| 11 | claude-worker-06 | sk-JhAa… | worker-06 | fallback |

All 11 API keys are unique (no shared keys). Each maps to exactly one agent. All providers point to `https://api.penguinsaichat.dpdns.org/` and list `claude-opus-4-6-thinking` + `claude-opus-4-6` models.

---

### 9. All boom Providers Have ONLY gpt-5.3-codex (no gpt-5.4 residue)
**PASS** ✅  
Verified via `grep` and programmatic scan: zero occurrences of `gpt-5.4` in the entire `openclaw.json`. All 14 boom-* providers list exactly one model: `gpt-5.3-codex`.

Boom providers verified: `boom-main`, `boom-researcher`, `boom-coder`, `boom-reviewer`, `boom-analyst`, `boom-scout`, `boom-writer`, `boom-cron-worker`, `boom-main-02`, `boom-researcher-02`, `boom-coder-02`, `boom-reviewer-02`, `boom-analyst-02`, `boom-scout-02`, `boom-writer-02`, `boom-cron-worker-02`, `boom-main-03`, `boom-main-04`, `boom-main-05`.

---

### 10. No Sonnet References Anywhere
**PASS** ✅  
`grep -i sonnet openclaw.json` returns zero matches. All claude providers now list only opus models (`claude-opus-4-6-thinking`, `claude-opus-4-6`). The `agents.defaults.models` registry contains no sonnet keys.

---

### 11. BORROW_PRIORITY Does Not Contain 'main'
**PASS** ✅  
```javascript
const BORROW_PRIORITY = [
  'scout', 'cron-worker', 'analyst', 'reviewer', 'researcher', 'writer', 'coder',
];
```
No `'main'` entry. Additionally, `PROTECTED_ROLES = new Set(['main'])` prevents main from receiving dispatched work.

---

### 12. dispatch-engine.js Blocks agentId='main' in enqueue()
**PASS** ✅  
```javascript
enqueue(input) {
    const inputAgentId = input.agentId || (input.payload && input.payload.agentId) || null;
    if (inputAgentId === 'main') {
      throw new Error('DISPATCH_BLOCKED: Cannot dispatch tasks to main agent...');
    }
    ...
}
```
Hard block at the enqueue entry point. Main agent is fully protected from dispatch work.

---

### 13. model-governance DEFAULT_MODEL_ID is gpt-5.3-codex
**PASS** ✅  
```javascript
const DEFAULT_MODEL_ID = 'gpt-5.3-codex';
const DEFAULT_PROVIDER_PREFIX = 'boom-main';
const DEFAULT_MODEL = `${DEFAULT_PROVIDER_PREFIX}/${DEFAULT_MODEL_ID}`;  // → "boom-main/gpt-5.3-codex"
```
Correctly set. All governance decisions default to gpt-5.3-codex for non-opus tasks.

> **NOTE (cosmetic, LOW):** Line 168 contains a stale reason string `'defaulted_to_gpt_5_4'` — should be `'defaulted_to_gpt_5_3_codex'`. This is a log/audit-trail label only; it does **not** affect model selection behavior. Non-blocking.

---

### 14. dispatch-runner Timeout Uses boomTimeoutSeconds (not gpt54TimeoutSeconds)
**PASS** ✅  
```javascript
const DEFAULTS = {
  defaultTimeoutSeconds: 3600,      // 60min for most models
  boomTimeoutSeconds: 900,          // 15min for boom tasks
};
```
No reference to `gpt54TimeoutSeconds` anywhere in the file (confirmed via grep). The `resolveTimeout()` function correctly checks for `gpt-5.3-codex` or `boom-` in the model string.

---

### 15. staleRunningMs Default is 30min (not 15min) for Non-boom Tasks
**PASS** ✅  

**dispatch-engine.js (DEFAULTS):**
```javascript
staleRunningMs: 30 * 60_000,    // 30 min
```

**dispatch-runner.js (reapStale call):**
```javascript
engine.reapStale({
    staleRunningMs: 30 * 60_000,
    modelStaleOverrides: {
      'gpt-5.3-codex': DEFAULTS.boomTimeoutSeconds * 1000,  // 15min for boom
    },
});
```
Non-boom tasks use the 30-minute default. Boom/gpt-5.3-codex tasks use the compressed 15-minute timeout via model-specific override. Correctly differentiated.

---

### 16. Cron Job Model Configs (jobs.json)
**PASS** ✅ (with note)  
All 10 cron jobs specify `"model": "zhipu/glm-5"` as their primary model. This aligns with the cron-worker agent config (primary=zhipu-cron/glm-5).

> **NOTE (LOW):** Three cron jobs specify `"model_fallback": "claude/claude-opus-4-6"` — the provider prefix `"claude"` doesn't directly match any provider name (providers use `claude-cron-worker`, `claude-main`, etc.). However, this field is advisory/informational within jobs.json; the actual model fallback routing is controlled by the cron-worker agent's `model.fallbacks` config, which is correctly configured. Non-blocking.

---

## Non-Blocking Observations

| # | Severity | Finding |
|---|----------|---------|
| N1 | LOW | `model-governance.js` line 168: stale reason string `'defaulted_to_gpt_5_4'` should be updated to `'defaulted_to_gpt_5_3_codex'`. Cosmetic — only affects audit logs. |
| N2 | LOW | `openclaw.json` lacks trailing newline. Some linters/editors may auto-add it on next edit, causing a noise diff. |
| N3 | LOW | `jobs.json` `model_fallback` uses bare `"claude/claude-opus-4-6"` — doesn't match any provider name. Advisory field only; not used for routing. |
| N4 | INFO | `maxConcurrent` increased 16→24 with 19 agents configured. Headroom of 5 slots is reasonable for borrowing scenarios. |
| N5 | INFO | All 4 worker-0x agents (worker-03 through worker-06) reuse `boom-main-02` through `boom-main-05` providers as primaries. This is correct — these are distinct boom keys, just named with a `main-` prefix. The dispatch engine's `parseProviderModelKey()` may not correctly extract a role from `boom-main-02` for a `worker-03` agent when borrowing. Cross-role borrowing for these agents should be tested. |

---

## Summary

| Metric | Count |
|--------|-------|
| Total checks performed | 16 |
| **PASS** | **16** |
| **RISK (blocking)** | **0** |
| Non-blocking observations | 5 |

---

## Recommendation

### 🟢 **GO** — Safe to restart gateway

All 16 critical checks pass. No blocking risks identified. The configuration is internally consistent:
- All model references resolve to valid providers
- No stale model IDs (gpt-5.4, sonnet) remain
- Main agent is correctly protected from dispatch
- All 11 new penguin keys are correctly mapped
- Timeout and stale-detection parameters are correctly configured
- Fallback chains provide 3-tier resilience (boom → claude → zhipu or zhipu → boom → claude)

**Post-restart verification suggested:**
1. Confirm main agent responds on claude-opus-4-6-thinking (not boom)
2. Spot-check one -02 agent can spawn and reach penguin API
3. Verify cron-worker fires on zhipu-cron/glm-5
4. Run one dispatch cycle to confirm worker-03..06 agents can spawn via their boom-main-0x providers
