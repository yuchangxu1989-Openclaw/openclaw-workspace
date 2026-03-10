# Spawn Routing: Opus Provider Root Fix

**Date:** 2026-03-08  
**Author:** coder subagent  
**Status:** ✅ Completed  

## Problem

`claude-opus-4-6-thinking` model routes were being incorrectly prefixed with `boom-*` provider names (e.g. `boom-coder/claude-opus-4-6-thinking`), causing cross-provider misroutes. The `boom` providers only serve GPT models; Claude models are served by `claude*` providers. There was no validation layer to catch this mismatch before `sessions_spawn` was called.

## Root Cause

The dispatch system (`dispatch-runner.js`) passed model strings with provider prefixes directly to `sessions_spawn` without verifying that the specified provider actually serves that model. When the default model was `boom-coder/gpt-5.4` and a task requested `claude-opus-4-6-thinking`, the provider prefix from the default could leak into the Claude model reference.

## Solution

### 1. New Module: `spawn-routing.js`

Created `/workspace/skills/public/multi-agent-dispatch/spawn-routing.js` with:

| Function | Purpose |
|---|---|
| `splitModelRef(model)` | Parses `"provider/modelId"` → `{ providerPrefix, modelId, qualified }` |
| `buildProviderIndexFromAgents(agentsRoot)` | Reads all `agents/*/agent/models.json` and builds `Map<modelId, Set<providerName>>` |
| `findProvidersForModel(index, modelId)` | Lists valid providers for a model |
| `validateModelProviderRoute(model, opts)` | **Fail-fast**: throws `SPAWN_MODEL_PROVIDER_ROUTE_MISMATCH` if provider doesn't serve the model |
| `failFastNormalizeSpawnPayload(task, opts)` | Validates + normalizes a spawn payload |

### 2. Wired into `dispatch-runner.js`

- Added `require('./spawn-routing')` import
- In `spawnOne()`, before calling `sessions_spawn`, a `validateModelProviderRoute()` check runs
- On mismatch (`SPAWN_MODEL_PROVIDER_ROUTE_MISMATCH`), the spawn is **BLOCKED** with a clear error message naming the model, the wrong provider, and the valid providers
- Provider index is cached per dispatch tick (reset in `drainAndRun`) to avoid redundant filesystem reads

### 3. Provider Index (Live Verification)

From real agent configs at `/root/.openclaw/agents/*/agent/models.json`:

| Model | Valid Providers |
|---|---|
| `claude-opus-4-6-thinking` | `claude`, `claude-analyst`, `claude-coder`, `claude-cron-worker`, `claude-main`, `claude-researcher`, `claude-reviewer`, `claude-scout`, `claude-writer` |
| `gpt-5.4` | `boom-analyst`, `boom-analyst-02`, `boom-coder`, `boom-coder-02`, `boom-cron-worker`, `boom-cron-worker-02`, `boom-main`, `boom-main-02`, ... (19 total) |

**Key assertion confirmed:** No `boom*` provider serves any `claude-opus-*` model. No `claude*` provider serves any `gpt-*` model.

## Test Results

### New Tests: `test/spawn-routing.test.js` — 16/16 ✅

```
✅ splitModelRef: unqualified model
✅ splitModelRef: qualified model with provider prefix
✅ splitModelRef: empty string
✅ splitModelRef: null/undefined
✅ splitModelRef: claude-coder/claude-opus-4-6-thinking
✅ buildProviderIndexFromAgents: reads real agent configs
✅ validateModelProviderRoute: boom/claude-opus-4-6-thinking fails (cross-provider)
✅ validateModelProviderRoute: boom-main/claude-opus-4-6-thinking fails
✅ validateModelProviderRoute: claude/claude-opus-4-6-thinking passes
✅ validateModelProviderRoute: claude-main/claude-opus-4-6-thinking passes
✅ validateModelProviderRoute: unqualified model passes
✅ validateModelProviderRoute: boom-coder/gpt-5.4 passes
✅ validateModelProviderRoute: empty model throws
✅ failFastNormalizeSpawnPayload: strips boom prefix from claude model
✅ failFastNormalizeSpawnPayload: valid claude route normalizes correctly
✅ failFastNormalizeSpawnPayload: unqualified model passthrough
```

### Existing Tests: No Regressions

| Test Suite | Result |
|---|---|
| `runtime-model-key-hardening.min.test.js` | 3/3 ✅ |
| `root-cause-expansion.min.test.js` | 1/1 ✅ |
| `timeout-governance.min.test.js` | 4/4 ✅ |
| `lifecycle-basics.min.test.js` | 2/2 ✅ (partial; engine test has pre-existing import issue) |

## Files Changed

| File | Action |
|---|---|
| `skills/public/multi-agent-dispatch/spawn-routing.js` | **NEW** — model→provider route validation module |
| `skills/public/multi-agent-dispatch/test/spawn-routing.test.js` | **NEW** — 16 tests |
| `skills/public/multi-agent-dispatch/dispatch-runner.js` | **MODIFIED** — added fail-fast route check before `sessions_spawn` |

## What This Fix Does NOT Touch

- ❌ `openclaw.json` — untouched per requirements
- ❌ Agent `models.json` files — read-only (used as source of truth)
- ❌ Gateway configuration — no changes
- ❌ `dispatch-engine.js` — no changes to core scheduling
- ❌ `model-governance.js` — no changes to opus budget governance

## Behavior After Fix

| Scenario | Before | After |
|---|---|---|
| `boom-coder/claude-opus-4-6-thinking` | Silently passed to `sessions_spawn` → API error or wrong model | **BLOCKED** at dispatch-runner with clear error + suggested providers |
| `claude/claude-opus-4-6-thinking` | Worked (sometimes) | ✅ Works, model stripped to `claude-opus-4-6-thinking` for gateway |
| `claude-opus-4-6-thinking` (unqualified) | Worked | ✅ Works unchanged |
| `boom-coder/gpt-5.4` | Worked | ✅ Works, validated against provider index |
