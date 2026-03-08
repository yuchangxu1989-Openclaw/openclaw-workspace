#!/usr/bin/env python3
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RUNNER = ROOT / 'scripts' / 'benchmark_runner.py'
CASE_FILE = ROOT / '08-capability-test-cases.json'
PASS_RUNTIME = ROOT / 'examples' / 'capability_runtime_pass.json'
FAIL_RUNTIME = ROOT / 'examples' / 'capability_runtime_fail_missing_outputs.json'
P2E_SMOKE_CASE = ROOT / 'examples' / 'benchmark_case_pass.json'
P2E_SMOKE_RUNTIME = ROOT / 'examples' / 'closed_book_pass.json'

RUNNER_TIMEOUT_SECONDS = 60


def load_cases():
    return json.loads(CASE_FILE.read_text(encoding='utf-8'))


def run_case(case_obj, runtime_path):
    with tempfile.TemporaryDirectory() as tmpdir:
        case_path = Path(tmpdir) / f"{case_obj['case_id']}.json"
        out_path = Path(tmpdir) / f"{case_obj['case_id']}.out.json"
        case_path.write_text(json.dumps(case_obj, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        try:
            proc = subprocess.run(
                [sys.executable, str(RUNNER), '--case', str(case_path), '--runtime', str(runtime_path), '--out', str(out_path)],
                capture_output=True,
                text=True,
                timeout=RUNNER_TIMEOUT_SECONDS,
            )
        except subprocess.TimeoutExpired as e:
            raise AssertionError(f"benchmark_runner timed out after {RUNNER_TIMEOUT_SECONDS}s for case {case_obj['case_id']}: {e}")
        payload = json.loads(out_path.read_text(encoding='utf-8'))
        return proc.returncode, payload


def run_smoke_with_script(script_rel_path: str, case_path: Path, runtime_path: Path):
    with tempfile.TemporaryDirectory() as tmpdir:
        out_path = Path(tmpdir) / 'smoke.out.json'
        env = os.environ.copy()
        env['OPENCLAW_WORKSPACE'] = str(ROOT.parent)
        cmd = [sys.executable, str(ROOT / script_rel_path)]
        if script_rel_path.endswith('benchmark_runner.py'):
            cmd += ['--case', str(case_path), '--runtime', str(runtime_path), '--out', str(out_path)]
        else:
            cmd += [str(runtime_path)]

        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=RUNNER_TIMEOUT_SECONDS,
            env=env,
        )

        if script_rel_path.endswith('benchmark_runner.py'):
            if not out_path.exists():
                raise AssertionError(
                    f"{script_rel_path} did not produce output file under OPENCLAW_WORKSPACE={env['OPENCLAW_WORKSPACE']}; "
                    f"rc={proc.returncode}; stderr={(proc.stderr or '').strip()}"
                )
            payload = json.loads(out_path.read_text(encoding='utf-8'))
        else:
            stdout = (proc.stdout or '').strip()
            if not stdout:
                raise AssertionError(
                    f"{script_rel_path} produced empty stdout under OPENCLAW_WORKSPACE={env['OPENCLAW_WORKSPACE']}; "
                    f"rc={proc.returncode}; stderr={(proc.stderr or '').strip()}"
                )
            payload = json.loads(stdout)
        return proc.returncode, payload


def assert_true(cond, msg):
    if not cond:
        raise AssertionError(msg)


def main():
    cases = {c['case_id']: c for c in load_cases()}

    rc, payload = run_case(cases['p2e-ext-001'], PASS_RUNTIME)
    assert_true(rc == 0, 'p2e-ext-001 should pass')
    assert_true(payload['verdict'] == 'SUCCESS', 'p2e-ext-001 verdict should be SUCCESS')
    cap_stage = next(s for s in payload['stage_results'] if s['gate_id'] == 'CAP-INTENT_EXPANSION')
    assert_true(cap_stage['verdict'] == 'PASS', 'intent expansion stage should pass')

    rc, payload = run_case(cases['p2e-ext-002'], PASS_RUNTIME)
    assert_true(rc == 0, 'p2e-ext-002 should pass')
    cap_stage = next(s for s in payload['stage_results'] if s['gate_id'] == 'CAP-EVENT_COMPLETION')
    assert_true(cap_stage['artifacts']['completed']['source_event'] == 'pull_request.merged', 'event completion should fill source_event')
    assert_true(cap_stage['artifacts']['completed']['repo'] == 'core/gateway', 'event completion should fill repo')

    rc, payload = run_case(cases['p2e-ext-003'], PASS_RUNTIME)
    assert_true(rc == 0, 'p2e-ext-003 should pass')
    cap_stage = next(s for s in payload['stage_results'] if s['gate_id'] == 'CAP-TASK_EXPANSION')
    assert_true(cap_stage['artifacts']['task_count'] >= 3, 'task expansion should produce at least 3 tasks')

    rc, payload = run_case(cases['p2e-ext-003'], FAIL_RUNTIME)
    assert_true(rc == 2, 'p2e-ext-003 with bad runtime should fail closed')
    assert_true(payload['verdict'] == 'FAIL', 'bad runtime verdict should be FAIL')
    cap_stage = next(s for s in payload['stage_results'] if s['gate_id'] == 'CAP-TASK_EXPANSION')
    assert_true(cap_stage['verdict'] == 'FAIL', 'task expansion stage should fail on insufficient outputs')

    rc, payload = run_case(cases['p2e-ext-004'], PASS_RUNTIME)
    assert_true(rc == 0, 'p2e-ext-004 should return success exit')
    assert_true(payload['verdict'] == 'SKIP', 'directive task expansion case should be SKIP')

    rc, payload = run_case(cases['p2e-ext-005'], PASS_RUNTIME)
    assert_true(rc == 0, 'p2e-ext-005 should pass')
    cap_stage = next(s for s in payload['stage_results'] if s['gate_id'] == 'CAP-INTENT_EXPANSION')
    assert_true(cap_stage['verdict'] == 'PASS', 'memory-loss intent expansion stage should pass')
    expansion_kinds = {item['kind'] for item in cap_stage['artifacts']['expansions']}
    assert_true('state_reconstruction' in expansion_kinds, 'memory-loss intent expansion should include state_reconstruction')
    assert_true('resume_action' in expansion_kinds, 'memory-loss intent expansion should include resume_action')

    rc, payload = run_case(cases['p2e-ext-006'], PASS_RUNTIME)
    assert_true(rc == 0, 'p2e-ext-006 should pass')
    cap_stage = next(s for s in payload['stage_results'] if s['gate_id'] == 'CAP-EVENT_COMPLETION')
    assert_true(cap_stage['verdict'] == 'PASS', 'memory-loss event completion stage should pass')
    completed = cap_stage['artifacts']['completed']
    assert_true(completed['source_event'] == 'pull_request.merged', 'memory-loss event completion should preserve a programmatic source_event')
    assert_true(completed['run_id'] == 'inc-4821', 'memory-loss event completion should recover run_id')

    rc, payload = run_case(cases['p2e-ext-006'], FAIL_RUNTIME)
    assert_true(rc == 2, 'p2e-ext-006 with bad runtime should fail closed')
    cap_stage = next(s for s in payload['stage_results'] if s['gate_id'] == 'CAP-EVENT_COMPLETION')
    assert_true(cap_stage['verdict'] == 'FAIL', 'memory-loss event completion should fail on missing recovered fields')

    rc, payload = run_case(cases['p2e-ext-007'], PASS_RUNTIME)
    assert_true(rc == 0, 'p2e-ext-007 should pass')
    cap_stage = next(s for s in payload['stage_results'] if s['gate_id'] == 'CAP-TASK_EXPANSION')
    assert_true(cap_stage['verdict'] == 'PASS', 'memory-loss task expansion stage should pass')
    task_kinds = {item['kind'] for item in cap_stage['artifacts']['tasks']}
    assert_true('state_rebuild' in task_kinds, 'memory-loss task expansion should include state_rebuild')
    assert_true('execution_resume' in task_kinds, 'memory-loss task expansion should include execution_resume')
    assert_true('verification' in task_kinds, 'memory-loss task expansion should include verification')

    rc, payload = run_case(cases['p2e-ext-007'], FAIL_RUNTIME)
    assert_true(rc == 2, 'p2e-ext-007 with bad runtime should fail closed')
    cap_stage = next(s for s in payload['stage_results'] if s['gate_id'] == 'CAP-TASK_EXPANSION')
    assert_true(cap_stage['verdict'] == 'FAIL', 'memory-loss task expansion should fail on insufficient recovery tasks')

    rc, payload = run_smoke_with_script('scripts/benchmark_runner.py', P2E_SMOKE_CASE, P2E_SMOKE_RUNTIME)
    assert_true(rc == 0, 'benchmark smoke should pass under workspace-scoped OPENCLAW_WORKSPACE')
    assert_true(payload['verdict'] == 'SUCCESS', 'benchmark smoke verdict should remain SUCCESS')

    rc, payload = run_smoke_with_script('scripts/closed_book_gate.py', P2E_SMOKE_CASE, P2E_SMOKE_RUNTIME)
    assert_true(rc == 0, 'closed_book_gate smoke should pass under workspace-scoped OPENCLAW_WORKSPACE')
    assert_true(payload['verdict'] == 'SUCCESS', 'closed_book_gate smoke verdict should remain SUCCESS')

    print('✅ capability regression suite passed')


if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        print(f'❌ capability regression suite failed: {e}', file=sys.stderr)
        sys.exit(1)
