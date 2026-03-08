#!/usr/bin/env python3
import json
import sys
from pathlib import Path

FAIL_MSG = "FAIL-CLOSED: closed-book evaluation violated; hardcoded evalset or reference material access detected."

FORBIDDEN_KEYWORDS = [
    'memory/', 'memory\\', 'memory.md',
    'label', 'labels', 'annotation', 'annotations',
    'answer', 'answers', 'gold', 'golden', 'ground_truth',
    'reference', 'references', 'expected_output', 'expected_outputs',
    'benchmark_answers', 'eval_set'
]

PASS_WORDS = [
    'pass', 'passed', '通过', '可汇报通过', 'green', 'sign-off', 'signoff'
]


def load_payload(path: str):
    p = Path(path)
    if not p.exists():
        return None, f"input not found: {path}"
    try:
        return json.loads(p.read_text(encoding='utf-8')), None
    except Exception as e:
        return None, f"invalid json: {e}"


def as_list(value):
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def wants_pass(payload: dict) -> bool:
    text = json.dumps(payload, ensure_ascii=False).lower()
    return any(k in text for k in PASS_WORDS)


def contains_forbidden_reference(paths):
    hits = []
    for item in as_list(paths):
        s = str(item).lower()
        for key in FORBIDDEN_KEYWORDS:
            if key in s:
                hits.append(str(item))
                break
    return hits


def main():
    if len(sys.argv) != 2:
        print("usage: gate_closed_book_eval.py <evaluation.json>", file=sys.stderr)
        sys.exit(2)

    payload, err = load_payload(sys.argv[1])
    if err:
        print(f"{FAIL_MSG} ({err})")
        sys.exit(2)

    cbe = payload.get('closed_book_eval') or {}
    enabled = cbe.get('enabled') is True
    no_hardcoded = cbe.get('no_hardcoded_evalset') is True
    no_reference_reads = cbe.get('no_reference_reads') is True
    checked = as_list(cbe.get('forbidden_paths_checked'))
    evidence = as_list(cbe.get('evidence'))
    accessed = as_list(cbe.get('forbidden_paths_accessed'))
    gate_status = str(payload.get('gate_status', '')).upper()

    violations = []
    if not enabled:
        violations.append('closed_book_eval.enabled != true')
    if not no_hardcoded:
        violations.append('closed_book_eval.no_hardcoded_evalset != true')
    if not no_reference_reads:
        violations.append('closed_book_eval.no_reference_reads != true')
    if not checked:
        violations.append('closed_book_eval.forbidden_paths_checked is empty')
    if not evidence:
        violations.append('closed_book_eval.evidence is empty')
    if gate_status != 'PASS':
        violations.append(f'gate_status != PASS (got {gate_status or "<empty>"})')

    bad_checked = contains_forbidden_reference(checked)
    if bad_checked:
        violations.append('forbidden_paths_checked contains forbidden reference paths: ' + ', '.join(bad_checked))

    if accessed:
        violations.append('closed_book_eval.forbidden_paths_accessed is non-empty: ' + ', '.join(map(str, accessed)))

    if violations:
        print(FAIL_MSG)
        print('reason: 闭卷评测硬钢印未满足，默认失败并禁止汇报通过')
        for v in violations:
            print(f'- {v}')
        sys.exit(1)

    if wants_pass(payload):
        print('PASS: closed-book evaluation hard gate verified.')
    else:
        print('PASS: hard gate satisfied, but no explicit pass-report wording detected.')
    sys.exit(0)


if __name__ == '__main__':
    main()
