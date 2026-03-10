#!/usr/bin/env python3
"""补跑Claude Opus单模型评测，与已有GLM结果合并生成报告"""

import json, os, sys, time, re, traceback
from datetime import datetime
from pathlib import Path
import urllib.request

sys.path.insert(0, str(Path(__file__).parent))
from benchmark_runner import (
    EVAL_SET, REPORT_PATH, RESULTS_DIR, SYSTEM_PROMPT,
    parse_llm_output, compute_metrics, compute_per_scenario,
    estimate_cost, generate_report
)

# Load Claude config
with open("/root/.openclaw/openclaw.json") as f:
    cfg = json.load(f)
providers = cfg.get("models", {}).get("providers", {})
CLAUDE_BASE = providers["claude-researcher"]["baseUrl"].rstrip("/")
CLAUDE_KEY = providers["claude-researcher"]["apiKey"]

def call_claude(message: str) -> tuple:
    url = f"{CLAUDE_BASE}/v1/messages"
    payload = json.dumps({
        "model": "claude-opus-4-6",
        "max_tokens": 200,
        "temperature": 0.1,
        "system": SYSTEM_PROMPT,
        "messages": [{"role": "user", "content": message}]
    }, ensure_ascii=False).encode("utf-8")

    req = urllib.request.Request(url, data=payload, headers={
        "x-api-key": CLAUDE_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json"
    })

    t0 = time.monotonic()
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            body = json.loads(resp.read())
    except Exception as e:
        return {"error": str(e)}, (time.monotonic() - t0) * 1000
    latency = (time.monotonic() - t0) * 1000

    content = ""
    for block in body.get("content", []):
        if block.get("type") == "text":
            content += block.get("text", "")
    usage = body.get("usage", {})
    return parse_llm_output(content, usage), latency


def main():
    print("=" * 60)
    print(" Claude Opus 4.6 补测")
    print(f" 时间: {datetime.now().isoformat()}")
    print("=" * 60)

    with open(EVAL_SET) as f:
        cases = json.load(f)["cases"]
    print(f"评测集: {len(cases)} cases\n")

    results = []
    for i, case in enumerate(cases):
        try:
            result, latency = call_claude(case["message"])
        except Exception as e:
            result = {"error": str(e)}
            latency = 0
            traceback.print_exc()

        entry = {
            "id": case["id"],
            "scenario": case["scenario"],
            "case_type": case["case_type"],
            "message": case["message"],
            "expected_harvest": case["expected_harvest"],
            "expected_intent": case.get("expected_intent", ""),
            "result": result,
            "latency_ms": latency
        }
        results.append(entry)

        actual_h = result.get("should_harvest")
        if isinstance(actual_h, str):
            actual_h = actual_h.lower() == "true"
        status = "✅" if actual_h == case["expected_harvest"] else "❌" if "error" not in result else "⚠️"
        print(f"  [{i+1}/{len(cases)}] {status} id={case['id']} {case['scenario']}/{case['case_type']} → {result.get('intent_type', 'ERR')} ({latency:.0f}ms)")

        if i < len(cases) - 1:
            time.sleep(0.3)  # rate limit

    # Save Claude results
    with open(RESULTS_DIR / "claude-opus-results.json", "w") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    metrics = compute_metrics(results)
    metrics["cost_cny"] = estimate_cost("claude-opus", metrics)
    per_scenario = compute_per_scenario(results)

    print(f"\n  准确率(harvest): {metrics['harvest_accuracy']:.1%}")
    print(f"  准确率(intent):  {metrics['intent_accuracy']:.1%}")
    print(f"  Precision: {metrics['precision']:.3f}  Recall: {metrics['recall']:.3f}  F1: {metrics['f1']:.3f}")
    print(f"  平均延迟: {metrics['avg_latency_ms']:.0f}ms  P95: {metrics['p95_latency_ms']:.0f}ms")
    print(f"  成本: ¥{metrics['cost_cny']:.4f}")

    # Load existing GLM results and merge
    all_metrics = {}
    all_results_map = {}

    for model_name in ["glm-4-flash", "glm-4-plus"]:
        rfile = RESULTS_DIR / f"{model_name}-results.json"
        if rfile.exists():
            with open(rfile) as f:
                mresults = json.load(f)
            m = compute_metrics(mresults)
            m["cost_cny"] = estimate_cost(model_name, m)
            m["per_scenario"] = compute_per_scenario(mresults)
            all_metrics[model_name] = m
            all_results_map[model_name] = mresults

    all_metrics["claude-opus"] = {**metrics, "per_scenario": per_scenario}
    all_results_map["claude-opus"] = results

    # Save combined summary
    with open(RESULTS_DIR / "comparison-summary.json", "w") as f:
        json.dump(all_metrics, f, ensure_ascii=False, indent=2)

    # Regenerate report with all 3 models
    generate_report(all_metrics, all_results_map, cases)

    print(f"\n{'='*60}")
    print(f" 评测完成! 三模型报告: {REPORT_PATH}")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
