#!/usr/bin/env python3
import json
import os
import sys
from pathlib import Path

FAIL_MSG = "FAIL-CLOSED: no LLM intent-recognition foundation, cannot report pass."


def load_payload(path: str):
    p = Path(path)
    if not p.exists():
        return None, f"input not found: {path}"
    try:
        return json.loads(p.read_text(encoding='utf-8')), None
    except Exception as e:
        return None, f"invalid json: {e}"


def wants_pass(payload: dict) -> bool:
    text = json.dumps(payload, ensure_ascii=False).lower()
    keys = [
        '"pass"', '"passed"', '通过', '可汇报通过', 'green', 'sign-off', 'signoff'
    ]
    return any(k in text for k in keys)


def main():
    if len(sys.argv) != 2:
        print("usage: gate_intent_eval.py <evaluation.json>", file=sys.stderr)
        sys.exit(2)

    payload, err = load_payload(sys.argv[1])
    if err:
        print(f"{FAIL_MSG} ({err})")
        sys.exit(2)

    intent_basis = payload.get('intent_basis') or {}
    llm_primary = intent_basis.get('llm_as_primary') is True
    evidence = intent_basis.get('evidence')
    gate_status = str(payload.get('gate_status', '')).upper()

    violations = []
    if not llm_primary:
        violations.append('intent_basis.llm_as_primary != true')
    if not evidence:
        violations.append('intent_basis.evidence is empty')
    if gate_status != 'PASS':
        violations.append(f'gate_status != PASS (got {gate_status or "<empty>"})')

    if violations:
        print(FAIL_MSG)
        print("reason: 缺少满足硬门槛的程序化证据")
        for v in violations:
            print(f"- {v}")
        sys.exit(1)

    if wants_pass(payload):
        print("PASS: LLM intent-recognition foundation verified.")
    else:
        print("PASS: hard gate satisfied, but no explicit pass-report wording detected.")
    sys.exit(0)


if __name__ == '__main__':
    main()
