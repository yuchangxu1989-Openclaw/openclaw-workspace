#!/usr/bin/env python3
"""Batch refresh and coverage accounting for evaluation-set corpora.

Safe/offline workflow only:
- reads repo-local eval case JSON arrays
- optionally unions multiple corpora into one refreshed output
- emits explicit coverage accounting and refresh-ready seed contracts
- does not touch runtime config / openclaw.json
"""
import argparse
import json
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Tuple

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CASES = [
    ROOT / 'principle-e2e-spec' / '08-capability-test-cases.json',
    ROOT / 'principle-e2e-spec' / '10-pb010-hardened-cases.json',
]
DEFAULT_OUT_DIR = ROOT / 'skills' / 'aeo' / 'generated' / 'evalset-refresh'
DEFAULT_REPORT_DIR = ROOT / 'reports'

REAL_DIALOG_HINTS = [
    '线上', '真实', '会话', '对话', '值班', 'incident', 'oncall', 'dispatch', 'nightly',
    'regression', 'payment', 'gateway', 'alert', '告警', '派发', '根因', '回归', '工单'
]
HIGH_RIGOR_HINTS = [
    'regression_guard', 'P0', 'hardening', 'closed-loop', 'closed_loop', 'evidence',
    'rollback', 'coverage_score', 'success_rate', 'must_include', 'must_complete_fields',
    'required_dispatch_fields', 'blast_radius', 'severity'
]


def load_json(path: Path):
    return json.loads(path.read_text(encoding='utf-8'))


def text_blob(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, sort_keys=True).lower()


def classify_case(case: dict) -> dict:
    blob = text_blob(case)
    tags = [str(t).lower() for t in (case.get('tags') or [])]
    priority = str(case.get('priority') or '')
    real_dialog_hits = sorted({h for h in REAL_DIALOG_HINTS if h.lower() in blob})
    rigor_hits = sorted({h for h in HIGH_RIGOR_HINTS if h.lower() in blob})
    real_dialog = bool(real_dialog_hits)
    high_rigor = bool(rigor_hits) or case.get('regression_guard') is True or priority == 'P0'
    lane = []
    if real_dialog:
        lane.append('real-dialog')
    if high_rigor:
        lane.append('high-rigor')
    if not lane:
        lane.append('general')
    return {
        'case_id': case.get('case_id'),
        'capability': case.get('capability', 'unknown'),
        'priority': priority or 'unknown',
        'real_dialog': real_dialog,
        'high_rigor': high_rigor,
        'lane': '+'.join(lane),
        'real_dialog_hits': real_dialog_hits,
        'high_rigor_hits': rigor_hits,
    }


def dedupe_cases(cases: List[dict]) -> Tuple[List[dict], List[dict]]:
    seen = {}
    dupes = []
    for case in cases:
        cid = case.get('case_id')
        if not cid:
            dupes.append({'case_id': None, 'reason': 'missing_case_id'})
            continue
        if cid in seen:
            dupes.append({'case_id': cid, 'reason': 'duplicate_case_id'})
            continue
        seen[cid] = case
    return list(seen.values()), dupes


def build_refresh_seed(cases: List[dict], source_files: List[str]) -> dict:
    rows = []
    for case in cases:
        meta = classify_case(case)
        rows.append({
            'case_id': meta['case_id'],
            'refresh_status': 'prepared',
            'source_files': source_files,
            'capability': meta['capability'],
            'priority': meta['priority'],
            'refresh_lane': meta['lane'],
            'real_dialog': meta['real_dialog'],
            'high_rigor': meta['high_rigor'],
            'selection_reason': 'repo-local eval case included in refresh batch',
            'drop_reason': '',
        })
    return {
        'generated_at': datetime.now(timezone.utc).isoformat(),
        'mode': 'workspace-refresh-preparation',
        'records': rows,
    }


def summarize(cases: List[dict], source_files: List[str], duplicates: List[dict]) -> dict:
    capability_counts = Counter()
    priority_counts = Counter()
    lane_counts = Counter()
    flags = Counter()
    source_case_counts = {}
    by_case = []
    for source in source_files:
        try:
            source_case_counts[source] = len(load_json(Path(source)))
        except Exception:
            source_case_counts[source] = None
    for case in cases:
        meta = classify_case(case)
        capability_counts[meta['capability']] += 1
        priority_counts[meta['priority']] += 1
        lane_counts[meta['lane']] += 1
        if meta['real_dialog']:
            flags['real_dialog'] += 1
        if meta['high_rigor']:
            flags['high_rigor'] += 1
        if meta['real_dialog'] and meta['high_rigor']:
            flags['real_dialog_high_rigor'] += 1
        by_case.append(meta)
    total = len(cases)
    prepared = total
    return {
        'generated_at': datetime.now(timezone.utc).isoformat(),
        'source_files': source_files,
        'source_case_counts': source_case_counts,
        'total_unique_cases': total,
        'prepared_for_refresh_cases': prepared,
        'prepared_refresh_share': round((prepared / total), 4) if total else 0.0,
        'coverage': {
            'capability_counts': dict(capability_counts),
            'priority_counts': dict(priority_counts),
            'lane_counts': dict(lane_counts),
            'flag_counts': dict(flags),
            'real_dialog_share': round((flags['real_dialog'] / total), 4) if total else 0.0,
            'high_rigor_share': round((flags['high_rigor'] / total), 4) if total else 0.0,
            'real_dialog_high_rigor_share': round((flags['real_dialog_high_rigor'] / total), 4) if total else 0.0,
        },
        'duplicates_dropped': duplicates,
        'per_case': sorted(by_case, key=lambda x: (x['lane'], x['capability'], x['case_id'] or '')),
        'notes': [
            'This workflow is refresh-safe: it only prepares merged corpora, seed ledgers, and coverage reports.',
            'real-dialog/high-rigor is inferred from repo-local case content and tags; no external transcripts are ingested here.',
            'prepared_for_refresh_cases means included in the refresh batch artifact, not re-labeled by an external source-of-truth pipeline.',
        ],
    }


def write_md(report: dict, out: Path):
    cov = report['coverage']
    lines = [
        '# Evalset batch refresh coverage report',
        '',
        f"- generated_at: `{report['generated_at']}`",
        f"- source_files: `{', '.join(report['source_files'])}`",
        f"- total_unique_cases: `{report['total_unique_cases']}`",
        f"- prepared_for_refresh_cases: `{report['prepared_for_refresh_cases']}` ({cov and report['prepared_refresh_share']:.0%})",
        '',
        '## Coverage shares',
        f"- real_dialog_share: `{cov['real_dialog_share']:.0%}`",
        f"- high_rigor_share: `{cov['high_rigor_share']:.0%}`",
        f"- real_dialog_high_rigor_share: `{cov['real_dialog_high_rigor_share']:.0%}`",
        '',
        '## Capability counts',
    ]
    for k, v in sorted(cov['capability_counts'].items()):
        lines.append(f'- {k}: {v}')
    lines += ['', '## Lane counts']
    for k, v in sorted(cov['lane_counts'].items()):
        lines.append(f'- {k}: {v}')
    lines += ['', '## Priority counts']
    for k, v in sorted(cov['priority_counts'].items()):
        lines.append(f'- {k}: {v}')
    lines += ['', '## Duplicate drops']
    if not report['duplicates_dropped']:
        lines.append('- none')
    else:
        for item in report['duplicates_dropped']:
            lines.append(f"- {item['case_id']}: {item['reason']}")
    lines += ['', '## Per-case refresh lanes']
    for item in report['per_case']:
        lines.append(
            f"- `{item['case_id']}` cap=`{item['capability']}` lane=`{item['lane']}` real_dialog={str(item['real_dialog']).lower()} high_rigor={str(item['high_rigor']).lower()}"
        )
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text('\n'.join(lines) + '\n', encoding='utf-8')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--cases', action='append', default=[], help='Repeatable path to a JSON list of cases')
    parser.add_argument('--out-dir', default=str(DEFAULT_OUT_DIR))
    parser.add_argument('--report-dir', default=str(DEFAULT_REPORT_DIR))
    args = parser.parse_args()

    case_paths = [Path(p) for p in (args.cases or [])] or DEFAULT_CASES
    all_cases = []
    for path in case_paths:
        payload = load_json(path)
        if not isinstance(payload, list):
            raise SystemExit(f'{path} must contain a JSON list')
        all_cases.extend([x for x in payload if isinstance(x, dict)])

    merged_cases, duplicates = dedupe_cases(all_cases)
    source_files = [str(p) for p in case_paths]
    out_dir = Path(args.out_dir)
    report_dir = Path(args.report_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    report_dir.mkdir(parents=True, exist_ok=True)

    merged_path = out_dir / 'evalset-refresh-batch.json'
    ledger_path = out_dir / 'evalset-refresh-ledger.json'
    report_json = report_dir / 'evalset-batch-refresh-report.json'
    report_md = report_dir / 'evalset-batch-refresh-report.md'

    report = summarize(merged_cases, source_files, duplicates)
    ledger = build_refresh_seed(merged_cases, source_files)

    merged_path.write_text(json.dumps(merged_cases, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    ledger_path.write_text(json.dumps(ledger, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    report_json.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    write_md(report, report_md)

    print(json.dumps({
        'ok': True,
        'merged_path': str(merged_path),
        'ledger_path': str(ledger_path),
        'report_json': str(report_json),
        'report_md': str(report_md),
        'total_unique_cases': report['total_unique_cases'],
        'prepared_for_refresh_cases': report['prepared_for_refresh_cases'],
        'real_dialog_share': report['coverage']['real_dialog_share'],
        'high_rigor_share': report['coverage']['high_rigor_share'],
        'real_dialog_high_rigor_share': report['coverage']['real_dialog_high_rigor_share'],
    }, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
