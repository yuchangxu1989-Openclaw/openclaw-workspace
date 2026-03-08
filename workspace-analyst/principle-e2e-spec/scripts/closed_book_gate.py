#!/usr/bin/env python3
import json
import sys
from pathlib import Path

REQUIRED_TOP = [
    "attestation",
    "evidence_bundle",
    "allowlist",
    "denylist",
    "runtime_inputs",
    "blocked_source_hits",
    "redaction",
    "audit",
]

REQUIRED_AUDIT = [
    "policy_version_present",
    "input_fingerprints_present",
    "scan_summary_present",
    "decision_reason_present",
]

DENYLIST_HINTS = {
    "memory",
    "long_term_memory",
    "retrieval_cache",
    "answer_key",
    "gold_answer",
    "labels",
    "annotations",
    "grader_notes",
    "human_reference",
    "hidden_eval_metadata",
    "solution",
    "rubric_with_answer",
}


def fail(code, reasons):
    print(json.dumps({"verdict": "FAIL", "code": code, "reasons": reasons}, ensure_ascii=False, indent=2))
    sys.exit(2 if code == "CLOSED_BOOK_VIOLATION" else 3)


def load(path):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except Exception as e:
        fail("INVALID_INPUT", [f"cannot read/parse input: {e}"])


def main():
    if len(sys.argv) != 2:
        fail("INVALID_INPUT", ["usage: closed_book_gate.py <runtime.json>"])

    obj = load(sys.argv[1])

    missing = [k for k in REQUIRED_TOP if k not in obj]
    if missing:
        fail("INVALID_INPUT", [f"missing top-level fields: {', '.join(missing)}"])

    reasons = []
    att = obj["attestation"]
    ev = obj["evidence_bundle"]
    allow = set(obj["allowlist"])
    deny = set(obj["denylist"])
    runtime_inputs = list(obj["runtime_inputs"])
    hits = obj["blocked_source_hits"]
    redaction = obj["redaction"]
    audit = obj["audit"]

    if att.get("closed_book") is not True:
        reasons.append("attestation.closed_book must be true")
    if att.get("leaked_source_scan") != "PASS":
        reasons.append("attestation.leaked_source_scan must be PASS")
    if ev.get("present") is not True:
        reasons.append("evidence_bundle.present must be true")

    unknown_inputs = [x for x in runtime_inputs if x not in allow]
    if unknown_inputs:
        reasons.append(f"unknown runtime inputs outside allowlist: {unknown_inputs}")

    deny_hits = [x for x in runtime_inputs if x in deny or x in DENYLIST_HINTS]
    if deny_hits:
        reasons.append(f"denylisted inputs detected: {deny_hits}")

    if hits.get("memory", 0) != 0:
        reasons.append("blocked_source_hits.memory must be 0")
    if hits.get("answers", 0) != 0:
        reasons.append("blocked_source_hits.answers must be 0")
    if hits.get("labels", 0) != 0:
        reasons.append("blocked_source_hits.labels must be 0")
    if hits.get("total", 0) != 0:
        reasons.append("blocked_source_hits.total must be 0")

    if redaction.get("applied") is not True:
        reasons.append("redaction.applied must be true")
    if redaction.get("missed_fields", 1) != 0:
        reasons.append("redaction.missed_fields must be 0")

    missing_audit = [k for k in REQUIRED_AUDIT if audit.get(k) is not True]
    if missing_audit:
        reasons.append(f"incomplete audit fields: {missing_audit}")

    if reasons:
        fail("CLOSED_BOOK_VIOLATION", reasons)

    print(json.dumps({
        "verdict": "SUCCESS",
        "code": "OK",
        "closed_book": True,
        "unknown_inputs": 0,
        "blocked_source_hits": 0,
    }, ensure_ascii=False, indent=2))
    sys.exit(0)


if __name__ == "__main__":
    main()
