#!/usr/bin/env python3
import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
RUNNER = ROOT / 'principle_to_enforcement_runner.py'
TESTS_DIR = ROOT / 'tests'


class TestFailure(Exception):
    pass


def run_case(name: str):
    input_path = TESTS_DIR / f'{name}.json'
    with tempfile.TemporaryDirectory() as tmpdir:
        json_out = Path(tmpdir) / f'{name}.result.json'
        md_out = Path(tmpdir) / f'{name}.report.md'
        proc = subprocess.run(
            [sys.executable, str(RUNNER), str(input_path), '--json-out', str(json_out), '--md-out', str(md_out)],
            capture_output=True,
            text=True,
            timeout=30,
        )
        payload = json.loads(json_out.read_text(encoding='utf-8')) if json_out.exists() else None
        report = md_out.read_text(encoding='utf-8') if md_out.exists() else ''
        return proc.returncode, payload, report, proc.stdout, proc.stderr


def assert_true(cond, msg):
    if not cond:
        raise TestFailure(msg)


def test_pass_case():
    rc, payload, report, _stdout, _stderr = run_case('pass_case')
    assert_true(rc == 0, 'pass_case should exit 0')
    assert_true(payload['final_status'] == 'PASS', 'pass_case final_status should be PASS')
    assert_true(payload['release_decision'] == 'ALLOW', 'pass_case release_decision should be ALLOW')
    assert_true(payload['failure_text'] is None, 'pass_case failure_text should be None')
    assert_true('Release Decision: **ALLOW**' in report, 'pass_case markdown should show ALLOW')


def test_fail_case():
    rc, payload, report, _stdout, _stderr = run_case('fail_case')
    assert_true(rc != 0, 'fail_case should be non-zero')
    assert_true(payload['final_status'] == 'FAIL', 'fail_case final_status should be FAIL')
    assert_true(payload['release_decision'] == 'BLOCK', 'fail_case release_decision should be BLOCK')
    assert_true(payload['failure_text'] is not None, 'fail_case should include failure_text')
    assert_true('Failure:' in report, 'fail_case markdown should show failure')


def test_false_positive_blocked():
    rc, payload, report, _stdout, _stderr = run_case('false_positive_case')
    assert_true(rc != 0, 'false_positive_case should be blocked')
    assert_true(payload['recognized_intent']['label'] == 'unknown', 'false_positive should stay unknown')
    assert_true(payload['final_status'] == 'FAIL', 'false_positive final_status should be FAIL')
    assert_true(payload['release_decision'] == 'BLOCK', 'false_positive release_decision should be BLOCK')
    assert_true('Final Status: **FAIL**' in report, 'false_positive markdown should show FAIL')


def test_mismatch_case_release_ready_but_blocked():
    rc, payload, report, _stdout, _stderr = run_case('mismatch_case')
    assert_true(rc != 0, 'mismatch_case should be blocked')
    assert_true(payload['recognized_intent']['label'] == 'principle_to_enforcement_e2e', 'mismatch intent should still be recognized')
    assert_true(payload['final_status'] == 'FAIL', 'mismatch final_status should be FAIL')
    assert_true(payload['release_decision'] == 'BLOCK', 'mismatch release_decision should be BLOCK')
    release_step = next(s for s in payload['autonomy_chain'] if s['step'] == 'release')
    gate_step = next(s for s in payload['autonomy_chain'] if s['step'] == 'gate')
    assert_true(release_step['status'] == 'READY', 'mismatch release step stays READY in raw chain')
    assert_true(gate_step['present'] is False, 'mismatch gate step should be missing')
    assert_true('Release Decision: **BLOCK**' in report, 'mismatch markdown should show BLOCK decision')


TESTS = [
    ('pass_case', test_pass_case),
    ('fail_case', test_fail_case),
    ('false_positive_blocked', test_false_positive_blocked),
    ('mismatch_case_release_ready_but_blocked', test_mismatch_case_release_ready_but_blocked),
]


def main():
    passed = 0
    failed = 0
    errors = []
    print('🔧 sandbox principle-to-enforcement regression')
    print('=' * 52)
    for name, fn in TESTS:
        try:
            fn()
            passed += 1
            print(f'  ✅ {name}')
        except Exception as e:
            failed += 1
            errors.append(f'{name}: {e}')
            print(f'  ❌ {name}: {e}')
    print('=' * 52)
    print(f'Total: {passed + failed}  |  ✅ Passed: {passed}  |  ❌ Failed: {failed}')
    if errors:
        print('\nFailures:')
        for err in errors:
            print(f'  • {err}')
        return 1
    print('\n✅ sandbox principle-to-enforcement regression: ALL CHECKS PASSED')
    return 0


if __name__ == '__main__':
    sys.exit(main())
