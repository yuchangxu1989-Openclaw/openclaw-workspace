#!/usr/bin/env python3
import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CLOSED_BOOK_GATE = ROOT / "scripts" / "closed_book_gate.py"
DEFAULT_INTENT_GATE = "ISC-INTENT-EVAL-001"
DEFAULT_CLOSED_BOOK_GATE = "ISC-CLOSED-BOOK-001"
DEFAULT_RUNNER_VERSION = "1.0.0"


def iso_now() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def run_closed_book(runtime_path: Path):
    proc = subprocess.run(
        [sys.executable, str(CLOSED_BOOK_GATE), str(runtime_path)],
        capture_output=True,
        text=True,
    )
    stdout = (proc.stdout or "").strip()
    try:
        payload = json.loads(stdout) if stdout else {"verdict": "FAIL", "code": "EMPTY_OUTPUT", "reasons": ["gate emitted no JSON"]}
    except json.JSONDecodeError:
        payload = {"verdict": "FAIL", "code": "INVALID_GATE_OUTPUT", "reasons": [stdout or proc.stderr.strip() or "unknown gate output"]}
    return proc.returncode, payload


def evaluate_case(case_obj: dict, runtime_path: Path, runner_version: str):
    gate_order = [DEFAULT_INTENT_GATE, DEFAULT_CLOSED_BOOK_GATE]
    results = []
    hard_gate_failures = 0

    intent_pass = True
    required_case_fields = ["case_id", "intent_type", "input", "expected", "verdict_expectation", "priority", "tags", "regression_guard"]
    missing_case_fields = [k for k in required_case_fields if k not in case_obj]
    if missing_case_fields:
        intent_pass = False
        hard_gate_failures += 1
        intent_reasons = [f"missing benchmark case fields: {', '.join(missing_case_fields)}"]
    else:
        intent_reasons = []

    if case_obj.get("intent_type") not in {"PRINCIPLE", "VERDICT", "CONSTRAINT", "GOAL", "DIRECTIVE"}:
        intent_pass = False
        hard_gate_failures += 1
        intent_reasons.append(f"unsupported intent_type: {case_obj.get('intent_type')}")

    results.append({
        "gate_id": DEFAULT_INTENT_GATE,
        "stage_id": "intent",
        "verdict": "PASS" if intent_pass else "FAIL",
        "fail_closed": True,
        "hard_gate": True,
        "details": {
            "validated_fields": required_case_fields,
            "reasons": intent_reasons,
        },
    })

    closed_book_rc, closed_book_payload = run_closed_book(runtime_path)
    closed_book_pass = closed_book_rc == 0 and closed_book_payload.get("verdict") == "SUCCESS"
    if not closed_book_pass:
        hard_gate_failures += 1

    results.append({
        "gate_id": DEFAULT_CLOSED_BOOK_GATE,
        "stage_id": "gate",
        "verdict": "PASS" if closed_book_pass else "FAIL",
        "fail_closed": True,
        "hard_gate": True,
        "details": {
            "exit_code": closed_book_rc,
            "payload": closed_book_payload,
        },
    })

    final_verdict = "SUCCESS" if hard_gate_failures == 0 else "FAIL"
    p2e_score = 1.0 if final_verdict == "SUCCESS" else 0.0

    return {
        "verdict_id": f"verdict-{case_obj.get('case_id', 'unknown')}",
        "run_id": f"benchmark-run-{runtime_path.stem}",
        "case_id": case_obj.get("case_id", "unknown"),
        "verdict": final_verdict,
        "p2e_score": p2e_score,
        "hard_gate_failures": hard_gate_failures,
        "stage_results": results,
        "created_at": iso_now(),
        "runner_version": runner_version,
        "gates_applied": gate_order,
        "default_fail_closed": True,
    }


def main():
    parser = argparse.ArgumentParser(description="Unified benchmark runner with dual fail-closed gates")
    parser.add_argument("--case", required=True, help="Benchmark case JSON path")
    parser.add_argument("--runtime", required=True, help="Closed-book runtime JSON path")
    parser.add_argument("--out", required=True, help="Output verdict JSON path")
    parser.add_argument("--runner-version", default=DEFAULT_RUNNER_VERSION)
    args = parser.parse_args()

    case_path = Path(args.case)
    runtime_path = Path(args.runtime)
    out_path = Path(args.out)

    case_obj = load_json(case_path)
    verdict = evaluate_case(case_obj, runtime_path, args.runner_version)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(verdict, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(json.dumps(verdict, ensure_ascii=False, indent=2))
    sys.exit(0 if verdict["verdict"] == "SUCCESS" else 2)


if __name__ == "__main__":
    main()
