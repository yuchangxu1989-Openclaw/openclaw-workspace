#!/usr/bin/env python3
"""Tests for the last-24h real-conversation evaluation ledger.

Covers:
  - Ingest + dedup
  - Selection / drop marking
  - Auto-match against eval cases
  - KPI computation
  - Ledger persistence (save/load roundtrip)
  - Validation (pass + fail scenarios)
  - Hash tamper detection
  - CLI ingest end-to-end
"""

import json
import os
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Allow import from parent
sys.path.insert(0, str(Path(__file__).resolve().parent))

from last24h_ledger import (
    ConversationMapping,
    Ledger,
    LedgerEntry,
    LedgerKPI,
    generate_md_report,
    LEDGER_SCHEMA_VERSION,
)

PASSED = 0
FAILED = 0
ROOT = Path(__file__).resolve().parents[2]
EVAL_CASES_PATH = ROOT / "principle-e2e-spec" / "08-capability-test-cases.json"


def assert_eq(label, actual, expected):
    global PASSED, FAILED
    if actual == expected:
        PASSED += 1
    else:
        FAILED += 1
        print(f"  FAIL: {label}: expected {expected!r}, got {actual!r}")


def assert_true(label, value):
    global PASSED, FAILED
    if value:
        PASSED += 1
    else:
        FAILED += 1
        print(f"  FAIL: {label}: expected truthy, got {value!r}")


def assert_false(label, value):
    global PASSED, FAILED
    if not value:
        PASSED += 1
    else:
        FAILED += 1
        print(f"  FAIL: {label}: expected falsy, got {value!r}")


def assert_in(label, needle, haystack):
    global PASSED, FAILED
    if needle in haystack:
        PASSED += 1
    else:
        FAILED += 1
        print(f"  FAIL: {label}: {needle!r} not found in {haystack!r}")


def assert_ge(label, actual, threshold):
    global PASSED, FAILED
    if actual >= threshold:
        PASSED += 1
    else:
        FAILED += 1
        print(f"  FAIL: {label}: {actual} < {threshold}")


# ── Test fixtures ───────────────────────────────────────────────────────────

def make_candidate(cid: str, failure_modes=None, summary="", source="session",
                   msg_count=5, lang="zh"):
    now = datetime.now(timezone.utc)
    return {
        "conversation_id": cid,
        "source": source,
        "started_at": (now - timedelta(hours=2)).isoformat(),
        "ended_at": (now - timedelta(minutes=30)).isoformat(),
        "message_count": msg_count,
        "language": lang,
        "user_problem_summary": summary,
        "observed_failure_modes": failure_modes or [],
    }


SAMPLE_CANDIDATES = [
    make_candidate("conv-001", ["memory_loss"], "agent forgot context after handoff"),
    make_candidate("conv-002", ["handoff_gap"], "task not picked up after session restart"),
    make_candidate("conv-003", [], "simple weather query"),
    make_candidate("conv-004", ["memory_loss", "intent_drift"], "记忆丢失导致意图扩充失败"),
    make_candidate("conv-005", [], "code generation request with no issues"),
]


# ── Tests ───────────────────────────────────────────────────────────────────

def test_ingest_basic():
    print("test_ingest_basic")
    ledger = Ledger()
    now = datetime.now(timezone.utc)
    ledger.window_start = (now - timedelta(hours=24)).isoformat()
    ledger.window_end = now.isoformat()
    ledger.created_at = now.isoformat()

    for c in SAMPLE_CANDIDATES:
        ledger.ingest_candidate(c)

    assert_eq("entry count", len(ledger.entries), 5)
    assert_eq("first entry id", ledger.entries[0].conversation_id, "conv-001")
    assert_true("hash non-empty", bool(ledger.entries[0].entry_hash))
    assert_true("ingested_at non-empty", bool(ledger.entries[0].ingested_at))


def test_ingest_dedup():
    print("test_ingest_dedup")
    ledger = Ledger()
    now = datetime.now(timezone.utc)
    ledger.window_start = (now - timedelta(hours=24)).isoformat()
    ledger.window_end = now.isoformat()

    ledger.ingest_candidate(make_candidate("conv-dup"))
    ledger.ingest_candidate(make_candidate("conv-dup"))  # same id
    # Dedup is handled at CLI level; at module level both are added
    assert_eq("raw entries (no cli dedup)", len(ledger.entries), 2)


def test_selection_and_drop():
    print("test_selection_and_drop")
    ledger = Ledger()
    for c in SAMPLE_CANDIDATES[:3]:
        ledger.ingest_candidate(c)

    ledger.mark_selected("conv-001", "memory loss matches p2e-ext-005", ["p2e-ext-005", "p2e-ext-006"])
    ledger.mark_dropped("conv-003", "no failure modes, simple query")

    e1 = ledger.entries[0]
    assert_true("conv-001 selected", e1.selected_for_eval)
    assert_eq("conv-001 mapping count", len(e1.eval_mappings), 2)
    assert_eq("conv-001 mapping[0]", e1.eval_mappings[0].eval_case_id, "p2e-ext-005")

    e3 = ledger.entries[2]
    assert_false("conv-003 not selected", e3.selected_for_eval)
    assert_eq("conv-003 drop reason", e3.drop_reason, "no failure modes, simple query")


def test_kpi_computation():
    print("test_kpi_computation")
    ledger = Ledger()
    now = datetime.now(timezone.utc)
    ledger.window_start = (now - timedelta(hours=24)).isoformat()
    ledger.window_end = now.isoformat()

    for c in SAMPLE_CANDIDATES:
        ledger.ingest_candidate(c)

    ledger.mark_selected("conv-001", "test", ["p2e-ext-005"])
    ledger.mark_selected("conv-004", "test", ["p2e-ext-005", "p2e-ext-007"])
    ledger.mark_dropped("conv-003", "no failure modes")
    ledger.mark_dropped("conv-005", "no failure modes")

    kpi = ledger.compute_kpi()
    assert_eq("candidate_count", kpi.candidate_count, 5)
    assert_eq("selected_count", kpi.selected_count, 2)
    assert_eq("dropped_count", kpi.dropped_count, 2)
    assert_in("dropped_reason key", "no failure modes", kpi.dropped_reasons)
    assert_eq("dropped_reason count", kpi.dropped_reasons["no failure modes"], 2)
    assert_true("freshest_conversation_at", bool(kpi.freshest_conversation_at))
    assert_in("mapping conv-001", "conv-001", kpi.conversation_eval_mappings)
    assert_in("mapping conv-004", "conv-004", kpi.conversation_eval_mappings)
    assert_eq("schema_version", kpi.schema_version, LEDGER_SCHEMA_VERSION)


def test_save_load_roundtrip():
    print("test_save_load_roundtrip")
    ledger = Ledger()
    now = datetime.now(timezone.utc)
    ledger.window_start = (now - timedelta(hours=24)).isoformat()
    ledger.window_end = now.isoformat()
    ledger.created_at = now.isoformat()

    for c in SAMPLE_CANDIDATES[:3]:
        ledger.ingest_candidate(c)
    ledger.mark_selected("conv-001", "test", ["p2e-ext-005"])
    ledger.mark_dropped("conv-003", "irrelevant")

    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as f:
        tmp = Path(f.name)
    try:
        ledger.save(tmp)
        loaded = Ledger.load(tmp)
        assert_eq("loaded entry count", len(loaded.entries), 3)
        assert_eq("loaded window_start", loaded.window_start, ledger.window_start)
        assert_true("loaded entry 0 selected", loaded.entries[0].selected_for_eval)
        assert_eq("loaded entry 0 mapping", loaded.entries[0].eval_mappings[0].eval_case_id, "p2e-ext-005")
        assert_eq("loaded entry 2 drop", loaded.entries[2].drop_reason, "irrelevant")
        # Hash roundtrip
        assert_eq("hash preserved", loaded.entries[0].entry_hash, ledger.entries[0].entry_hash)
    finally:
        tmp.unlink(missing_ok=True)


def test_validate_pass():
    print("test_validate_pass")
    ledger = Ledger()
    now = datetime.now(timezone.utc)
    ledger.window_start = (now - timedelta(hours=24)).isoformat()
    ledger.window_end = now.isoformat()
    for c in SAMPLE_CANDIDATES[:2]:
        ledger.ingest_candidate(c)
    ledger.mark_selected("conv-001", "test", ["p2e-ext-005"])
    ledger.mark_dropped("conv-002", "not relevant")

    issues = ledger.validate()
    assert_eq("no issues", issues, [])


def test_validate_fail_duplicate():
    print("test_validate_fail_duplicate")
    ledger = Ledger()
    now = datetime.now(timezone.utc)
    ledger.window_start = (now - timedelta(hours=24)).isoformat()
    ledger.window_end = now.isoformat()
    ledger.ingest_candidate(make_candidate("conv-dup"))
    ledger.ingest_candidate(make_candidate("conv-dup"))

    issues = ledger.validate()
    assert_ge("has duplicate issue", len(issues), 1)
    assert_true("mentions duplicate", any("duplicate" in i for i in issues))


def test_validate_fail_both_selected_and_dropped():
    print("test_validate_fail_both_selected_and_dropped")
    ledger = Ledger()
    now = datetime.now(timezone.utc)
    ledger.window_start = (now - timedelta(hours=24)).isoformat()
    ledger.window_end = now.isoformat()
    ledger.ingest_candidate(make_candidate("conv-bad"))
    # Force invalid state
    ledger.entries[0].selected_for_eval = True
    ledger.entries[0].drop_reason = "should not have both"
    ledger.entries[0].eval_mappings = [ConversationMapping(eval_case_id="x", match_reason="y")]

    issues = ledger.validate()
    assert_ge("has issue", len(issues), 1)
    assert_true("mentions both", any("both" in i.lower() for i in issues))


def test_validate_fail_empty_window():
    print("test_validate_fail_empty_window")
    ledger = Ledger()
    # No window set
    issues = ledger.validate()
    assert_ge("has window issue", len(issues), 1)


def test_hash_tamper_detection():
    print("test_hash_tamper_detection")
    ledger = Ledger()
    now = datetime.now(timezone.utc)
    ledger.window_start = (now - timedelta(hours=24)).isoformat()
    ledger.window_end = now.isoformat()
    ledger.ingest_candidate(make_candidate("conv-tamper", summary="original"))
    original_hash = ledger.entries[0].entry_hash

    # Tamper with the summary (but not the hash)
    ledger.entries[0].user_problem_summary = "tampered!"
    issues = ledger.validate()
    assert_ge("detects tamper", len(issues), 1)
    assert_true("mentions hash", any("hash" in i.lower() for i in issues))


def test_auto_match():
    print("test_auto_match")
    if not EVAL_CASES_PATH.exists():
        print("  SKIP: eval cases file not found")
        return

    eval_cases = json.loads(EVAL_CASES_PATH.read_text(encoding="utf-8"))
    ledger = Ledger()
    now = datetime.now(timezone.utc)
    ledger.window_start = (now - timedelta(hours=24)).isoformat()
    ledger.window_end = now.isoformat()

    # This candidate should match memory-loss cases
    ledger.ingest_candidate(make_candidate(
        "conv-mem-loss",
        failure_modes=["memory_loss", "handoff_gap"],
        summary="记忆丢失后agent无法恢复上下文",
    ))
    # This candidate should NOT match
    ledger.ingest_candidate(make_candidate(
        "conv-no-match",
        failure_modes=[],
        summary="weather query",
    ))

    ledger.auto_match(eval_cases)

    mem_entry = ledger.entries[0]
    assert_true("memory conv selected", mem_entry.selected_for_eval)
    assert_ge("has eval mappings", len(mem_entry.eval_mappings), 1)

    nomatch_entry = ledger.entries[1]
    assert_true("no-match conv dropped", bool(nomatch_entry.drop_reason))
    assert_false("no-match not selected", nomatch_entry.selected_for_eval)


def test_md_report_generation():
    print("test_md_report_generation")
    ledger = Ledger()
    now = datetime.now(timezone.utc)
    ledger.window_start = (now - timedelta(hours=24)).isoformat()
    ledger.window_end = now.isoformat()

    for c in SAMPLE_CANDIDATES[:3]:
        ledger.ingest_candidate(c)
    ledger.mark_selected("conv-001", "test match", ["p2e-ext-005"])
    ledger.mark_dropped("conv-003", "not relevant")

    kpi = ledger.compute_kpi()
    report = generate_md_report(ledger, kpi)

    assert_in("has title", "Last-24h", report)
    assert_in("has KPI table", "candidate_count", report)
    assert_in("has selected marker", "✅ selected", report)
    assert_in("has dropped marker", "❌ dropped", report)
    assert_in("has integrity section", "Integrity Check", report)


def test_cli_ingest_e2e():
    print("test_cli_ingest_e2e")
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        # Write candidate source
        candidates = SAMPLE_CANDIDATES[:3]
        source = tmp / "candidates.json"
        source.write_text(json.dumps(candidates, ensure_ascii=False, indent=2), encoding="utf-8")

        ledger_path = tmp / "ledger.json"
        kpi_path = tmp / "kpi.json"
        report_path = tmp / "report.md"

        script = Path(__file__).resolve().parent / "last24h_ledger.py"
        proc = subprocess.run(
            [sys.executable, str(script), "ingest",
             "--source", str(source),
             "--ledger", str(ledger_path),
             "--kpi-out", str(kpi_path),
             "--report-out", str(report_path)],
            capture_output=True, text=True, timeout=30,
        )

        assert_eq("cli exit code", proc.returncode, 0)
        assert_true("ledger file exists", ledger_path.exists())
        assert_true("kpi file exists", kpi_path.exists())
        assert_true("report file exists", report_path.exists())

        # Parse CLI output
        output = json.loads(proc.stdout.strip())
        assert_true("cli ok", output["ok"])
        assert_eq("cli added", output["added"], 3)

        # Validate the generated ledger
        ledger_data = json.loads(ledger_path.read_text(encoding="utf-8"))
        assert_eq("schema_version", ledger_data["schema_version"], LEDGER_SCHEMA_VERSION)
        assert_eq("entry_count", ledger_data["entry_count"], 3)

        # Validate KPI
        kpi_data = json.loads(kpi_path.read_text(encoding="utf-8"))
        assert_eq("kpi candidate_count", kpi_data["candidate_count"], 3)
        assert_true("kpi freshest set", bool(kpi_data["freshest_conversation_at"]))

        # Run validate subcommand
        proc2 = subprocess.run(
            [sys.executable, str(script), "validate", "--ledger", str(ledger_path)],
            capture_output=True, text=True, timeout=30,
        )
        val_out = json.loads(proc2.stdout.strip())
        assert_true("validate ok", val_out["ok"])


def test_cli_ingest_dedup():
    print("test_cli_ingest_dedup")
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        candidates = [make_candidate("conv-x"), make_candidate("conv-y")]
        source = tmp / "candidates.json"
        source.write_text(json.dumps(candidates, ensure_ascii=False), encoding="utf-8")

        ledger_path = tmp / "ledger.json"
        kpi_path = tmp / "kpi.json"
        report_path = tmp / "report.md"
        script = Path(__file__).resolve().parent / "last24h_ledger.py"

        # First ingest
        subprocess.run(
            [sys.executable, str(script), "ingest",
             "--source", str(source),
             "--ledger", str(ledger_path),
             "--kpi-out", str(kpi_path),
             "--report-out", str(report_path)],
            capture_output=True, text=True, timeout=30,
        )

        # Second ingest (same source) — should dedup
        proc = subprocess.run(
            [sys.executable, str(script), "ingest",
             "--source", str(source),
             "--ledger", str(ledger_path),
             "--kpi-out", str(kpi_path),
             "--report-out", str(report_path)],
            capture_output=True, text=True, timeout=30,
        )
        output = json.loads(proc.stdout.strip())
        assert_eq("dedup added 0", output["added"], 0)
        assert_eq("total still 2", output["total_entries"], 2)


# ── Runner ──────────────────────────────────────────────────────────────────

def main():
    tests = [
        test_ingest_basic,
        test_ingest_dedup,
        test_selection_and_drop,
        test_kpi_computation,
        test_save_load_roundtrip,
        test_validate_pass,
        test_validate_fail_duplicate,
        test_validate_fail_both_selected_and_dropped,
        test_validate_fail_empty_window,
        test_hash_tamper_detection,
        test_auto_match,
        test_md_report_generation,
        test_cli_ingest_e2e,
        test_cli_ingest_dedup,
    ]

    for t in tests:
        try:
            t()
        except Exception as e:
            global FAILED
            FAILED += 1
            print(f"  ERROR in {t.__name__}: {e}")

    total = PASSED + FAILED
    print(f"\n{'='*60}")
    if FAILED == 0:
        print(f"✅ All {total} assertions passed")
    else:
        print(f"❌ {FAILED}/{total} assertions FAILED")
    sys.exit(0 if FAILED == 0 else 1)


if __name__ == "__main__":
    main()
