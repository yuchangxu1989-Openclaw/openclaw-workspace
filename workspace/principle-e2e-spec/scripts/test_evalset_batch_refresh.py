#!/usr/bin/env python3
import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / 'skills' / 'aeo' / 'evalset_batch_refresh.py'
CASES_08 = ROOT / 'principle-e2e-spec' / '08-capability-test-cases.json'
CASES_10 = ROOT / 'principle-e2e-spec' / '10-pb010-hardened-cases.json'


def assert_true(cond, msg):
    if not cond:
        raise AssertionError(msg)


def main():
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        proc = subprocess.run(
            [
                sys.executable,
                str(SCRIPT),
                '--cases', str(CASES_08),
                '--cases', str(CASES_10),
                '--out-dir', str(tmp / 'generated'),
                '--report-dir', str(tmp / 'reports'),
            ],
            capture_output=True,
            text=True,
            timeout=60,
        )
        assert_true(proc.returncode == 0, f'refresh script should exit 0, got {proc.returncode}: {proc.stderr}')
        payload = json.loads(proc.stdout)
        report = json.loads((tmp / 'reports' / 'evalset-batch-refresh-report.json').read_text(encoding='utf-8'))
        ledger = json.loads((tmp / 'generated' / 'evalset-refresh-ledger.json').read_text(encoding='utf-8'))
        merged = json.loads((tmp / 'generated' / 'evalset-refresh-batch.json').read_text(encoding='utf-8'))

        assert_true(payload['total_unique_cases'] == 17, 'expected merged unique corpus size 17')
        assert_true(report['prepared_for_refresh_cases'] == 17, 'all merged cases should be prepared for refresh')
        assert_true(report['coverage']['capability_counts']['dispatch_verification'] == 3, 'dispatch verification cases should be counted')
        assert_true(report['coverage']['real_dialog_high_rigor_share'] > 0.5, 'real-dialog+high-rigor share should be material')
        assert_true(len(ledger['records']) == 17, 'ledger should have one prepared record per case')
        assert_true(len(merged) == 17, 'merged output should contain 17 cases')

    print('✅ evalset batch refresh regression passed')


if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        print(f'❌ evalset batch refresh regression failed: {e}', file=sys.stderr)
        sys.exit(1)
