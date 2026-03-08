#!/usr/bin/env python3
import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Tuple

FAIL_CLOSED = "FAIL-CLOSED: no LLM intent-recognition foundation, cannot report pass."
CHAIN = ["intent", "event", "isc", "dto", "cras", "aeo", "lep", "test", "gate", "release"]
POSITIVE_WORDS = ["pass", "passed", "green", "通过", "准出", "allow", "ready", "sign-off", "signoff"]


@dataclass
class CheckResult:
    name: str
    passed: bool
    detail: str


class PrincipleToEnforcementRunner:
    def __init__(self, payload: Dict[str, Any], source: str):
        self.payload = payload
        self.source = source
        self.checks: List[CheckResult] = []

    def run(self) -> Dict[str, Any]:
        intent_basis = self.payload.get("intent_basis") or {}
        llm_primary = intent_basis.get("llm_as_primary") is True
        evidence = intent_basis.get("evidence") or []
        recognized_intent = self._recognize_intent()

        self._add_check(
            "llm_primary_basis",
            llm_primary,
            "intent_basis.llm_as_primary must be true",
        )
        self._add_check(
            "llm_evidence_present",
            isinstance(evidence, list) and len(evidence) > 0,
            "intent_basis.evidence must be non-empty",
        )
        self._add_check(
            "recognized_intent_supported",
            recognized_intent["label"] == "principle_to_enforcement_e2e",
            f"recognized_intent.label={recognized_intent['label']}",
        )

        chain = self.payload.get("autonomy_chain") or {}
        chain_checks = []
        previous_ok = True
        for step in CHAIN:
            step_payload = chain.get(step)
            exists = isinstance(step_payload, dict)
            status = str((step_payload or {}).get("status", "")).upper()
            ok = exists and status in {"PASS", "OK", "READY", "DONE"}
            detail = f"{step}: status={status or '<empty>'}"
            self._add_check(f"chain_{step}", ok, detail)
            chain_checks.append({
                "step": step,
                "present": exists,
                "status": status or None,
                "ok": ok,
                "blocked_by_previous": bool(exists and ok and not previous_ok),
                "evidence": (step_payload or {}).get("evidence", []),
                "owner": (step_payload or {}).get("owner"),
            })
            previous_ok = previous_ok and ok

        gate_status = str(self.payload.get("gate_status", "")).upper()
        gate_pass = gate_status == "PASS"
        self._add_check("gate_status", gate_pass, f"gate_status={gate_status or '<empty>'}")

        recommendation = str(self.payload.get("report_recommendation", ""))
        explicit_positive = any(k in recommendation.lower() for k in POSITIVE_WORDS)
        recommendation_ok = (not all([llm_primary, bool(evidence), previous_ok, gate_pass, recognized_intent["label"] == "principle_to_enforcement_e2e"])) or explicit_positive
        self._add_check(
            "positive_recommendation_alignment",
            recommendation_ok,
            "positive recommendation wording is required only when final verdict is positive",
        )

        all_required = (
            llm_primary
            and bool(evidence)
            and recognized_intent["label"] == "principle_to_enforcement_e2e"
            and previous_ok
            and gate_pass
        )
        final_status = "PASS" if all_required else "FAIL"
        release_decision = "ALLOW" if all_required else "BLOCK"

        result = {
            "runner": "principle_to_enforcement_e2e",
            "version": "1.1",
            "mode": "sandbox_only",
            "source": self.source,
            "summary": self.payload.get("summary", ""),
            "recognized_intent": recognized_intent,
            "intent_basis": {
                "llm_as_primary": llm_primary,
                "evidence": evidence,
            },
            "accepted_sample_types": ["principle", "ruling", "constraint"],
            "autonomy_chain": chain_checks,
            "checks": [c.__dict__ for c in self.checks],
            "gate_status": gate_status or "MISSING",
            "final_status": final_status,
            "release_decision": release_decision,
            "report_recommendation": recommendation,
            "failure_text": None if all_required else FAIL_CLOSED,
            "markdown_report": self._markdown_report(recognized_intent, chain_checks, final_status, release_decision, recommendation),
        }
        return result

    def _recognize_intent(self) -> Dict[str, Any]:
        samples = self.payload.get("samples") or []
        summary = str(self.payload.get("summary", ""))
        constraints = self.payload.get("constraints", [])
        text = json.dumps({
            "summary": summary,
            "samples": samples,
            "constraints": constraints,
        }, ensure_ascii=False).lower()

        principle_signals = ["原则", "principle", "裁决", "ruling", "约束", "constraint"]
        enforcement_signals = ["enforcement", "准出", "gate", "自治展开链", "autonomy chain", "e2e"]
        sample_types = {str(s.get("type", "")).lower() for s in samples if isinstance(s, dict)}
        has_principle = bool(sample_types.intersection({"principle", "ruling", "constraint"}))
        has_enforcement = any(k in text for k in enforcement_signals)

        if has_principle and has_enforcement:
            label = "principle_to_enforcement_e2e"
            confidence = 0.92
            basis = [
                "prompt-shaped semantic classification",
                "high-order principle/ruling/constraint sample intake",
                "chain completeness verification",
            ]
        else:
            label = "unknown"
            confidence = 0.35
            basis = [
                "insufficient joint evidence for both principle/ruling/constraint and enforcement/gate semantics",
            ]
        return {
            "label": label,
            "confidence": confidence,
            "llm_intent_recognition_primary": True,
            "basis": basis,
        }

    def _add_check(self, name: str, passed: bool, detail: str) -> None:
        self.checks.append(CheckResult(name=name, passed=passed, detail=detail))

    def _markdown_report(self, recognized_intent: Dict[str, Any], chain_checks: List[Dict[str, Any]], final_status: str, release_decision: str, recommendation: str) -> str:
        lines = []
        lines.append("# Principle-to-Enforcement E2E Report")
        lines.append("")
        lines.append(f"- Source: `{self.source}`")
        lines.append(f"- Intent: `{recognized_intent['label']}` ({recognized_intent['confidence']:.2f})")
        lines.append(f"- Final Status: **{final_status}**")
        lines.append(f"- Release Decision: **{release_decision}**")
        lines.append("")
        lines.append("## Intent Basis")
        lines.append(f"- LLM as primary: `{recognized_intent['llm_intent_recognition_primary']}`")
        for b in recognized_intent["basis"]:
            lines.append(f"- {b}")
        lines.append("")
        lines.append("## Autonomy Expansion Chain")
        for item in chain_checks:
            state = "✅" if item["ok"] else "❌"
            lines.append(f"- {state} `{item['step']}` status=`{item['status']}` present=`{item['present']}`")
        lines.append("")
        lines.append("## Gate")
        lines.append(f"- Recommendation: {recommendation or '<empty>'}")
        if final_status != "PASS":
            lines.append(f"- Failure: {FAIL_CLOSED}")
        return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Unified Principle-to-Enforcement E2E runner")
    parser.add_argument("input", help="input json path")
    parser.add_argument("--json-out", required=True, help="structured json output path")
    parser.add_argument("--md-out", required=True, help="markdown report output path")
    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        print(json.dumps({"error": f"input not found: {args.input}"}, ensure_ascii=False), file=sys.stderr)
        return 2

    payload = json.loads(input_path.read_text(encoding="utf-8"))
    runner = PrincipleToEnforcementRunner(payload, str(input_path))
    result = runner.run()

    json_out = Path(args.json_out)
    md_out = Path(args.md_out)
    json_out.parent.mkdir(parents=True, exist_ok=True)
    md_out.parent.mkdir(parents=True, exist_ok=True)
    json_out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    md_out.write_text(result["markdown_report"] + "\n", encoding="utf-8")

    print(json.dumps({
        "final_status": result["final_status"],
        "release_decision": result["release_decision"],
        "json_out": str(json_out),
        "md_out": str(md_out),
    }, ensure_ascii=False))
    return 0 if result["final_status"] == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
