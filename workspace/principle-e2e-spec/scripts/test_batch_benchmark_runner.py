#!/usr/bin/env python3
import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BATCH_RUNNER = ROOT / "scripts" / "batch_benchmark_runner.py"
CASES_08 = ROOT / "08-capability-test-cases.json"
CASES_PB010 = ROOT / "10-pb010-hardened-cases.json"
PASS_RUNTIME = ROOT / "examples" / "capability_runtime_pass.json"
PB010_PASS_RUNTIME = ROOT / "examples" / "pb010_runtime_pass.json"
PB010_FAIL_RUNTIME = ROOT / "examples" / "pb010_runtime_fail.json"
TIMEOUT_SECONDS = 120


def run_batch(cases_path: Path, runtime_path: Path):
    with tempfile.TemporaryDirectory() as tmpdir:
        out_path = Path(tmpdir) / "batch.out.json"
        proc = subprocess.run(
            [sys.executable, str(BATCH_RUNNER), "--cases", str(cases_path), "--runtime", str(runtime_path), "--out", str(out_path)],
            capture_output=True,
            text=True,
            timeout=TIMEOUT_SECONDS,
        )
        payload = json.loads(out_path.read_text(encoding="utf-8"))
        return proc.returncode, payload


def assert_true(cond, msg):
    if not cond:
        raise AssertionError(msg)


def main():
    rc, payload = run_batch(CASES_08, PASS_RUNTIME)
    assert_true(rc == 0, "08 capability batch should succeed when shared pass runtime satisfies all current cases")
    assert_true(payload["total_cases"] >= 7, "08 capability batch should include expanded cases")
    assert_true(payload["counts"]["SUCCESS"] >= 1, "08 capability batch should include successful cases")
    assert_true(payload["counts"]["SKIP"] >= 1, "08 capability batch should include skip cases")
    assert_true(payload["counts"]["FAIL"] == 0, "08 capability batch should have no fail cases under the shared pass runtime")

    rc, payload = run_batch(CASES_PB010, PB010_PASS_RUNTIME)
    assert_true(rc == 2, "PB010 batch against pass runtime should fail due to loophole-block negative case")
    result_map = {item["case_id"]: item for item in payload["results"]}
    assert_true(result_map["pb010-rca-001"]["verdict"] == "SUCCESS", "pb010-rca-001 should succeed in batch mode")
    assert_true(result_map["pb010-dispatch-002-loophole-block"]["verdict"] == "FAIL", "loophole block case should fail in batch mode")

    rc, payload = run_batch(CASES_PB010, PB010_FAIL_RUNTIME)
    assert_true(rc == 2, "PB010 batch against fail runtime should fail")
    assert_true(payload["counts"]["FAIL"] >= 3, "PB010 fail runtime should produce multiple failures")

    print("✅ batch benchmark runner regression passed")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"❌ batch benchmark runner regression failed: {e}", file=sys.stderr)
        sys.exit(1)
