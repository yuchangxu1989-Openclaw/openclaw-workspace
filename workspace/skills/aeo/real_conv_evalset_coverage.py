#!/usr/bin/env python3
import argparse
import json
import os
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CASES = ROOT / 'principle-e2e-spec' / '08-capability-test-cases.json'
DEFAULT_REPORT_DIR = ROOT / 'reports'
DEFAULT_REPORT_JSON = DEFAULT_REPORT_DIR / 'real-conv-evalset-coverage-report.json'
DEFAULT_REPORT_MD = DEFAULT_REPORT_DIR / 'real-conv-evalset-coverage-report.md'
DEFAULT_SEED_OUT = ROOT / 'skills' / 'aeo' / 'generated' / 'real-conv-last24h-eval-seed.json'
DEFAULT_LEDGER_KPI = ROOT / 'skills' / 'aeo' / 'generated' / 'last24h-kpi.json'

TEXT_HINTS = {
    'last24h': ['last24h', 'last-24', '24h', '24 h', 'recent', 'recently', 'last day', '近24', '最近'],
    'conversation': ['conversation', 'conversations', 'chat', 'session', 'messages', 'dialog', '对话', '会话'],
    'real': ['real', 'production', 'live', 'actual', '真实', '线上'],
    'coverage': ['coverage', 'covered', '覆盖'],
    'sediment': ['sediment', 'sedimentation', 'memory', 'recover', 'handoff', '沉淀', '记忆'],
    'evaluation': ['eval', 'evaluation', 'benchmark', 'case', 'dataset', '评测'],
}


def load_json(path: Path):
    return json.loads(path.read_text(encoding='utf-8'))


def lower_dump(obj) -> str:
    return json.dumps(obj, ensure_ascii=False).lower()


def score_case(case_obj: dict):
    text = lower_dump(case_obj)
    hits = {k: [h for h in hints if h.lower() in text] for k, hints in TEXT_HINTS.items()}
    hit_counts = {k: len(v) for k, v in hits.items() if v}
    score = sum(hit_counts.values())
    tags = case_obj.get('tags') or []
    capability = case_obj.get('capability')
    if any('memory' in str(t).lower() or 'handoff' in str(t).lower() for t in tags):
        score += 2
    if capability in ('intent_expansion', 'event_completion', 'task_expansion'):
        score += 1
    return score, hits


def classify_coverage(score: int) -> str:
    if score >= 7:
        return 'strong'
    if score >= 4:
        return 'partial'
    return 'weak'


def _load_ledger_kpi():
    """Try to load the last-24h ledger KPI if the ledger has been populated."""
    if DEFAULT_LEDGER_KPI.exists():
        try:
            return json.loads(DEFAULT_LEDGER_KPI.read_text(encoding='utf-8'))
        except Exception:
            pass
    return None


def _build_assessment(strong, report_json, report_md, seed_out):
    """Build assessment dict, incorporating ledger KPIs when available."""
    ledger_kpi = _load_ledger_kpi()

    if ledger_kpi and ledger_kpi.get('candidate_count', 0) > 0:
        has_selected = ledger_kpi.get('selected_count', 0) > 0
        has_freshness = bool(ledger_kpi.get('freshest_conversation_at'))
        confidence = 'high' if (has_selected and has_freshness and len(strong) >= 3) else 'medium'
        gaps = []
        if not has_selected:
            gaps.append('Ledger exists but no conversations were selected for evaluation.')
        if not has_freshness:
            gaps.append('Ledger exists but freshest_conversation_at is empty.')
        summary = (
            f"Ledger active: {ledger_kpi['candidate_count']} candidates, "
            f"{ledger_kpi.get('selected_count', 0)} selected, "
            f"{ledger_kpi.get('dropped_count', 0)} dropped. "
            f"Freshest: {ledger_kpi.get('freshest_conversation_at', 'N/A')}. "
            f"Confidence: {confidence}."
        )
        return {
            'last24h_real_conversation_sedimentation_confidence': confidence,
            'summary': summary,
            'gaps': gaps or ['All identified gaps are now addressed by the ledger.'],
            'ledger_kpi': ledger_kpi,
            'safe_fix': {
                'type': 'observability-active',
                'artifacts': [str(report_json), str(report_md), str(seed_out), str(DEFAULT_LEDGER_KPI)],
                'description': 'Ledger is active and emitting KPIs. Wire production conversation sources into skills/aeo/last24h_ledger.py ingest for continuous coverage.'
            }
        }

    # Fallback: no ledger yet
    return {
        'last24h_real_conversation_sedimentation_confidence': (
            'low' if len(strong) == 0 else 'medium' if len(strong) < 3 else 'medium'
        ),
        'summary': (
            'Current eval cases contain indirect recovery/memory-loss coverage, but there is no repository-local evidence of a real-conversation last-24h ingestion generator or source ledger. Therefore true last-24h real-conversation sedimentation cannot be verified from current code/artifacts.'
        ),
        'gaps': [
            'No repo-local generator found that ingests last-24h real conversations into eval cases.',
            'No ledger/report found that maps candidate conversations -> selected eval cases -> dropped reasons.',
            'No freshness watermark or 24h coverage KPI is emitted by the current benchmark assets.',
        ],
        'safe_fix': {
            'type': 'observability-first',
            'artifacts': [str(report_json), str(report_md), str(seed_out)],
            'description': 'Generate a coverage report plus a seed contract file so an external/source-of-truth pipeline can write last-24h conversation candidates without changing runtime config.'
        }
    }


def compute_report(cases: list):
    per_case = []
    capability_counter = Counter()
    coverage_counter = Counter()
    for case in cases:
        if not isinstance(case, dict):
            continue
        score, hits = score_case(case)
        coverage = classify_coverage(score)
        capability = case.get('capability', 'unknown')
        capability_counter[capability] += 1
        coverage_counter[coverage] += 1
        per_case.append({
            'case_id': case.get('case_id'),
            'title': case.get('title') or case.get('name') or '',
            'capability': capability,
            'tags': case.get('tags') or [],
            'coverage': coverage,
            'score': score,
            'matched_hints': {k: v for k, v in hits.items() if v},
        })
    ranked = sorted(per_case, key=lambda x: (-x['score'], x['case_id'] or ''))
    strong = [x for x in ranked if x['coverage'] == 'strong']
    partial = [x for x in ranked if x['coverage'] == 'partial']
    weak = [x for x in ranked if x['coverage'] == 'weak']
    return {
        'generated_at': datetime.now(timezone.utc).isoformat(),
        'source_cases_file': str(DEFAULT_CASES),
        'total_cases': len(per_case),
        'coverage_counts': dict(coverage_counter),
        'capability_counts': dict(capability_counter),
        'strong_case_ids': [x['case_id'] for x in strong],
        'partial_case_ids': [x['case_id'] for x in partial],
        'weak_case_ids': [x['case_id'] for x in weak],
        'top_ranked_cases': ranked[:10],
        'all_cases': ranked,
        'assessment': _build_assessment(strong, DEFAULT_REPORT_JSON, DEFAULT_REPORT_MD, DEFAULT_SEED_OUT)
    }


def write_md(report: dict, out: Path):
    lines = []
    lines.append('# Real-conv evalset last-24h coverage report')
    lines.append('')
    lines.append(f"- generated_at: `{report['generated_at']}`")
    lines.append(f"- source_cases_file: `{report['source_cases_file']}`")
    lines.append(f"- total_cases: `{report['total_cases']}`")
    lines.append(f"- confidence: **{report['assessment']['last24h_real_conversation_sedimentation_confidence']}**")
    lines.append('')
    lines.append('## Verdict')
    lines.append(report['assessment']['summary'])
    lines.append('')
    lines.append('## Coverage counts')
    for k, v in report['coverage_counts'].items():
        lines.append(f'- {k}: {v}')
    lines.append('')
    lines.append('## Strong/partial matches')
    for section in ('strong_case_ids', 'partial_case_ids', 'weak_case_ids'):
        lines.append(f'### {section}')
        ids = report.get(section) or []
        if not ids:
            lines.append('- none')
        else:
            for cid in ids:
                lines.append(f'- {cid}')
        lines.append('')
    lines.append('## Top ranked cases')
    for item in report['top_ranked_cases']:
        lines.append(f"- `{item['case_id']}` [{item['coverage']}] cap=`{item['capability']}` score={item['score']} hints={','.join(item['matched_hints'].keys())}")
    lines.append('')
    lines.append('## Gaps')
    for gap in report['assessment']['gaps']:
        lines.append(f'- {gap}')
    lines.append('')
    lines.append('## Safe actionable fix')
    fix = report['assessment']['safe_fix']
    lines.append(f"- type: `{fix['type']}`")
    lines.append(f"- description: {fix['description']}")
    for artifact in fix['artifacts']:
        lines.append(f'- artifact: `{artifact}`')
    lines.append('')

    # Ledger KPI section (if wired)
    ledger_kpi = report.get('assessment', {}).get('ledger_kpi')
    if ledger_kpi:
        lines.append('## Ledger KPIs (from last24h-ledger)')
        lines.append('')
        lines.append(f"| Metric | Value |")
        lines.append(f"|--------|-------|")
        lines.append(f"| candidate_count | {ledger_kpi.get('candidate_count', 0)} |")
        lines.append(f"| selected_count | {ledger_kpi.get('selected_count', 0)} |")
        lines.append(f"| dropped_count | {ledger_kpi.get('dropped_count', 0)} |")
        lines.append(f"| freshest_conversation_at | `{ledger_kpi.get('freshest_conversation_at', '')}` |")
        lines.append('')
        mappings = ledger_kpi.get('conversation_eval_mappings', {})
        if mappings:
            lines.append('### Conversation → Eval Case Mappings')
            lines.append('')
            for cid, eids in sorted(mappings.items()):
                lines.append(f"- `{cid}` → {', '.join(f'`{e}`' for e in eids)}")
            lines.append('')
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text('\n'.join(lines) + '\n', encoding='utf-8')


def build_seed_contract(report: dict, out: Path):
    now = datetime.now(timezone.utc)
    contract = {
        'generated_at': now.isoformat(),
        'window': {
            'lookback_hours': 24,
            'start_at': (now - timedelta(hours=24)).isoformat(),
            'end_at': now.isoformat(),
        },
        'purpose': 'Seed contract for external or future real-conversation ingestion into evalset coverage accounting.',
        'input_contract': {
            'records': [
                {
                    'conversation_id': 'string',
                    'source': 'session|message|export|plugin',
                    'started_at': 'ISO-8601',
                    'ended_at': 'ISO-8601',
                    'message_count': 0,
                    'language': 'optional',
                    'user_problem_summary': 'string',
                    'observed_failure_modes': ['memory_loss', 'handoff_gap'],
                    'selected_for_eval': False,
                    'selection_reason': 'string',
                    'drop_reason': 'string'
                }
            ]
        },
        'expected_outputs': {
            'coverage_kpis': ['candidate_count', 'selected_count', 'dropped_count', 'freshest_conversation_at'],
            'mapping': 'conversation_id -> eval_case_id[]',
        },
        'current_repo_assessment': report['assessment'],
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(contract, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--cases', default=str(DEFAULT_CASES))
    parser.add_argument('--report-json', default=str(DEFAULT_REPORT_JSON))
    parser.add_argument('--report-md', default=str(DEFAULT_REPORT_MD))
    parser.add_argument('--seed-out', default=str(DEFAULT_SEED_OUT))
    args = parser.parse_args()

    cases = load_json(Path(args.cases))
    if not isinstance(cases, list):
        raise SystemExit('cases file must be a JSON list')
    report = compute_report(cases)
    report_json = Path(args.report_json)
    report_json.parent.mkdir(parents=True, exist_ok=True)
    report_json.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    write_md(report, Path(args.report_md))
    build_seed_contract(report, Path(args.seed_out))
    print(json.dumps({
        'ok': True,
        'report_json': str(report_json),
        'report_md': str(args.report_md),
        'seed_out': str(args.seed_out),
        'strong_cases': len(report['strong_case_ids']),
        'partial_cases': len(report['partial_case_ids']),
        'weak_cases': len(report['weak_case_ids']),
        'confidence': report['assessment']['last24h_real_conversation_sedimentation_confidence'],
    }, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
