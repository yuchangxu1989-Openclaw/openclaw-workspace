#!/usr/bin/env python3
"""Batch benchmark runner for case-list JSON files.

Runs benchmark_runner.py once per case object and emits a summarized report.
Fail-closed semantics:
- any case FAIL => batch exits 2
- all SUCCESS/SKIP => batch exits 0
"""
import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RUNNER = ROOT / "scripts" / "benchmark_runner.py"
DEFAULT_RUNNER_VERSION = "1.3.0"
RUNNER_TIMEOUT_SECONDS = 60


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def run_case(case_obj: dict, runtime_path: Path, out_dir: Path, runner_version: str):
    case_id = case_obj.get("case_id", "unknown")
    case_path = out_dir / f"{case_id}.case.json"
    out_path = out_dir / f"{case_id}.verdict.json"
    case_path.write_text(json.dumps(case_obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    proc = subprocess.run(
        [
            sys.executable,
            str(RUNNER),
            "--case", str(case_path),
            "--runtime", str(runtime_path),
            "--out", str(out_path),
            "--runner-version", runner_version,
        ],
        capture_output=True,
        text=True,
        timeout=RUNNER_TIMEOUT_SECONDS,
    )
    payload = json.loads(out_path.read_text(encoding="utf-8"))
    return {
        "case_id": case_id,
        "returncode": proc.returncode,
        "stdout": proc.stdout,
        "stderr": proc.stderr,
        "out_path": str(out_path),
        "verdict": payload,
    }


def main():
    parser = argparse.ArgumentParser(description="Run benchmark_runner.py across a case list JSON file")
    parser.add_argument("--cases", required=True, help="Path to JSON array of case objects")
    parser.add_argument("--runtime", required=True, help="Runtime JSON path shared by the batch")
    parser.add_argument("--out", required=True, help="Output summary JSON path")
    parser.add_argument("--runner-version", default=DEFAULT_RUNNER_VERSION)
    args = parser.parse_args()

    cases_path = Path(args.cases)
    runtime_path = Path(args.runtime)
    out_path = Path(args.out)

    case_list = load_json(cases_path)
    if not isinstance(case_list, list):
        print(json.dumps({
            "verdict": "FAIL",
            "code": "INVALID_CASE_LIST",
            "reason": f"expected JSON list, got {type(case_list).__name__}",
        }, ensure_ascii=False, indent=2))
        sys.exit(2)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        results = []
        for case_obj in case_list:
            if not isinstance(case_obj, dict):
                results.append({
                    "case_id": "INVALID",
                    "returncode": 2,
                    "verdict": {"verdict": "FAIL", "reason": f"case entry is {type(case_obj).__name__}, expected dict"},
                })
                continue
            results.append(run_case(case_obj, runtime_path, tmp, args.runner_version))

    counts = {"SUCCESS": 0, "SKIP": 0, "FAIL": 0}
    for item in results:
        verdict = item["verdict"].get("verdict", "FAIL")
        counts[verdict] = counts.get(verdict, 0) + 1

    batch_verdict = "SUCCESS" if counts.get("FAIL", 0) == 0 else "FAIL"
    summary = {
        "batch_verdict": batch_verdict,
        "runner_version": args.runner_version,
        "cases_file": str(cases_path),
        "runtime_file": str(runtime_path),
        "total_cases": len(results),
        "counts": counts,
        "results": [
            {
                "case_id": item["case_id"],
                "returncode": item["returncode"],
                "verdict": item["verdict"].get("verdict"),
                "verdict_id": item["verdict"].get("verdict_id"),
                "hard_gate_failures": item["verdict"].get("hard_gate_failures"),
                "gates_applied": item["verdict"].get("gates_applied"),
                "out_path": item.get("out_path"),
            }
            for item in results
        ],
    }
    out_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    sys.exit(0 if batch_verdict == "SUCCESS" else 2)


if __name__ == "__main__":
    main()
