#!/usr/bin/env python3
"""
gate_coverage_report.py — P2E Gate Coverage Scanner
Reads 05-test-cases.json and reports which Gate checks are covered, thin, or zero.

Usage:
    python3 principle-e2e-spec/scripts/gate_coverage_report.py [--cases PATH]

Output:
    Prints a coverage report to stdout + writes gate-coverage-report.md to output dir.
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CASES = ROOT / "05-test-cases.json"

# ── Gate registry (from 06-gate-criteria.yaml) ──────────────────────────────
HARD_GATES = {
    "HG-001": ("intent.type_classification",   "≥0.90", "HARD"),
    "HG-002": ("isc.draft_generation",          "=1.0",  "HARD"),
    "HG-003": ("dto.dag_validity",              "=1.0",  "HARD"),
    "HG-004": ("aeo.track_selection",           "=1.0",  "HARD"),
    "HG-005": ("test.functional_pass",          "=1.0",  "HARD"),
    "HG-006": ("test.boundary_safety",          "=1.0",  "HARD"),
    "HG-007": ("test.regression_clean",         "=1.0",  "HARD"),
    "HG-008": ("release.atomicity",             "=1.0",  "HARD"),
    "HG-009": ("release.version_tracked",       "=1.0",  "HARD"),
}
SOFT_GATES = {
    "SG-001": ("intent.multi_intent_coverage",  "≥0.80", "SOFT"),
    "SG-002": ("isc.confidence_calibration",    "≥0.85", "SOFT"),
    "SG-003": ("dto.fallback_exists",           "=1.0",  "SOFT"),
    "SG-004": ("aeo.coverage_completeness",     "≥0.90", "SOFT"),
    "SG-005": ("lep.exec_id_uniqueness",        "=1.0",  "SOFT"),
    "SG-006": ("lep.wal_completeness",          "=1.0",  "SOFT"),
    "SG-007": ("test.latency_p95",              "≤30s",  "SOFT"),
    "SG-008": ("release.notification_sent",     "=1.0",  "SOFT"),
}
ADVISORY_GATES = {
    "AG-001": ("cras.knowledge_ingestion",      "=1.0",  "ADVISORY"),
    "AG-002": ("cras.suggestion_relevance",     "≥0.70", "ADVISORY"),
    "AG-003": ("cras.historical_linking",       "≥0.60", "ADVISORY"),
    "AG-004": ("lep.dto_failure_linkage",       "≥0.85", "ADVISORY"),
    "AG-005": ("event.priority_ordering",       "=1.0",  "ADVISORY"),
}
SPECIAL_RULES = {
    "SR-001": ("silent_failure_detection",      "FORCE_FAIL", "SPECIAL"),
    "SR-002": ("security_risk_human_approval",  "FORCE_PARTIAL", "SPECIAL"),
    "SR-003": ("regression_break_zero_tolerance", "FORCE_FAIL", "SPECIAL"),
}

ALL_GATES = {**HARD_GATES, **SOFT_GATES, **ADVISORY_GATES, **SPECIAL_RULES}

# ── Tag/field → gate heuristic mapping ──────────────────────────────────────
TAG_TO_GATES = {
    # HG
    "monitoring":          ["HG-002"],
    "threshold":           ["HG-002"],
    "principle":           ["HG-001", "HG-002"],
    "verdict":             ["HG-001", "HG-002"],
    "constraint":          ["HG-001", "HG-002"],
    "goal":                ["HG-001", "HG-003"],
    "directive":           ["HG-001"],
    "skip":                ["HG-001"],
    "discrimination":      ["HG-001"],
    "decomposition":       ["HG-003"],
    "multi-intent":        ["SG-001"],
    "aeo":                 ["HG-004", "SG-004"],
    "track-selection":     ["HG-004"],
    "coverage-completeness": ["SG-004"],
    "ai-effect":           ["HG-004"],
    "regression":          ["HG-005", "HG-007"],
    "boundary":            ["HG-006"],
    "safety":              ["HG-006"],
    "atomic-release":      ["HG-008"],
    "version-tracking":    ["HG-009"],
    "rollback":            ["HG-009"],
    # SG
    "ambiguous":           ["SG-002"],
    "low-confidence":      ["SG-002"],
    "conflict-detection":  ["HG-007"],
    "lep":                 ["SG-005", "SG-006"],
    "resilience":          ["SG-005", "SG-006"],
    "retry":               ["SG-005", "SG-006"],
    "performance":         ["SG-007"],
    "latency":             ["SG-007"],
    "notification":        ["SG-008"],
    # AG
    "knowledge-codification": ["AG-001", "AG-002"],
    "cras":                ["AG-001", "AG-002", "AG-003"],
    "historical-linking":  ["AG-003"],
    "event":               ["AG-005"],
    "idempotency":         ["AG-005"],
    # SR
    "silent-failure":      ["SR-001"],
    "sr-001":              ["SR-001"],
    "human-approval":      ["SR-002"],
    "sr-002":              ["SR-002"],
    "security":            ["SR-002"],
    "multi-rule":          ["HG-008"],
}

# Additional field presence heuristics
FIELD_TO_GATES = {
    ("expected", "aeo"):         ["HG-004", "SG-004"],
    ("expected", "lep"):         ["SG-005", "SG-006"],
    ("expected", "cras"):        ["AG-001", "AG-002", "AG-003"],
    ("expected", "release"):     ["HG-008", "HG-009", "SG-008"],
    ("expected", "event"):       ["AG-005"],
    ("expected", "special_rule"): ["SR-001", "SR-002"],
    ("expected", "regression"):  ["HG-007"],
    ("expected", "test"):        ["HG-005", "HG-006"],
    ("expected", "pipeline_performance"): ["SG-007"],
}


def detect_gates(case: dict) -> set:
    covered = set()
    tags = set(case.get("tags", []))
    for tag in tags:
        for g in TAG_TO_GATES.get(tag, []):
            covered.add(g)
    exp = case.get("expected", {})
    for (field, sub), gates in FIELD_TO_GATES.items():
        if field == "expected" and sub in exp:
            for g in gates:
                covered.add(g)
    # Special: multi-intent detection
    if "intents" in exp:
        covered.add("SG-001")
    # ISC lineage
    if "isc_rule" in exp:
        covered.add("HG-002")
        isc = exp["isc_rule"]
        if isinstance(isc, dict):
            if "conflict_detected" in isc:
                covered.add("HG-007")
            if "requires_confirmation" in isc:
                covered.add("SG-002")
    # DTO
    if "dto_task" in exp:
        covered.add("HG-003")
        dto = exp["dto_task"]
        if isinstance(dto, dict) and dto.get("has_trigger"):
            covered.add("HG-003")
    return covered


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--cases", default=str(DEFAULT_CASES))
    parser.add_argument("--out", default=None)
    args = parser.parse_args()

    cases_path = Path(args.cases)
    if not cases_path.exists():
        print(f"ERROR: cases file not found: {cases_path}", file=sys.stderr)
        sys.exit(1)

    cases = json.loads(cases_path.read_text(encoding="utf-8"))

    # Build coverage map
    gate_coverage: dict[str, list[str]] = {gid: [] for gid in ALL_GATES}
    for case in cases:
        cid = case["case_id"]
        gates = detect_gates(case)
        for g in gates:
            if g in gate_coverage:
                gate_coverage[g].append(cid)

    # Classify
    zero = [g for g, cs in gate_coverage.items() if len(cs) == 0]
    thin = [g for g, cs in gate_coverage.items() if len(cs) == 1]
    adequate = [g for g, cs in gate_coverage.items() if len(cs) >= 2]

    total = len(ALL_GATES)
    zero_hard = [g for g in zero if g in HARD_GATES]
    zero_soft = [g for g in zero if g in SOFT_GATES]
    zero_sr   = [g for g in zero if g in SPECIAL_RULES]

    lines = []
    lines.append(f"# P2E Gate Coverage Report")
    lines.append(f"**Cases file**: {cases_path}")
    lines.append(f"**Total cases**: {len(cases)}")
    lines.append(f"**Total gates**: {total}")
    lines.append("")
    lines.append(f"| Status | Count | % |")
    lines.append(f"|--------|-------|---|")
    lines.append(f"| 🔴 Zero coverage | {len(zero)} | {100*len(zero)//total}% |")
    lines.append(f"| ⚠️  Thin (1 case) | {len(thin)} | {100*len(thin)//total}% |")
    lines.append(f"| ✅ Adequate (≥2)  | {len(adequate)} | {100*len(adequate)//total}% |")
    lines.append("")
    if zero_hard:
        lines.append(f"**🚨 HARD Gates with ZERO coverage ({len(zero_hard)})**: {', '.join(zero_hard)}")
    if zero_sr:
        lines.append(f"**⚡ Special Rules with ZERO coverage ({len(zero_sr)})**: {', '.join(zero_sr)}")
    lines.append("")
    lines.append("## Gate Detail Table")
    lines.append("")
    lines.append("| Gate ID | Type | Check | Covered By | Status |")
    lines.append("|---------|------|-------|-----------|--------|")

    for gid, (check, threshold, gtype) in sorted(ALL_GATES.items()):
        cids = gate_coverage.get(gid, [])
        count = len(cids)
        if count == 0:
            status = "🔴 ZERO"
        elif count == 1:
            status = "⚠️ THIN"
        else:
            status = "✅ OK"
        covered_str = ", ".join(cids) if cids else "—"
        lines.append(f"| {gid} | {gtype} | {check} ({threshold}) | {covered_str} | {status} |")

    report = "\n".join(lines)
    print(report)

    # Write output
    out_path = Path(args.out) if args.out else (ROOT / "scripts" / "gate-coverage-report.md")
    out_path.write_text(report, encoding="utf-8")
    print(f"\n✅ Report written to: {out_path}", file=sys.stderr)


if __name__ == "__main__":
    main()
