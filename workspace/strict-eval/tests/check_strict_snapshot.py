#!/usr/bin/env python3
import json
import sys
from pathlib import Path

REQUIRED_FLAGS = [
    "request_observed",
    "admitted",
    "plan_materialized",
    "execution_attempted",
    "external_effect_verified",
    "completion_verified",
    "on_failure_badcase_written",
    "audit_trace_present",
    "no_hidden_manual_patch",
]


def load(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: check_strict_snapshot.py <snapshot.json>")
        return 2

    path = Path(sys.argv[1])
    data = load(path)
    failures = []

    if data.get("schema_version") != "2026-03-08.strict-v1":
        failures.append("schema_version mismatch")

    evidence = data.get("evidence")
    if not isinstance(evidence, dict):
        failures.append("missing evidence object")
        evidence = {}

    missing_flags = [flag for flag in REQUIRED_FLAGS if flag not in evidence]
    if missing_flags:
        failures.append("missing evidence flags: " + ", ".join(missing_flags))

    false_flags = [flag for flag in REQUIRED_FLAGS if isinstance(evidence.get(flag), dict) and evidence[flag].get("present") is not True]

    verdict = (((data.get("verdict") or {}).get("status")) or "").strip()
    strict_failures = (((data.get("review") or {}).get("strict_failures")) or [])

    if verdict == "pass" and false_flags:
        failures.append("pass verdict invalid when evidence flags are false: " + ", ".join(false_flags))

    if verdict != "pass" and not strict_failures and false_flags:
        failures.append("non-pass verdict must enumerate strict_failures when evidence missing")

    if failures:
        print("STRICT_SNAPSHOT_CHECK=FAIL")
        for item in failures:
            print(f"- {item}")
        return 1

    print("STRICT_SNAPSHOT_CHECK=OK")
    print(f"verdict={verdict}")
    print(f"false_flags={','.join(false_flags) if false_flags else '(none)'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
