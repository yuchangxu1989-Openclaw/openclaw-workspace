#!/usr/bin/env python3
import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CLOSED_BOOK_GATE = ROOT / "scripts" / "closed_book_gate.py"
DEFAULT_INTENT_GATE = "ISC-INTENT-EVAL-001"
DEFAULT_CLOSED_BOOK_GATE = "ISC-CLOSED-BOOK-001"
DEFAULT_RUNNER_VERSION = "1.3.0"

# Timeout (seconds) for subprocess calls — prevents indefinite hangs
GATE_TIMEOUT_SECONDS = 30

SUPPORTED_INTENTS = {"PRINCIPLE", "VERDICT", "CONSTRAINT", "GOAL", "DIRECTIVE", "MIXED"}
CAPABILITY_STAGE_MAP = {
    "intent_expansion": "intent",
    "event_completion": "event",
    "task_expansion": "dto",
    "rca_analysis": "rca",
    "gap_assessment": "gap",
    "fix_proposal": "fix",
    "dispatch_verification": "dispatch",
}

HIGH_WEIGHT_DIMENSIONS = {
    "autonomy",
    "correction",
    "execution_chain_completeness",
    "timely_task_fanout",
}

HIGH_WEIGHT_CASE_TAG_HINTS = {
    "autonomy": ["autonomy", "自主性", "execute-first", "execute_first", "少分析", "先执行"],
    "correction": ["correction", "纠偏", "纠错", "memory-loss", "memory_loss", "handoff"],
    "execution_chain_completeness": ["execution-chain", "execution_chain", "执行链", "链路补全", "状态更新", "event-completion"],
    "timely_task_fanout": ["task-expansion", "task_expansion", "扩列", "fanout", "execute-first", "correction-enqueue"],
}


def iso_now() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def run_closed_book(runtime_path: Path):
    try:
        proc = subprocess.run(
            [sys.executable, str(CLOSED_BOOK_GATE), str(runtime_path)],
            capture_output=True,
            text=True,
            timeout=GATE_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired:
        return 1, {"verdict": "FAIL", "code": "GATE_TIMEOUT", "reasons": [f"closed_book_gate exceeded {GATE_TIMEOUT_SECONDS}s timeout"]}
    stdout = (proc.stdout or "").strip()
    try:
        payload = json.loads(stdout) if stdout else {"verdict": "FAIL", "code": "EMPTY_OUTPUT", "reasons": ["gate emitted no JSON"]}
    except json.JSONDecodeError:
        payload = {"verdict": "FAIL", "code": "INVALID_GATE_OUTPUT", "reasons": [stdout or proc.stderr.strip() or "unknown gate output"]}
    return proc.returncode, payload


def _contains_all(haystack, needles):
    text = json.dumps(haystack, ensure_ascii=False)
    return [n for n in needles if n not in text]


def _case_text(case_obj: dict) -> str:
    return json.dumps(case_obj, ensure_ascii=False).lower()


def infer_high_weight_dimensions(case_obj: dict):
    text = _case_text(case_obj)
    matched = []
    for dimension, hints in HIGH_WEIGHT_CASE_TAG_HINTS.items():
        if any(str(hint).lower() in text for hint in hints):
            matched.append(dimension)
    return matched


def evaluate_high_weight_alignment(case_obj: dict, runtime_obj: dict):
    expected = set(case_obj.get("expected", {}).get("dataset_weighting", {}).get("must_prioritize_dimensions", []))
    inferred = set(infer_high_weight_dimensions(case_obj))
    required = expected | inferred
    if not required:
        checks = [{"check_id": "dataset.weighting.skip", "passed": True, "actual_value": []}]
        return True, [], checks, {"required_dimensions": [], "actual_dimensions": []}

    declared = runtime_obj.get("dataset_weighting", {}) or {}
    actual = set(declared.get("prioritized_dimensions") or [])
    missing = sorted(list(required - actual))
    checks = [
        {"check_id": "dataset.weighting.required_dimensions", "passed": len(missing) == 0, "actual_value": sorted(list(actual)), "details": "required=" + ", ".join(sorted(list(required)))},
        {"check_id": "dataset.weighting.high_weight_only", "passed": all(dim in HIGH_WEIGHT_DIMENSIONS for dim in actual), "actual_value": sorted(list(actual))},
    ]
    reasons = []
    if missing:
        reasons.append("dataset_weighting missing prioritized dimensions: " + ", ".join(missing))
    undeclared = [dim for dim in actual if dim not in HIGH_WEIGHT_DIMENSIONS]
    if undeclared:
        reasons.append("dataset_weighting contains non-programmatic dimensions: " + ", ".join(sorted(undeclared)))
    return len(reasons) == 0, reasons, checks, {
        "required_dimensions": sorted(list(required)),
        "actual_dimensions": sorted(list(actual)),
        "inferred_dimensions": sorted(list(inferred)),
        "declared_dimensions": sorted(list(actual)),
    }


def evaluate_capability(case_obj: dict, runtime_obj: dict):
    expected = case_obj.get("expected", {})
    outputs = runtime_obj.get("capability_outputs", {})
    capability = case_obj.get("capability")

    if capability == "intent_expansion":
        spec = expected.get("intent_expansion", {})
        expansions = outputs.get("intent_expansion") or []
        reasons = []
        required = spec.get("required") is True
        if required and len(expansions) < int(spec.get("min_expansions", 0)):
            reasons.append(f"intent_expansion count < {spec.get('min_expansions')}")
        present_kinds = {item.get("kind") for item in expansions if isinstance(item, dict)}
        missing_kinds = [k for k in spec.get("must_include", []) if k not in present_kinds]
        if missing_kinds:
            reasons.append("intent_expansion missing kinds: " + ", ".join(missing_kinds))
        missing_contains = _contains_all(expansions, spec.get("contains", []))
        if missing_contains:
            reasons.append("intent_expansion missing content: " + ", ".join(missing_contains))
        checks = [
            {"check_id": "intent.expansion.count", "passed": len(expansions) >= int(spec.get("min_expansions", 0)), "actual_value": len(expansions)},
            {"check_id": "intent.expansion.kinds", "passed": len(missing_kinds) == 0, "actual_value": sorted(list(present_kinds))},
        ]
        return len(reasons) == 0, reasons, checks, {"expansion_count": len(expansions), "expansions": expansions}

    if capability == "event_completion":
        spec = expected.get("event_completion", {})
        completed = outputs.get("event_completion") or {}
        reasons = []
        recovered_events = completed.get("recovered_events") if isinstance(completed, dict) else None
        resolved = completed
        exp_source = spec.get("expected_source_event")
        if exp_source and isinstance(recovered_events, dict) and isinstance(recovered_events.get(exp_source), dict):
            resolved = {**completed, **recovered_events.get(exp_source, {})}
            resolved["source_event"] = exp_source
        missing_fields = [f for f in spec.get("must_complete_fields", []) if not resolved.get(f)]
        if missing_fields:
            reasons.append("event_completion missing fields: " + ", ".join(missing_fields))
        if exp_source and resolved.get("source_event") != exp_source:
            reasons.append(f"event_completion.source_event != {exp_source}")
        checks = [
            {"check_id": "event.completion.fields", "passed": len(missing_fields) == 0, "actual_value": sorted(list(resolved.keys()))},
            {"check_id": "event.completion.source", "passed": (not exp_source) or resolved.get("source_event") == exp_source, "actual_value": resolved.get("source_event")},
        ]
        return len(reasons) == 0, reasons, checks, {"completed": resolved, "raw_completed": completed}

    if capability == "task_expansion":
        spec = expected.get("task_expansion", {})
        tasks = outputs.get("task_expansion") or []
        if spec.get("required") is False:
            checks = [{"check_id": "task.expansion.skip", "passed": True, "actual_value": len(tasks)}]
            return True, [], checks, {"task_count": len(tasks), "tasks": tasks}
        reasons = []
        if len(tasks) < int(spec.get("min_tasks", 0)):
            reasons.append(f"task_expansion count < {spec.get('min_tasks')}")
        present_kinds = {item.get("kind") for item in tasks if isinstance(item, dict)}
        missing_kinds = [k for k in spec.get("must_include_task_kinds", []) if k not in present_kinds]
        if missing_kinds:
            reasons.append("task_expansion missing kinds: " + ", ".join(missing_kinds))
        missing_contains = _contains_all(tasks, spec.get("contains", []))
        if missing_contains:
            reasons.append("task_expansion missing content: " + ", ".join(missing_contains))
        checks = [
            {"check_id": "task.expansion.count", "passed": len(tasks) >= int(spec.get("min_tasks", 0)), "actual_value": len(tasks)},
            {"check_id": "task.expansion.kinds", "passed": len(missing_kinds) == 0, "actual_value": sorted(list(present_kinds))},
        ]
        return len(reasons) == 0, reasons, checks, {"task_count": len(tasks), "tasks": tasks}

    # ── PB-010 hardened capabilities: RCA / Gap / Fix / Dispatch ──

    if capability == "rca_analysis":
        spec = expected.get("rca_analysis", {})
        rca = outputs.get("rca_analysis") or {}
        reasons = []
        # Must identify root cause
        if not rca.get("root_cause"):
            reasons.append("rca_analysis.root_cause is empty or missing")
        # Must provide evidence chain
        evidence = rca.get("evidence_chain") or []
        min_evidence = int(spec.get("min_evidence_items", 1))
        if len(evidence) < min_evidence:
            reasons.append(f"rca_analysis.evidence_chain count {len(evidence)} < required {min_evidence}")
        # Must have severity
        if spec.get("require_severity", False) and not rca.get("severity"):
            reasons.append("rca_analysis.severity is required but missing")
        # Must have blast_radius if required
        if spec.get("require_blast_radius", False) and not rca.get("blast_radius"):
            reasons.append("rca_analysis.blast_radius is required but missing")
        # Contains check
        missing_contains = _contains_all(rca, spec.get("contains", []))
        if missing_contains:
            reasons.append("rca_analysis missing content: " + ", ".join(missing_contains))
        checks = [
            {"check_id": "rca.root_cause_present", "passed": bool(rca.get("root_cause")), "actual_value": rca.get("root_cause", "")[:120]},
            {"check_id": "rca.evidence_chain", "passed": len(evidence) >= min_evidence, "actual_value": len(evidence)},
            {"check_id": "rca.severity", "passed": bool(rca.get("severity")) or not spec.get("require_severity"), "actual_value": rca.get("severity")},
        ]
        return len(reasons) == 0, reasons, checks, {"rca": rca}

    if capability == "gap_assessment":
        spec = expected.get("gap_assessment", {})
        gaps = outputs.get("gap_assessment") or {}
        gap_items = gaps.get("gaps") or []
        reasons = []
        min_gaps = int(spec.get("min_gaps", 1))
        if len(gap_items) < min_gaps:
            reasons.append(f"gap_assessment.gaps count {len(gap_items)} < required {min_gaps}")
        # Each gap must have category + description
        for i, g in enumerate(gap_items):
            if not isinstance(g, dict):
                reasons.append(f"gap_assessment.gaps[{i}] is not a dict")
                continue
            if not g.get("category"):
                reasons.append(f"gap_assessment.gaps[{i}].category missing")
            if not g.get("description"):
                reasons.append(f"gap_assessment.gaps[{i}].description missing")
        # Must include required categories
        present_cats = {g.get("category") for g in gap_items if isinstance(g, dict)}
        required_cats = spec.get("must_include_categories", [])
        missing_cats = [c for c in required_cats if c not in present_cats]
        if missing_cats:
            reasons.append("gap_assessment missing categories: " + ", ".join(missing_cats))
        # Coverage score
        coverage = gaps.get("coverage_score")
        if spec.get("require_coverage_score", False) and coverage is None:
            reasons.append("gap_assessment.coverage_score required but missing")
        checks = [
            {"check_id": "gap.count", "passed": len(gap_items) >= min_gaps, "actual_value": len(gap_items)},
            {"check_id": "gap.categories", "passed": len(missing_cats) == 0, "actual_value": sorted(list(present_cats))},
            {"check_id": "gap.coverage_score", "passed": coverage is not None or not spec.get("require_coverage_score"), "actual_value": coverage},
        ]
        return len(reasons) == 0, reasons, checks, {"gap_count": len(gap_items), "gaps": gap_items}

    if capability == "fix_proposal":
        spec = expected.get("fix_proposal", {})
        fix = outputs.get("fix_proposal") or {}
        fixes = fix.get("fixes") or []
        reasons = []
        min_fixes = int(spec.get("min_fixes", 1))
        if len(fixes) < min_fixes:
            reasons.append(f"fix_proposal.fixes count {len(fixes)} < required {min_fixes}")
        # Each fix must have action + target + rationale
        required_fix_fields = spec.get("required_fix_fields", ["action", "target", "rationale"])
        for i, f in enumerate(fixes):
            if not isinstance(f, dict):
                reasons.append(f"fix_proposal.fixes[{i}] is not a dict")
                continue
            for field in required_fix_fields:
                if not f.get(field):
                    reasons.append(f"fix_proposal.fixes[{i}].{field} missing")
        # Rollback plan required?
        if spec.get("require_rollback_plan", False) and not fix.get("rollback_plan"):
            reasons.append("fix_proposal.rollback_plan required but missing")
        # Contains check
        missing_contains = _contains_all(fix, spec.get("contains", []))
        if missing_contains:
            reasons.append("fix_proposal missing content: " + ", ".join(missing_contains))
        checks = [
            {"check_id": "fix.count", "passed": len(fixes) >= min_fixes, "actual_value": len(fixes)},
            {"check_id": "fix.fields_complete", "passed": all(
                isinstance(f, dict) and all(f.get(fld) for fld in required_fix_fields)
                for f in fixes
            ) if fixes else False, "actual_value": len(fixes)},
            {"check_id": "fix.rollback_plan", "passed": bool(fix.get("rollback_plan")) or not spec.get("require_rollback_plan"), "actual_value": bool(fix.get("rollback_plan"))},
        ]
        return len(reasons) == 0, reasons, checks, {"fix_count": len(fixes), "fixes": fixes}

    if capability == "dispatch_verification":
        spec = expected.get("dispatch_verification", {})
        dispatch = outputs.get("dispatch_verification") or {}
        dispatches = dispatch.get("dispatches") or []
        reasons = []

        # ── HARDENING: eliminate expected_dispatches_min=0 loophole ──
        # If dispatch_verification capability is declared, at least 1 dispatch is MANDATORY.
        # The spec can raise the floor (min_dispatches >= 2 etc.) but can never set it to 0.
        raw_min = int(spec.get("min_dispatches", 1))
        min_dispatches = max(raw_min, 1)  # floor = 1, never 0
        if raw_min < 1:
            reasons.append(f"HARDENING: min_dispatches={raw_min} is below the enforced floor of 1 — "
                           f"expected_dispatches_min=0 loophole is blocked")

        if len(dispatches) < min_dispatches:
            reasons.append(f"dispatch_verification.dispatches count {len(dispatches)} < required {min_dispatches}")

        # Each dispatch must have target + status + timestamp
        required_dispatch_fields = spec.get("required_dispatch_fields", ["target", "status", "timestamp"])
        for i, d in enumerate(dispatches):
            if not isinstance(d, dict):
                reasons.append(f"dispatch_verification.dispatches[{i}] is not a dict")
                continue
            for field in required_dispatch_fields:
                if not d.get(field):
                    reasons.append(f"dispatch_verification.dispatches[{i}].{field} missing")

        # Success rate check
        success_count = sum(1 for d in dispatches if isinstance(d, dict) and d.get("status") == "success")
        min_success_rate = float(spec.get("min_success_rate", 1.0))
        actual_rate = success_count / len(dispatches) if dispatches else 0.0
        if actual_rate < min_success_rate:
            reasons.append(f"dispatch success rate {actual_rate:.2f} < required {min_success_rate:.2f}")

        # Must reach expected targets
        reached_targets = {d.get("target") for d in dispatches if isinstance(d, dict) and d.get("status") == "success"}
        must_reach = spec.get("must_reach_targets", [])
        missed_targets = [t for t in must_reach if t not in reached_targets]
        if missed_targets:
            reasons.append("dispatch missed targets: " + ", ".join(missed_targets))

        checks = [
            {"check_id": "dispatch.count", "passed": len(dispatches) >= min_dispatches, "actual_value": len(dispatches)},
            {"check_id": "dispatch.success_rate", "passed": actual_rate >= min_success_rate, "actual_value": round(actual_rate, 4)},
            {"check_id": "dispatch.targets_reached", "passed": len(missed_targets) == 0, "actual_value": sorted(list(reached_targets))},
            {"check_id": "dispatch.min_floor_enforced", "passed": raw_min >= 1, "actual_value": f"spec={raw_min}, enforced={min_dispatches}"},
        ]
        return len(reasons) == 0, reasons, checks, {"dispatch_count": len(dispatches), "success_count": success_count, "dispatches": dispatches}

    return True, [], [{"check_id": "capability.none", "passed": True, "actual_value": capability}], {}


def evaluate_case(case_obj: dict, runtime_path: Path, runner_version: str):
    # Guard: reject non-dict input (e.g. if a list of cases is accidentally passed)
    if not isinstance(case_obj, dict):
        return {
            "verdict_id": "verdict-invalid-input",
            "run_id": f"benchmark-run-{runtime_path.stem}",
            "case_id": "INVALID",
            "verdict": "FAIL",
            "p2e_score": 0.0,
            "hard_gate_failures": 1,
            "stage_results": [{
                "gate_id": "INPUT_VALIDATION",
                "stage_id": "input",
                "stage_name": "Case input type validation",
                "verdict": "FAIL",
                "score": 0.0,
                "checks": [{"check_id": "input.type", "passed": False, "actual_value": type(case_obj).__name__, "details": "Expected a single case object (dict), got " + type(case_obj).__name__ + ". If passing a case list file, use --case with individual case objects or a batch runner."}],
                "duration_ms": 0,
                "fail_closed": True,
                "hard_gate": True,
                "details": {"reasons": ["case_obj must be a dict, not " + type(case_obj).__name__]},
            }],
            "created_at": iso_now(),
            "runner_version": runner_version,
            "gates_applied": ["INPUT_VALIDATION"],
            "default_fail_closed": True,
        }

    runtime_obj = load_json(runtime_path)
    gate_order = [DEFAULT_INTENT_GATE, DEFAULT_CLOSED_BOOK_GATE]
    results = []
    hard_gate_failures = 0

    intent_pass = True
    required_case_fields = ["case_id", "intent_type", "input", "expected", "verdict_expectation", "priority", "tags", "regression_guard"]
    missing_case_fields = [k for k in required_case_fields if k not in case_obj]
    intent_reasons = []
    if missing_case_fields:
        intent_pass = False
        hard_gate_failures += 1
        intent_reasons.append(f"missing benchmark case fields: {', '.join(missing_case_fields)}")

    if case_obj.get("intent_type") not in SUPPORTED_INTENTS:
        intent_pass = False
        hard_gate_failures += 1
        intent_reasons.append(f"unsupported intent_type: {case_obj.get('intent_type')}")

    results.append({
        "gate_id": DEFAULT_INTENT_GATE,
        "stage_id": "intent",
        "stage_name": "INTENT benchmark entry validation",
        "verdict": "PASS" if intent_pass else "FAIL",
        "score": 1.0 if intent_pass else 0.0,
        "checks": [{"check_id": "intent.case_shape", "passed": intent_pass, "actual_value": case_obj.get("intent_type"), "details": "; ".join(intent_reasons)}],
        "duration_ms": 1,
        "fail_closed": True,
        "hard_gate": True,
        "details": {"validated_fields": required_case_fields, "reasons": intent_reasons},
    })

    capability_pass, capability_reasons, capability_checks, artifacts = evaluate_capability(case_obj, runtime_obj)
    capability = case_obj.get("capability")
    if capability and not capability_pass:
        hard_gate_failures += 1
    if capability:
        results.append({
            "gate_id": f"CAP-{capability.upper()}",
            "stage_id": CAPABILITY_STAGE_MAP.get(capability, "test"),
            "stage_name": capability,
            "verdict": "PASS" if capability_pass else "FAIL",
            "score": 1.0 if capability_pass else 0.0,
            "checks": capability_checks,
            "duration_ms": 1,
            "fail_closed": True,
            "hard_gate": True,
            "details": {"reasons": capability_reasons},
            "artifacts": artifacts,
        })
        gate_order.append(f"CAP-{capability.upper()}")

    weighting_pass, weighting_reasons, weighting_checks, weighting_artifacts = evaluate_high_weight_alignment(case_obj, runtime_obj)
    if not weighting_pass:
        hard_gate_failures += 1
    if weighting_artifacts.get("required_dimensions"):
        results.append({
            "gate_id": "DATASET-WEIGHTING-HARDENING",
            "stage_id": "registry",
            "stage_name": "dataset_weighting_hardening",
            "verdict": "PASS" if weighting_pass else "FAIL",
            "score": 1.0 if weighting_pass else 0.0,
            "checks": weighting_checks,
            "duration_ms": 1,
            "fail_closed": True,
            "hard_gate": True,
            "details": {"reasons": weighting_reasons},
            "artifacts": weighting_artifacts,
        })
        gate_order.append("DATASET-WEIGHTING-HARDENING")

    closed_book_rc, closed_book_payload = run_closed_book(runtime_path)
    closed_book_pass = closed_book_rc == 0 and closed_book_payload.get("verdict") == "SUCCESS"
    if not closed_book_pass:
        hard_gate_failures += 1

    results.append({
        "gate_id": DEFAULT_CLOSED_BOOK_GATE,
        "stage_id": "gate",
        "stage_name": "Closed book hard gate",
        "verdict": "PASS" if closed_book_pass else "FAIL",
        "score": 1.0 if closed_book_pass else 0.0,
        "checks": [{"check_id": "gate.closed_book", "passed": closed_book_pass, "actual_value": closed_book_payload.get("verdict"), "details": json.dumps(closed_book_payload, ensure_ascii=False)}],
        "duration_ms": 1,
        "fail_closed": True,
        "hard_gate": True,
        "details": {
            "exit_code": closed_book_rc,
            "payload": closed_book_payload,
        },
    })

    final_verdict = "SUCCESS" if hard_gate_failures == 0 else "FAIL"
    expected_verdict = case_obj.get("verdict_expectation")
    if expected_verdict == "SKIP" and final_verdict == "SUCCESS":
        final_verdict = "SKIP"

    p2e_score = 1.0 if final_verdict in {"SUCCESS", "SKIP"} else 0.0

    return {
        "verdict_id": f"verdict-{case_obj.get('case_id', 'unknown')}",
        "run_id": f"benchmark-run-{runtime_path.stem}",
        "case_id": case_obj.get("case_id", "unknown"),
        "verdict": final_verdict,
        "p2e_score": p2e_score,
        "hard_gate_failures": hard_gate_failures,
        "stage_results": results,
        "created_at": iso_now(),
        "runner_version": runner_version,
        "gates_applied": gate_order,
        "default_fail_closed": True,
    }


def main():
    parser = argparse.ArgumentParser(description="Unified benchmark runner with dual fail-closed gates")
    parser.add_argument("--case", required=True, help="Benchmark case JSON path")
    parser.add_argument("--runtime", required=True, help="Closed-book runtime JSON path")
    parser.add_argument("--out", required=True, help="Output verdict JSON path")
    parser.add_argument("--runner-version", default=DEFAULT_RUNNER_VERSION)
    args = parser.parse_args()

    case_path = Path(args.case)
    runtime_path = Path(args.runtime)
    out_path = Path(args.out)

    case_obj = load_json(case_path)
    verdict = evaluate_case(case_obj, runtime_path, args.runner_version)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(verdict, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(json.dumps(verdict, ensure_ascii=False, indent=2))
    sys.exit(0 if verdict["verdict"] in {"SUCCESS", "SKIP"} else 2)


if __name__ == "__main__":
    main()
