# PB-010 Benchmark Contract Hardening Report

**Date**: 2026-03-08
**Runner Version**: 1.2.0 → 1.3.0
**Status**: ✅ COMPLETE — 10/10 regression tests pass

---

## 问题诊断

原 benchmark runner (`benchmark_runner.py` v1.2.0) 的 PB-010 相关能力存在 **4 个结构性缺陷**：

| # | 缺陷 | 影响 |
|---|-------|------|
| 1 | **只测规则命中**，没有 RCA / Gap / Fix / Dispatch 阶段 | 系统可以只"命中意图"但不做根因分析就通过 |
| 2 | **无 dispatch 成功率约束** | 派发全失败也不会被拦截 |
| 3 | **`expected_dispatches_min=0` 放水** | case 可以声明"不需要任何派发"来绕过检查 |
| 4 | **无修复方案完整性校验** | 只输出"建议修复"但无行动/目标/理由/回滚也能通过 |

---

## 修复方案

### 1. 新增 4 个 Capability 阶段

在 `benchmark_runner.py` 的 `evaluate_capability()` 中新增：

| Capability | Gate ID | 强制校验项 |
|------------|---------|-----------|
| `rca_analysis` | `CAP-RCA_ANALYSIS` | root_cause 非空、evidence_chain ≥ N、severity、blast_radius |
| `gap_assessment` | `CAP-GAP_ASSESSMENT` | gaps 数量 ≥ N、必含指定 categories、每个 gap 有 category+description、coverage_score |
| `fix_proposal` | `CAP-FIX_PROPOSAL` | fixes 数量 ≥ N、每个 fix 必含 action+target+rationale、rollback_plan |
| `dispatch_verification` | `CAP-DISPATCH_VERIFICATION` | dispatches 数量 ≥ N（下限强制 ≥ 1）、success_rate、must_reach_targets |

### 2. 堵死 `expected_dispatches_min=0` 放水

```python
# ── HARDENING: eliminate expected_dispatches_min=0 loophole ──
raw_min = int(spec.get("min_dispatches", 1))
min_dispatches = max(raw_min, 1)  # floor = 1, never 0
if raw_min < 1:
    reasons.append(f"HARDENING: min_dispatches={raw_min} is below the enforced floor of 1")
```

即使 case JSON 声明 `min_dispatches: 0`，runner 会：
- 强制提升到 1
- 插入 FAIL reason 明确标记放水被拦截
- `dispatch.min_floor_enforced` check 标记为 `passed: false`

### 3. Dispatch 成功率强约束

- `min_success_rate` 默认 1.0（100% 成功率）
- 逐条校验 dispatch 记录的 `target + status + timestamp` 三字段
- `must_reach_targets` 强制检查关键目标是否收到成功派发

---

## 变更清单

| 文件 | 变更 |
|------|------|
| `principle-e2e-spec/scripts/benchmark_runner.py` | v1.2.0→1.3.0; 新增 rca_analysis/gap_assessment/fix_proposal/dispatch_verification 四阶段; CAPABILITY_STAGE_MAP 扩展 |
| `principle-e2e-spec/10-pb010-hardened-cases.json` | **新文件** — 6 个 PB-010 hardened test cases |
| `principle-e2e-spec/examples/pb010_runtime_pass.json` | **新文件** — 通过场景的 runtime fixture |
| `principle-e2e-spec/examples/pb010_runtime_fail.json` | **新文件** — 失败场景的 runtime fixture |
| `principle-e2e-spec/scripts/test_pb010_hardened.py` | **新文件** — 10 项回归测试 |

---

## Test Cases（6 个）

| Case ID | 能力 | 用途 | 预期结果 |
|---------|------|------|---------|
| `pb010-rca-001` | rca_analysis | RCA 根因分析全字段校验 | SUCCESS |
| `pb010-gap-001` | gap_assessment | 缺口盘点 + 分类 + 覆盖度 | SUCCESS |
| `pb010-fix-001` | fix_proposal | 修复方案完整性 + 回滚计划 | SUCCESS |
| `pb010-dispatch-001` | dispatch_verification | 派发成功全约束 | SUCCESS |
| `pb010-dispatch-002-loophole-block` | dispatch_verification | **放水拦截**：min=0 被堵死 | FAIL |
| `pb010-dispatch-003-partial-failure` | dispatch_verification | 部分派发失败 → 拒绝 | FAIL |

---

## 回归测试结果

```
🔧 PB-010 Hardened Benchmark Contract Regression
=======================================================

── RCA Analysis ──
  ✅ rca_pass
  ✅ rca_fail

── Gap Assessment ──
  ✅ gap_pass
  ✅ gap_fail

── Fix Proposal ──
  ✅ fix_pass
  ✅ fix_fail

── Dispatch Verification ──
  ✅ dispatch_pass
  ✅ dispatch_loophole_blocked
  ✅ dispatch_partial_failure

── Backward Compatibility ──
  ✅ existing_regression_intact

=======================================================
Total: 10  |  ✅ Passed: 10  |  ❌ Failed: 0

✅ PB-010 hardened benchmark contract: ALL CHECKS PASSED
```

---

## 向后兼容性

- 原有 08-cases（p2e-ext-001 ~ 004）的 intent_expansion / event_completion / task_expansion 能力完全不受影响
- 新增代码纯为追加，未修改任何现有逻辑分支
- 向后兼容测试在 `test_pb010_hardened.py` 的 `existing_regression_intact` 中验证

---

## 已知遗留项

| 项目 | 状态 | 说明 |
|------|------|------|
| 原 `test_capability_regression.py` 中 p2e-ext-002 | ⚠️ pre-existing | runtime fixture 的 `event_completion.source_event` 值与 case 期望不一致（`nightly_regression.missed` vs `pull_request.merged`），属于 fixture 漂移，非本次变更引入 |
| PB-001~PB-038 全量逐 case 复跑 | 🔲 待补 | 前序报告已标记需要后补 |

---

## 结论

PB-010 benchmark contract 从"只测规则命中"升级为 **RCA → Gap → Fix → Dispatch 全链路强约束**：

1. ✅ **不再只测规则命中** — 4 个新阶段各自独立校验实质产出
2. ✅ **RCA / gap / fix / dispatch success 强约束** — 每个阶段均为 hard_gate / fail_closed
3. ✅ **去掉 expected_dispatches_min=0 放水** — 强制下限 ≥ 1 + 显式标记拦截
4. ✅ **测试已写且全部通过** — 10 项回归测试，含正路径/负路径/放水拦截/向后兼容
5. ✅ **输出到本报告**
