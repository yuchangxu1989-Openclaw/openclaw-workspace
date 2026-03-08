#!/usr/bin/env python3
"""Auditable last-24h real-conversation ledger for evaluation ingestion.

This module provides:
  1. A LedgerEntry dataclass + JSON schema for recording each candidate conversation.
  2. A Ledger class that can:
     - append candidate conversations
     - record selection/drop decisions with reasons
     - map conversation_id -> eval_case_id[]
     - emit auditable KPIs: candidate_count, selected_count, dropped_count,
       freshest_conversation_at, dropped_reasons breakdown
  3. File-based persistence (JSON) under skills/aeo/generated/
  4. A CLI that:
     - ingest: reads a JSONL/JSON source of candidate conversations
     - kpi:    emits the current window KPIs as JSON
     - report: emits a human-readable markdown report
     - validate: checks ledger integrity (schema + invariants)

Design notes:
  - Workspace-only: never touches openclaw.json or runtime config.
  - Deterministic: given the same input, produces the same output.
  - Auditable: every entry has a timestamp, every decision has a reason.
"""

import argparse
import hashlib
import json
import os
import sys
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

ROOT = Path(__file__).resolve().parents[2]
GENERATED_DIR = ROOT / "skills" / "aeo" / "generated"
DEFAULT_LEDGER_PATH = GENERATED_DIR / "last24h-ledger.json"
DEFAULT_KPI_PATH = GENERATED_DIR / "last24h-kpi.json"
DEFAULT_REPORT_PATH = ROOT / "reports" / "last24h-ledger-report.md"
EVAL_CASES_PATH = ROOT / "principle-e2e-spec" / "08-capability-test-cases.json"

LEDGER_SCHEMA_VERSION = "1.0.0"


# ── Data model ──────────────────────────────────────────────────────────────

@dataclass
class ConversationMapping:
    """Maps a conversation to eval case(s) it was selected for."""
    eval_case_id: str
    match_reason: str  # why this conversation matched this case
    match_score: float = 0.0


@dataclass
class LedgerEntry:
    """A single candidate conversation in the ledger."""
    conversation_id: str
    source: str  # session | message | export | plugin
    started_at: str  # ISO-8601
    ended_at: str  # ISO-8601
    message_count: int = 0
    language: str = ""
    user_problem_summary: str = ""
    observed_failure_modes: List[str] = field(default_factory=list)
    selected_for_eval: bool = False
    selection_reason: str = ""
    drop_reason: str = ""
    eval_mappings: List[ConversationMapping] = field(default_factory=list)
    ingested_at: str = ""  # when this entry was added to the ledger
    entry_hash: str = ""  # sha256 of deterministic content for audit

    def compute_hash(self) -> str:
        """Deterministic hash for audit trail."""
        payload = json.dumps({
            "conversation_id": self.conversation_id,
            "source": self.source,
            "started_at": self.started_at,
            "ended_at": self.ended_at,
            "message_count": self.message_count,
            "user_problem_summary": self.user_problem_summary,
            "observed_failure_modes": sorted(self.observed_failure_modes),
        }, sort_keys=True, ensure_ascii=False)
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]


@dataclass
class LedgerKPI:
    """Emitted KPIs for the current ledger window."""
    window_start: str
    window_end: str
    candidate_count: int = 0
    selected_count: int = 0
    dropped_count: int = 0
    dropped_reasons: Dict[str, int] = field(default_factory=dict)
    freshest_conversation_at: str = ""
    conversation_eval_mappings: Dict[str, List[str]] = field(default_factory=dict)
    # conversation_id -> [eval_case_id, ...]
    schema_version: str = LEDGER_SCHEMA_VERSION
    computed_at: str = ""


# ── Ledger ──────────────────────────────────────────────────────────────────

class Ledger:
    """In-memory ledger that persists to JSON."""

    def __init__(self):
        self.entries: List[LedgerEntry] = []
        self.window_start: str = ""
        self.window_end: str = ""
        self.created_at: str = ""
        self.schema_version: str = LEDGER_SCHEMA_VERSION

    # ── Persistence ─────────────────────────────────────────────────────

    def save(self, path: Path = DEFAULT_LEDGER_PATH):
        path.parent.mkdir(parents=True, exist_ok=True)
        data = {
            "schema_version": self.schema_version,
            "created_at": self.created_at,
            "window_start": self.window_start,
            "window_end": self.window_end,
            "entry_count": len(self.entries),
            "entries": [asdict(e) for e in self.entries],
        }
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return path

    @classmethod
    def load(cls, path: Path = DEFAULT_LEDGER_PATH) -> "Ledger":
        data = json.loads(path.read_text(encoding="utf-8"))
        ledger = cls()
        ledger.schema_version = data.get("schema_version", LEDGER_SCHEMA_VERSION)
        ledger.created_at = data.get("created_at", "")
        ledger.window_start = data.get("window_start", "")
        ledger.window_end = data.get("window_end", "")
        for raw in data.get("entries", []):
            mappings = [ConversationMapping(**m) for m in raw.pop("eval_mappings", [])]
            entry = LedgerEntry(**raw)
            entry.eval_mappings = mappings
            ledger.entries.append(entry)
        return ledger

    # ── Ingest ──────────────────────────────────────────────────────────

    def ingest_candidate(self, raw: dict) -> LedgerEntry:
        """Add a candidate conversation record to the ledger."""
        now = datetime.now(timezone.utc).isoformat()
        entry = LedgerEntry(
            conversation_id=raw.get("conversation_id", ""),
            source=raw.get("source", "unknown"),
            started_at=raw.get("started_at", ""),
            ended_at=raw.get("ended_at", ""),
            message_count=int(raw.get("message_count", 0)),
            language=raw.get("language", ""),
            user_problem_summary=raw.get("user_problem_summary", ""),
            observed_failure_modes=raw.get("observed_failure_modes", []),
            ingested_at=now,
        )
        entry.entry_hash = entry.compute_hash()
        self.entries.append(entry)
        return entry

    # ── Selection / Drop ────────────────────────────────────────────────

    def mark_selected(self, conversation_id: str, reason: str, eval_case_ids: List[str], match_reasons: Optional[Dict[str, str]] = None):
        """Mark a conversation as selected for eval, with mappings."""
        for entry in self.entries:
            if entry.conversation_id == conversation_id:
                entry.selected_for_eval = True
                entry.selection_reason = reason
                entry.drop_reason = ""
                entry.eval_mappings = [
                    ConversationMapping(
                        eval_case_id=cid,
                        match_reason=(match_reasons or {}).get(cid, reason),
                    )
                    for cid in eval_case_ids
                ]
                return entry
        return None

    def mark_dropped(self, conversation_id: str, reason: str):
        """Mark a conversation as dropped, with reason."""
        for entry in self.entries:
            if entry.conversation_id == conversation_id:
                entry.selected_for_eval = False
                entry.selection_reason = ""
                entry.drop_reason = reason
                entry.eval_mappings = []
                return entry
        return None

    # ── Auto-match against eval cases ──────────────────────────────────

    def auto_match(self, eval_cases: list):
        """Score each unresolved entry against eval cases and decide select/drop."""
        for entry in self.entries:
            if entry.selected_for_eval or entry.drop_reason:
                continue  # already resolved
            matches = self._score_against_cases(entry, eval_cases)
            if matches:
                best = sorted(matches, key=lambda x: -x[1])
                case_ids = [m[0] for m in best]
                match_reasons = {m[0]: m[2] for m in best}
                self.mark_selected(
                    entry.conversation_id,
                    reason=f"auto-matched {len(best)} case(s), top={best[0][0]} score={best[0][1]}",
                    eval_case_ids=case_ids,
                    match_reasons=match_reasons,
                )
            else:
                self.mark_dropped(
                    entry.conversation_id,
                    reason="no eval case matched (failure modes or problem summary had no overlap)",
                )

    def _score_against_cases(self, entry: LedgerEntry, eval_cases: list):
        """Return list of (case_id, score, reason) for matches."""
        results = []
        entry_text = (
            entry.user_problem_summary.lower()
            + " "
            + " ".join(entry.observed_failure_modes).lower()
        )
        for case in eval_cases:
            if not isinstance(case, dict):
                continue
            case_id = case.get("case_id", "")
            case_text = json.dumps(case, ensure_ascii=False).lower()
            score = 0
            reasons = []
            # Match failure modes against case tags
            tags = [str(t).lower() for t in (case.get("tags") or [])]
            for fm in entry.observed_failure_modes:
                fm_l = fm.lower().replace("_", "-")
                if any(fm_l in t or t in fm_l for t in tags):
                    score += 3
                    reasons.append(f"failure_mode:{fm}→tag_match")
            # Match problem summary keywords against case content
            for word in entry_text.split():
                if len(word) > 3 and word in case_text:
                    score += 1
                    reasons.append(f"keyword:{word}")
            # Capability alignment
            capability = case.get("capability", "")
            if any(f in entry_text for f in ["expand", "扩充", "扩列"]):
                if capability in ("intent_expansion", "task_expansion"):
                    score += 2
                    reasons.append(f"capability_align:{capability}")
            if any(f in entry_text for f in ["memory", "记忆", "丢失", "handoff"]):
                if any("memory" in t or "handoff" in t for t in tags):
                    score += 3
                    reasons.append("memory_loss_tag_boost")
            if score >= 3:
                results.append((case_id, score, "; ".join(reasons[:5])))
        return results

    # ── KPI ─────────────────────────────────────────────────────────────

    def compute_kpi(self) -> LedgerKPI:
        selected = [e for e in self.entries if e.selected_for_eval]
        dropped = [e for e in self.entries if e.drop_reason]
        unresolved = [e for e in self.entries if not e.selected_for_eval and not e.drop_reason]

        # Dropped reasons breakdown
        reason_counts: Dict[str, int] = {}
        for e in dropped:
            key = e.drop_reason or "unspecified"
            reason_counts[key] = reason_counts.get(key, 0) + 1

        # Freshest conversation
        all_ends = [e.ended_at for e in self.entries if e.ended_at]
        freshest = max(all_ends) if all_ends else ""

        # Conversation → eval_case_id mappings
        mappings: Dict[str, List[str]] = {}
        for e in selected:
            mappings[e.conversation_id] = [m.eval_case_id for m in e.eval_mappings]

        return LedgerKPI(
            window_start=self.window_start,
            window_end=self.window_end,
            candidate_count=len(self.entries),
            selected_count=len(selected),
            dropped_count=len(dropped),
            dropped_reasons=reason_counts,
            freshest_conversation_at=freshest,
            conversation_eval_mappings=mappings,
            computed_at=datetime.now(timezone.utc).isoformat(),
        )

    # ── Validation ──────────────────────────────────────────────────────

    def validate(self) -> List[str]:
        """Check ledger integrity, return list of issues (empty = valid)."""
        issues = []
        if not self.window_start:
            issues.append("window_start is empty")
        if not self.window_end:
            issues.append("window_end is empty")
        seen_ids = set()
        for i, e in enumerate(self.entries):
            if not e.conversation_id:
                issues.append(f"entry[{i}]: conversation_id is empty")
            if e.conversation_id in seen_ids:
                issues.append(f"entry[{i}]: duplicate conversation_id '{e.conversation_id}'")
            seen_ids.add(e.conversation_id)
            if e.selected_for_eval and e.drop_reason:
                issues.append(f"entry[{i}]: both selected_for_eval=True and drop_reason set ('{e.drop_reason}')")
            if e.selected_for_eval and not e.eval_mappings:
                issues.append(f"entry[{i}]: selected_for_eval=True but no eval_mappings")
            if e.entry_hash and e.entry_hash != e.compute_hash():
                issues.append(f"entry[{i}]: entry_hash mismatch (tampered?)")
            if not e.ingested_at:
                issues.append(f"entry[{i}]: ingested_at is empty")
        # Invariant: candidate = selected + dropped + unresolved
        selected = sum(1 for e in self.entries if e.selected_for_eval)
        dropped = sum(1 for e in self.entries if e.drop_reason)
        unresolved = sum(1 for e in self.entries if not e.selected_for_eval and not e.drop_reason)
        if selected + dropped + unresolved != len(self.entries):
            issues.append(f"count invariant broken: selected({selected})+dropped({dropped})+unresolved({unresolved}) != total({len(self.entries)})")
        return issues


# ── Report generation ───────────────────────────────────────────────────────

def generate_md_report(ledger: Ledger, kpi: LedgerKPI) -> str:
    lines = [
        "# Last-24h Real-Conversation Evaluation Ledger Report",
        "",
        f"- **window**: `{kpi.window_start}` → `{kpi.window_end}`",
        f"- **computed_at**: `{kpi.computed_at}`",
        f"- **schema_version**: `{ledger.schema_version}`",
        "",
        "## KPIs",
        "",
        f"| Metric | Value |",
        f"|--------|-------|",
        f"| candidate_count | {kpi.candidate_count} |",
        f"| selected_count | {kpi.selected_count} |",
        f"| dropped_count | {kpi.dropped_count} |",
        f"| freshest_conversation_at | `{kpi.freshest_conversation_at}` |",
        "",
    ]

    if kpi.dropped_reasons:
        lines += [
            "## Dropped Reasons Breakdown",
            "",
            "| Reason | Count |",
            "|--------|-------|",
        ]
        for reason, count in sorted(kpi.dropped_reasons.items(), key=lambda x: -x[1]):
            lines.append(f"| {reason} | {count} |")
        lines.append("")

    if kpi.conversation_eval_mappings:
        lines += [
            "## Conversation → Eval Case Mappings",
            "",
            "| conversation_id | eval_case_ids |",
            "|----------------|---------------|",
        ]
        for cid, eids in sorted(kpi.conversation_eval_mappings.items()):
            lines.append(f"| `{cid}` | {', '.join(f'`{e}`' for e in eids)} |")
        lines.append("")

    lines += [
        "## All Entries",
        "",
    ]
    for e in ledger.entries:
        status = "✅ selected" if e.selected_for_eval else ("❌ dropped" if e.drop_reason else "⏳ unresolved")
        lines.append(f"### `{e.conversation_id}` — {status}")
        lines.append(f"- source: `{e.source}` | messages: {e.message_count} | lang: `{e.language}`")
        lines.append(f"- period: `{e.started_at}` → `{e.ended_at}`")
        lines.append(f"- problem: {e.user_problem_summary or '(none)'}")
        lines.append(f"- failure_modes: {', '.join(e.observed_failure_modes) or '(none)'}")
        if e.selected_for_eval:
            lines.append(f"- selection_reason: {e.selection_reason}")
            for m in e.eval_mappings:
                lines.append(f"  - → `{m.eval_case_id}`: {m.match_reason}")
        elif e.drop_reason:
            lines.append(f"- drop_reason: {e.drop_reason}")
        lines.append(f"- hash: `{e.entry_hash}` | ingested: `{e.ingested_at}`")
        lines.append("")

    # Integrity section
    issues = ledger.validate()
    lines += [
        "## Integrity Check",
        "",
    ]
    if issues:
        lines.append(f"**⚠️ {len(issues)} issue(s) found:**")
        for issue in issues:
            lines.append(f"- {issue}")
    else:
        lines.append("✅ All invariants pass. Ledger is consistent.")
    lines.append("")

    return "\n".join(lines) + "\n"


# ── CLI ─────────────────────────────────────────────────────────────────────

def cmd_ingest(args):
    """Ingest candidates from a JSON/JSONL file."""
    now = datetime.now(timezone.utc)
    source_path = Path(args.source)
    raw_text = source_path.read_text(encoding="utf-8").strip()

    # Support JSON array or JSONL
    candidates: list
    try:
        parsed = json.loads(raw_text)
        if isinstance(parsed, list):
            candidates = parsed
        elif isinstance(parsed, dict) and "records" in parsed:
            candidates = parsed["records"]
        else:
            candidates = [parsed]
    except json.JSONDecodeError:
        # Try JSONL
        candidates = []
        for line in raw_text.split("\n"):
            line = line.strip()
            if line:
                candidates.append(json.loads(line))

    # Load or create ledger
    ledger_path = Path(args.ledger)
    if ledger_path.exists():
        ledger = Ledger.load(ledger_path)
    else:
        ledger = Ledger()
        ledger.created_at = now.isoformat()

    ledger.window_start = (now - timedelta(hours=24)).isoformat()
    ledger.window_end = now.isoformat()

    # Deduplicate: skip if conversation_id already exists
    existing_ids = {e.conversation_id for e in ledger.entries}
    added = 0
    for raw in candidates:
        cid = raw.get("conversation_id", "")
        if cid and cid in existing_ids:
            continue
        ledger.ingest_candidate(raw)
        existing_ids.add(cid)
        added += 1

    # Auto-match against eval cases if available
    if EVAL_CASES_PATH.exists():
        eval_cases = json.loads(EVAL_CASES_PATH.read_text(encoding="utf-8"))
        ledger.auto_match(eval_cases)

    saved = ledger.save(ledger_path)
    kpi = ledger.compute_kpi()
    kpi_path = Path(args.kpi_out)
    kpi_path.parent.mkdir(parents=True, exist_ok=True)
    kpi_path.write_text(json.dumps(asdict(kpi), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    # Generate report
    report_path = Path(args.report_out)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(generate_md_report(ledger, kpi), encoding="utf-8")

    result = {
        "ok": True,
        "added": added,
        "total_entries": len(ledger.entries),
        "ledger_path": str(saved),
        "kpi_path": str(kpi_path),
        "report_path": str(report_path),
        "kpi": asdict(kpi),
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


def cmd_kpi(args):
    """Emit current KPIs from an existing ledger."""
    ledger = Ledger.load(Path(args.ledger))
    kpi = ledger.compute_kpi()
    print(json.dumps(asdict(kpi), ensure_ascii=False, indent=2))


def cmd_report(args):
    """Emit a markdown report from an existing ledger."""
    ledger = Ledger.load(Path(args.ledger))
    kpi = ledger.compute_kpi()
    report = generate_md_report(ledger, kpi)
    out = Path(args.report_out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(report, encoding="utf-8")
    print(json.dumps({"ok": True, "report_path": str(out)}, ensure_ascii=False, indent=2))


def cmd_validate(args):
    """Validate ledger integrity."""
    ledger = Ledger.load(Path(args.ledger))
    issues = ledger.validate()
    result = {
        "ok": len(issues) == 0,
        "issues": issues,
        "entry_count": len(ledger.entries),
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    sys.exit(0 if not issues else 1)


def main():
    parser = argparse.ArgumentParser(description="Last-24h real-conversation evaluation ledger")
    sub = parser.add_subparsers(dest="command")

    p_ingest = sub.add_parser("ingest", help="Ingest candidate conversations")
    p_ingest.add_argument("--source", required=True, help="JSON/JSONL file of candidate conversations")
    p_ingest.add_argument("--ledger", default=str(DEFAULT_LEDGER_PATH), help="Ledger file path")
    p_ingest.add_argument("--kpi-out", default=str(DEFAULT_KPI_PATH), help="KPI output path")
    p_ingest.add_argument("--report-out", default=str(DEFAULT_REPORT_PATH), help="Markdown report output path")

    p_kpi = sub.add_parser("kpi", help="Emit KPIs from existing ledger")
    p_kpi.add_argument("--ledger", default=str(DEFAULT_LEDGER_PATH))

    p_report = sub.add_parser("report", help="Generate markdown report")
    p_report.add_argument("--ledger", default=str(DEFAULT_LEDGER_PATH))
    p_report.add_argument("--report-out", default=str(DEFAULT_REPORT_PATH))

    p_validate = sub.add_parser("validate", help="Validate ledger integrity")
    p_validate.add_argument("--ledger", default=str(DEFAULT_LEDGER_PATH))

    args = parser.parse_args()
    if args.command == "ingest":
        cmd_ingest(args)
    elif args.command == "kpi":
        cmd_kpi(args)
    elif args.command == "report":
        cmd_report(args)
    elif args.command == "validate":
        cmd_validate(args)
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
