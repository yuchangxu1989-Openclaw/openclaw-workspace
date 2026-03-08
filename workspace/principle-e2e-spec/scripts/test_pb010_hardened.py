#!/usr/bin/env python3
"""PB-010 Hardened Benchmark Contract Regression Tests.

Tests the 4 new capability stages (rca_analysis, gap_assessment, fix_proposal,
dispatch_verification) plus the min_dispatches=0 loophole block.

Exit 0 = all pass, Exit 1 = failure.
"""
import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RUNNER = ROOT / "scripts" / "benchmark_runner.py"
CASE_FILE = ROOT / "10-pb010-hardened-cases.json"
PASS_RUNTIME = ROOT / "examples" / "pb010_runtime_pass.json"
FAIL_RUNTIME = ROOT / "examples" / "pb010_runtime_fail.json"

RUNNER_TIMEOUT_SECONDS = 60

passed = 0
failed = 0
errors = []


def load_cases():
    return {c["case_id"]: c for c in json.loads(CASE_FILE.read_text(encoding="utf-8"))}


def run_case(case_obj, runtime_path):
    with tempfile.TemporaryDirectory() as tmpdir:
        case_path = Path(tmpdir) / f"{case_obj['case_id']}.json"
        out_path = Path(tmpdir) / f"{case_obj['case_id']}.out.json"
        case_path.write_text(json.dumps(case_obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        try:
            proc = subprocess.run(
                [sys.executable, str(RUNNER), "--case", str(case_path), "--runtime", str(runtime_path), "--out", str(out_path)],
                capture_output=True, text=True, timeout=RUNNER_TIMEOUT_SECONDS,
            )
        except subprocess.TimeoutExpired as e:
            raise AssertionError(f"runner timed out for {case_obj['case_id']}: {e}")
        payload = json.loads(out_path.read_text(encoding="utf-8"))
        return proc.returncode, payload


def assert_eq(actual, expected, msg):
    if actual != expected:
        raise AssertionError(f"{msg}: expected={expected!r}, actual={actual!r}")


def assert_true(cond, msg):
    if not cond:
        raise AssertionError(msg)


def check(name, fn):
    global passed, failed
    try:
        fn()
        passed += 1
        print(f"  ✅ {name}")
    except Exception as e:
        failed += 1
        errors.append(f"{name}: {e}")
        print(f"  ❌ {name}: {e}")


def test_rca_pass(cases):
    """RCA analysis with full outputs should PASS."""
    rc, p = run_case(cases["pb010-rca-001"], PASS_RUNTIME)
    assert_eq(rc, 0, "exit code")
    assert_eq(p["verdict"], "SUCCESS", "verdict")
    rca_stage = next(s for s in p["stage_results"] if s["gate_id"] == "CAP-RCA_ANALYSIS")
    assert_eq(rca_stage["verdict"], "PASS", "rca stage verdict")
    # Verify checks ran
    check_ids = {c["check_id"] for c in rca_stage["checks"]}
    assert_true("rca.root_cause_present" in check_ids, "root_cause check missing")
    assert_true("rca.evidence_chain" in check_ids, "evidence_chain check missing")
    assert_true("rca.severity" in check_ids, "severity check missing")


def test_rca_fail(cases):
    """RCA analysis with empty root_cause should FAIL."""
    rc, p = run_case(cases["pb010-rca-001"], FAIL_RUNTIME)
    assert_eq(rc, 2, "exit code should be 2 for fail")
    assert_eq(p["verdict"], "FAIL", "verdict")
    rca_stage = next(s for s in p["stage_results"] if s["gate_id"] == "CAP-RCA_ANALYSIS")
    assert_eq(rca_stage["verdict"], "FAIL", "rca stage should fail with empty outputs")


def test_gap_pass(cases):
    """Gap assessment with full outputs should PASS."""
    rc, p = run_case(cases["pb010-gap-001"], PASS_RUNTIME)
    assert_eq(rc, 0, "exit code")
    assert_eq(p["verdict"], "SUCCESS", "verdict")
    gap_stage = next(s for s in p["stage_results"] if s["gate_id"] == "CAP-GAP_ASSESSMENT")
    assert_eq(gap_stage["verdict"], "PASS", "gap stage verdict")
    check_ids = {c["check_id"] for c in gap_stage["checks"]}
    assert_true("gap.count" in check_ids, "gap.count check missing")
    assert_true("gap.categories" in check_ids, "gap.categories check missing")
    assert_true("gap.coverage_score" in check_ids, "gap.coverage_score check missing")


def test_gap_fail(cases):
    """Gap assessment missing 'configuration' category should FAIL."""
    rc, p = run_case(cases["pb010-gap-001"], FAIL_RUNTIME)
    assert_eq(rc, 2, "exit code")
    assert_eq(p["verdict"], "FAIL", "verdict")
    gap_stage = next(s for s in p["stage_results"] if s["gate_id"] == "CAP-GAP_ASSESSMENT")
    assert_eq(gap_stage["verdict"], "FAIL", "gap stage should fail")


def test_fix_pass(cases):
    """Fix proposal with complete outputs should PASS."""
    rc, p = run_case(cases["pb010-fix-001"], PASS_RUNTIME)
    assert_eq(rc, 0, "exit code")
    assert_eq(p["verdict"], "SUCCESS", "verdict")
    fix_stage = next(s for s in p["stage_results"] if s["gate_id"] == "CAP-FIX_PROPOSAL")
    assert_eq(fix_stage["verdict"], "PASS", "fix stage verdict")


def test_fix_fail(cases):
    """Fix proposal with empty target/rationale should FAIL."""
    rc, p = run_case(cases["pb010-fix-001"], FAIL_RUNTIME)
    assert_eq(rc, 2, "exit code")
    assert_eq(p["verdict"], "FAIL", "verdict")
    fix_stage = next(s for s in p["stage_results"] if s["gate_id"] == "CAP-FIX_PROPOSAL")
    assert_eq(fix_stage["verdict"], "FAIL", "fix stage should fail on incomplete fields")


def test_dispatch_pass(cases):
    """Dispatch verification with 2 successful dispatches should PASS."""
    rc, p = run_case(cases["pb010-dispatch-001"], PASS_RUNTIME)
    assert_eq(rc, 0, "exit code")
    assert_eq(p["verdict"], "SUCCESS", "verdict")
    disp_stage = next(s for s in p["stage_results"] if s["gate_id"] == "CAP-DISPATCH_VERIFICATION")
    assert_eq(disp_stage["verdict"], "PASS", "dispatch stage verdict")
    check_ids = {c["check_id"] for c in disp_stage["checks"]}
    assert_true("dispatch.count" in check_ids, "dispatch.count check missing")
    assert_true("dispatch.success_rate" in check_ids, "dispatch.success_rate check missing")
    assert_true("dispatch.targets_reached" in check_ids, "dispatch.targets_reached check missing")
    assert_true("dispatch.min_floor_enforced" in check_ids, "dispatch.min_floor_enforced check missing")


def test_dispatch_loophole_blocked(cases):
    """min_dispatches=0 loophole: even with good runtime, the HARDENING floor blocks it."""
    # This case has min_dispatches=0 but the runner enforces floor=1.
    # The PASS runtime has dispatches, but verdict_expectation=FAIL because
    # the hardening logic inserts a failure reason for the loophole itself.
    rc, p = run_case(cases["pb010-dispatch-002-loophole-block"], PASS_RUNTIME)
    assert_eq(rc, 2, "exit code should be 2 — loophole blocked")
    assert_eq(p["verdict"], "FAIL", "verdict should be FAIL — loophole blocked")
    disp_stage = next(s for s in p["stage_results"] if s["gate_id"] == "CAP-DISPATCH_VERIFICATION")
    assert_eq(disp_stage["verdict"], "FAIL", "dispatch stage should FAIL due to loophole block")
    # Verify the hardening reason is in the details
    reasons = disp_stage["details"].get("reasons", [])
    assert_true(any("loophole" in r.lower() or "HARDENING" in r for r in reasons),
                f"expected loophole block reason, got: {reasons}")


def test_dispatch_partial_failure(cases):
    """Partial dispatch failure (1 success + 1 failed) should FAIL when min_success_rate=1.0."""
    rc, p = run_case(cases["pb010-dispatch-003-partial-failure"], FAIL_RUNTIME)
    assert_eq(rc, 2, "exit code")
    assert_eq(p["verdict"], "FAIL", "verdict")
    disp_stage = next(s for s in p["stage_results"] if s["gate_id"] == "CAP-DISPATCH_VERIFICATION")
    assert_eq(disp_stage["verdict"], "FAIL", "dispatch stage should fail")
    # Verify success_rate check failed
    rate_check = next(c for c in disp_stage["checks"] if c["check_id"] == "dispatch.success_rate")
    assert_eq(rate_check["passed"], False, "success_rate check should fail")
    assert_eq(rate_check["actual_value"], 0.5, "success_rate should be 0.5")


def test_existing_regression_still_passes(cases_08):
    """Existing capability regression (08-cases) should still pass — no regressions from hardening."""
    for cid in ["p2e-ext-001", "p2e-ext-002", "p2e-ext-003"]:
        orig_runtime = ROOT / "examples" / "capability_runtime_pass.json"
        rc, p = run_case(cases_08[cid], orig_runtime)
        assert_eq(rc, 0, f"{cid} exit code")
        assert_eq(p["verdict"], "SUCCESS", f"{cid} verdict")
    # ext-004 should SKIP
    rc, p = run_case(cases_08["p2e-ext-004"], ROOT / "examples" / "capability_runtime_pass.json")
    assert_eq(rc, 0, "p2e-ext-004 exit code")
    assert_eq(p["verdict"], "SKIP", "p2e-ext-004 verdict should be SKIP")


def main():
    print("🔧 PB-010 Hardened Benchmark Contract Regression")
    print("=" * 55)

    cases = load_cases()
    cases_08 = {c["case_id"]: c for c in json.loads(
        (ROOT / "08-capability-test-cases.json").read_text(encoding="utf-8")
    )}

    print("\n── RCA Analysis ──")
    check("rca_pass", lambda: test_rca_pass(cases))
    check("rca_fail", lambda: test_rca_fail(cases))

    print("\n── Gap Assessment ──")
    check("gap_pass", lambda: test_gap_pass(cases))
    check("gap_fail", lambda: test_gap_fail(cases))

    print("\n── Fix Proposal ──")
    check("fix_pass", lambda: test_fix_pass(cases))
    check("fix_fail", lambda: test_fix_fail(cases))

    print("\n── Dispatch Verification ──")
    check("dispatch_pass", lambda: test_dispatch_pass(cases))
    check("dispatch_loophole_blocked", lambda: test_dispatch_loophole_blocked(cases))
    check("dispatch_partial_failure", lambda: test_dispatch_partial_failure(cases))

    print("\n── Backward Compatibility ──")
    check("existing_regression_intact", lambda: test_existing_regression_still_passes(cases_08))

    print(f"\n{'=' * 55}")
    print(f"Total: {passed + failed}  |  ✅ Passed: {passed}  |  ❌ Failed: {failed}")
    if errors:
        print("\nFailures:")
        for e in errors:
            print(f"  • {e}")
        sys.exit(1)
    else:
        print("\n✅ PB-010 hardened benchmark contract: ALL CHECKS PASSED")
        sys.exit(0)


if __name__ == "__main__":
    main()
