#!/usr/bin/env python3
"""
意图探针 v2 多模型横向评测 (Benchmark Runner)
================================================
对比 GLM-4-flash / GLM-4-plus / Claude Opus 4.6
输出: 准确率、召回率、F1、平均延迟、成本估算
"""

import json, os, sys, time, re, traceback
from datetime import datetime
from pathlib import Path
import urllib.request, urllib.error

# ============================================================
# Config
# ============================================================

EVAL_SET = Path("/root/.openclaw/workspace/tests/benchmarks/intent/intent-probe-regression-100.json")
REPORT_PATH = Path("/root/.openclaw/workspace/reports/intent-probe-v2-model-comparison.md")
RESULTS_DIR = Path("/root/.openclaw/workspace/tests/benchmarks/intent/results")
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

# API credentials
ZHIPU_KEY = ""
CLAUDE_BASE = ""
CLAUDE_KEY = ""

def load_keys():
    global ZHIPU_KEY, CLAUDE_BASE, CLAUDE_KEY
    # Zhipu
    env_file = "/root/.openclaw/.secrets/zhipu-keys.env"
    if os.path.exists(env_file):
        with open(env_file) as f:
            for line in f:
                line = line.strip()
                if line.startswith("ZHIPU_API_KEY_1="):
                    ZHIPU_KEY = line.split("=", 1)[1].strip('"').strip("'")

    # Claude - from openclaw.json
    config_file = "/root/.openclaw/openclaw.json"
    if os.path.exists(config_file):
        with open(config_file) as f:
            cfg = json.load(f)
        providers = cfg.get("providers", {})
        # Use claude-researcher (less loaded than claude-main/coder)
        for key in ["claude-researcher", "claude-main", "claude-coder"]:
            if key in providers:
                CLAUDE_BASE = providers[key].get("baseUrl", "").rstrip("/")
                CLAUDE_KEY = providers[key].get("apiKey", "")
                break

load_keys()

# System prompt - identical for all models
SYSTEM_PROMPT = """你是意图分类器。对用户消息分类为以下类型之一：
1. correction - 纠偏/指出错误（如：有误、不对、错了、又犯了、搞反了、这里写错了、理解错了）
2. negation - 否定/拒绝（如：不要、别、不是这样、取消、停、拒绝）
3. repeated_failure - 反复未果/同一问题多次未解决（如：又出问题了、第N次了、怎么还是、又来了、反反复复）
4. autonomy_lack - 自主性缺失指出/该自己发现却没发现（如：不应该我来提醒、为什么要我说、你自己应该注意到）
5. teaching - 教学/传授/传达规则（如：本质上是、你要明白、规则是、记住、铁律、正确做法是）
6. root_cause_request - 要求根因分析（如：为什么、根因是什么、根本原因、怎么回事）
7. quality_issue - 交付质量问题/半成品/格式错误（如：格式有误、不完整、残留、半成品、模板没填、乱码）
8. normal - 正常指令/问题/闲聊

分类原则：
- 若消息含纠偏、否定、反复未果、自主性缺失、教学、质量问题等信号，should_harvest=true
- root_cause_request 仅在纯粹追问根因时使用，should_harvest=false
- normal 为无特殊信号的普通消息，should_harvest=false
- confidence: high(明确信号)/medium(隐含信号)/low(不确定)

只输出纯JSON（不要markdown代码块）：{"intent_type":"xxx","confidence":"high/medium/low","should_harvest":true/false,"harvest_category":"纠偏类/否定类/自主性缺失类/教学类/交付质量类/空"}"""

# ============================================================
# Model callers
# ============================================================

def call_zhipu(model: str, message: str) -> tuple[dict, float]:
    """Call Zhipu API, return (parsed_result, latency_ms)"""
    url = "https://open.bigmodel.cn/api/paas/v4/chat/completions"
    payload = json.dumps({
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": message}
        ],
        "temperature": 0.1,
        "max_tokens": 150
    }, ensure_ascii=False).encode("utf-8")

    req = urllib.request.Request(url, data=payload, headers={
        "Authorization": f"Bearer {ZHIPU_KEY}",
        "Content-Type": "application/json"
    })

    t0 = time.monotonic()
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = json.loads(resp.read())
    except Exception as e:
        return {"error": str(e)}, (time.monotonic() - t0) * 1000
    latency = (time.monotonic() - t0) * 1000

    content = body.get("choices", [{}])[0].get("message", {}).get("content", "")
    usage = body.get("usage", {})
    return parse_llm_output(content, usage), latency


def call_claude(message: str) -> tuple[dict, float]:
    """Call Claude Opus via Anthropic Messages API"""
    url = f"{CLAUDE_BASE}/v1/messages"
    payload = json.dumps({
        "model": "claude-opus-4-6",
        "max_tokens": 200,
        "temperature": 0.1,
        "system": SYSTEM_PROMPT,
        "messages": [
            {"role": "user", "content": message}
        ]
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


def parse_llm_output(content: str, usage: dict = None) -> dict:
    """Parse LLM output to structured result"""
    # Strip markdown code fences
    content = re.sub(r'^```(?:json)?\s*', '', content.strip())
    content = re.sub(r'\s*```$', '', content.strip())
    content = content.strip()

    try:
        result = json.loads(content)
        result["_raw"] = content
        if usage:
            result["_usage"] = usage
        return result
    except json.JSONDecodeError:
        # Try to extract JSON from text
        m = re.search(r'\{[^{}]+\}', content)
        if m:
            try:
                result = json.loads(m.group())
                result["_raw"] = content
                if usage:
                    result["_usage"] = usage
                return result
            except:
                pass
        return {"error": f"parse_failed: {content[:200]}", "_raw": content, "_usage": usage or {}}


# ============================================================
# Metrics
# ============================================================

def compute_metrics(results: list[dict]) -> dict:
    """Compute accuracy, precision, recall, F1 for harvest classification"""
    total = len(results)
    correct_harvest = 0
    correct_intent = 0
    tp = fp = fn = tn = 0
    errors = 0
    latencies = []
    total_prompt_tokens = 0
    total_completion_tokens = 0

    for r in results:
        if "error" in r.get("result", {}):
            errors += 1
            continue

        expected_h = r["expected_harvest"]
        actual_h = r["result"].get("should_harvest", None)
        # Normalize
        if isinstance(actual_h, str):
            actual_h = actual_h.lower() == "true"

        if actual_h == expected_h:
            correct_harvest += 1

        if expected_h and actual_h:
            tp += 1
        elif not expected_h and actual_h:
            fp += 1
        elif expected_h and not actual_h:
            fn += 1
        else:
            tn += 1

        # Intent match (flexible - correction/repeated_failure/quality_issue all count for harvest=true scenarios)
        expected_i = r.get("expected_intent", "")
        actual_i = r["result"].get("intent_type", "")
        if expected_i == actual_i:
            correct_intent += 1

        latencies.append(r.get("latency_ms", 0))
        usage = r["result"].get("_usage", {})
        total_prompt_tokens += usage.get("prompt_tokens", usage.get("input_tokens", 0))
        total_completion_tokens += usage.get("completion_tokens", usage.get("output_tokens", 0))

    valid = total - errors
    accuracy = correct_harvest / valid if valid else 0
    intent_accuracy = correct_intent / valid if valid else 0
    precision = tp / (tp + fp) if (tp + fp) else 0
    recall = tp / (tp + fn) if (tp + fn) else 0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0
    avg_latency = sum(latencies) / len(latencies) if latencies else 0

    return {
        "total": total,
        "valid": valid,
        "errors": errors,
        "harvest_accuracy": round(accuracy, 4),
        "intent_accuracy": round(intent_accuracy, 4),
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
        "tp": tp, "fp": fp, "fn": fn, "tn": tn,
        "avg_latency_ms": round(avg_latency, 1),
        "p50_latency_ms": round(sorted(latencies)[len(latencies)//2], 1) if latencies else 0,
        "p95_latency_ms": round(sorted(latencies)[int(len(latencies)*0.95)], 1) if latencies else 0,
        "total_prompt_tokens": total_prompt_tokens,
        "total_completion_tokens": total_completion_tokens,
    }


def compute_per_scenario(results: list[dict]) -> dict:
    """Per-scenario breakdown"""
    by_scenario = {}
    for r in results:
        s = r["scenario"]
        if s not in by_scenario:
            by_scenario[s] = []
        by_scenario[s].append(r)
    return {s: compute_metrics(cases) for s, cases in by_scenario.items()}


# ============================================================
# Cost estimation
# ============================================================

COST_PER_1K = {
    "glm-4-flash":  {"input": 0.0001, "output": 0.0001},  # CNY
    "glm-4-plus":   {"input": 0.05,   "output": 0.05},
    "claude-opus":  {"input": 0.105,  "output": 0.525},    # USD → CNY ~7.2
}

def estimate_cost(model_key: str, metrics: dict) -> float:
    """Estimate cost in CNY"""
    rates = COST_PER_1K.get(model_key, {"input": 0, "output": 0})
    cost = (metrics["total_prompt_tokens"] / 1000 * rates["input"] +
            metrics["total_completion_tokens"] / 1000 * rates["output"])
    if model_key == "claude-opus":
        cost *= 7.2  # USD to CNY
    return round(cost, 4)


# ============================================================
# Runner
# ============================================================

def run_model(model_name: str, caller, cases: list[dict], progress_prefix: str = "") -> list[dict]:
    """Run all cases through a model"""
    results = []
    total = len(cases)
    for i, case in enumerate(cases):
        msg = case["message"]
        try:
            result, latency = caller(msg)
        except Exception as e:
            result = {"error": str(e)}
            latency = 0
            traceback.print_exc()

        results.append({
            "id": case["id"],
            "scenario": case["scenario"],
            "case_type": case["case_type"],
            "message": msg,
            "expected_harvest": case["expected_harvest"],
            "expected_intent": case.get("expected_intent", ""),
            "result": result,
            "latency_ms": latency
        })

        status = "✅" if result.get("should_harvest") == case["expected_harvest"] else "❌" if "error" not in result else "⚠️"
        print(f"  {progress_prefix}[{i+1}/{total}] {status} id={case['id']} {case['scenario']}/{case['case_type']} → {result.get('intent_type', 'ERR')} ({latency:.0f}ms)")

        # Rate limit: small delay between calls
        if i < total - 1:
            time.sleep(0.15)

    return results


def main():
    print("=" * 70)
    print(" 意图探针 v2 多模型横向评测")
    print(f" 时间: {datetime.now().isoformat()}")
    print("=" * 70)

    # Load eval set
    with open(EVAL_SET) as f:
        data = json.load(f)
    cases = data["cases"]
    print(f"\n评测集: {len(cases)} cases, {data['meta']['scenarios']} scenarios\n")

    # Define models
    models = {}

    if ZHIPU_KEY:
        models["glm-4-flash"] = lambda msg: call_zhipu("glm-4-flash", msg)
        models["glm-4-plus"] = lambda msg: call_zhipu("glm-4-plus", msg)
    else:
        print("⚠️  ZHIPU_API_KEY not found, skipping GLM models")

    if CLAUDE_KEY and CLAUDE_BASE:
        models["claude-opus"] = call_claude
    else:
        print("⚠️  Claude config not found, skipping Claude")

    if not models:
        print("❌ No models available!")
        sys.exit(1)

    all_metrics = {}
    all_results = {}

    for model_name, caller in models.items():
        print(f"\n{'='*60}")
        print(f" 模型: {model_name}")
        print(f"{'='*60}")

        results = run_model(model_name, caller, cases, f"{model_name}: ")

        # Save raw results
        result_file = RESULTS_DIR / f"{model_name}-results.json"
        with open(result_file, "w") as f:
            json.dump(results, f, ensure_ascii=False, indent=2)

        # Compute metrics
        metrics = compute_metrics(results)
        metrics["cost_cny"] = estimate_cost(model_name, metrics)
        per_scenario = compute_per_scenario(results)

        all_metrics[model_name] = {**metrics, "per_scenario": per_scenario}
        all_results[model_name] = results

        print(f"\n  准确率(harvest): {metrics['harvest_accuracy']:.1%}")
        print(f"  准确率(intent):  {metrics['intent_accuracy']:.1%}")
        print(f"  Precision: {metrics['precision']:.3f}  Recall: {metrics['recall']:.3f}  F1: {metrics['f1']:.3f}")
        print(f"  平均延迟: {metrics['avg_latency_ms']:.0f}ms  P95: {metrics['p95_latency_ms']:.0f}ms")
        print(f"  成本: ¥{metrics['cost_cny']:.4f}")

    # Save summary
    summary_file = RESULTS_DIR / "comparison-summary.json"
    with open(summary_file, "w") as f:
        json.dump(all_metrics, f, ensure_ascii=False, indent=2)

    # Generate report
    generate_report(all_metrics, all_results, cases)

    print(f"\n{'='*70}")
    print(f" 评测完成! 报告: {REPORT_PATH}")
    print(f"{'='*70}")


# ============================================================
# Report generator
# ============================================================

def generate_report(all_metrics: dict, all_results: dict, cases: list):
    lines = []
    lines.append("# 意图探针 v2 多模型横向评测报告")
    lines.append("")
    lines.append(f"**生成时间**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append(f"**评测集**: {len(cases)} cases, 覆盖8种ISC场景")
    lines.append(f"**模型数**: {len(all_metrics)}")
    lines.append("")

    # === Overview comparison table ===
    lines.append("## 1. 总览对比矩阵")
    lines.append("")
    lines.append("| 指标 | " + " | ".join(all_metrics.keys()) + " |")
    lines.append("| --- | " + " | ".join(["---"] * len(all_metrics)) + " |")

    rows = [
        ("Harvest准确率", lambda m: f"{m['harvest_accuracy']:.1%}"),
        ("Intent准确率", lambda m: f"{m['intent_accuracy']:.1%}"),
        ("Precision", lambda m: f"{m['precision']:.3f}"),
        ("Recall", lambda m: f"{m['recall']:.3f}"),
        ("F1", lambda m: f"{m['f1']:.3f}"),
        ("TP/FP/FN/TN", lambda m: f"{m['tp']}/{m['fp']}/{m['fn']}/{m['tn']}"),
        ("平均延迟", lambda m: f"{m['avg_latency_ms']:.0f}ms"),
        ("P50延迟", lambda m: f"{m['p50_latency_ms']:.0f}ms"),
        ("P95延迟", lambda m: f"{m['p95_latency_ms']:.0f}ms"),
        ("Prompt Tokens", lambda m: f"{m['total_prompt_tokens']}"),
        ("Completion Tokens", lambda m: f"{m['total_completion_tokens']}"),
        ("估算成本(CNY)", lambda m: f"¥{m['cost_cny']:.4f}"),
        ("错误数", lambda m: f"{m['errors']}"),
    ]

    for label, fn in rows:
        vals = " | ".join(fn(all_metrics[m]) for m in all_metrics)
        lines.append(f"| {label} | {vals} |")
    lines.append("")

    # === Per-scenario breakdown ===
    lines.append("## 2. 分场景对比")
    lines.append("")

    scenarios = ["correction", "repeated_failure", "head_treat_head", "seesaw",
                 "autonomy_lack", "global_misalign", "quality_issue", "cognitive_error",
                 "negation", "teaching", "root_cause_request"]

    scenario_names = {
        "correction": "纠偏类",
        "repeated_failure": "反复未果类",
        "head_treat_head": "头痛医头类",
        "seesaw": "连锁跷跷板类",
        "autonomy_lack": "自主性缺失类",
        "global_misalign": "全局未对齐类",
        "quality_issue": "交付质量类",
        "cognitive_error": "认知错误类",
        "negation": "否定类",
        "teaching": "教学类",
        "root_cause_request": "根因请求类",
    }

    lines.append("| 场景 | " + " | ".join(f"{m} (Acc/F1)" for m in all_metrics) + " |")
    lines.append("| --- | " + " | ".join(["---"] * len(all_metrics)) + " |")

    for sc in scenarios:
        name = scenario_names.get(sc, sc)
        vals = []
        for model in all_metrics:
            ps = all_metrics[model].get("per_scenario", {}).get(sc, {})
            if ps:
                vals.append(f"{ps.get('harvest_accuracy', 0):.0%} / {ps.get('f1', 0):.2f}")
            else:
                vals.append("N/A")
        lines.append(f"| {name} | " + " | ".join(vals) + " |")
    lines.append("")

    # === Error analysis ===
    lines.append("## 3. 失败Case分析")
    lines.append("")

    for model in all_results:
        failures = [r for r in all_results[model]
                    if "error" not in r.get("result", {})
                    and r["result"].get("should_harvest") != r["expected_harvest"]]
        lines.append(f"### {model} ({len(failures)} failures)")
        lines.append("")
        if not failures:
            lines.append("✅ 全部通过")
        else:
            lines.append("| ID | 场景 | 类型 | 消息 | 期望 | 实际 | 分类 |")
            lines.append("| --- | --- | --- | --- | --- | --- | --- |")
            for f in failures[:30]:  # cap at 30
                actual_h = f["result"].get("should_harvest", "?")
                actual_i = f["result"].get("intent_type", "?")
                msg = f["message"][:30] + "..." if len(f["message"]) > 30 else f["message"]
                lines.append(f"| {f['id']} | {f['scenario']} | {f['case_type']} | {msg} | {f['expected_harvest']} | {actual_h} | {actual_i} |")
        lines.append("")

    # === V1→V2 comparison ===
    lines.append("## 4. V1→V2 升级对比")
    lines.append("")
    lines.append("| 维度 | V1 (关键词/正则) | V2 (LLM分类器) |")
    lines.append("| --- | --- | --- |")
    lines.append("| 分类引擎 | grep + 正则匹配 | LLM (GLM-4/Claude) |")
    lines.append("| 泛化能力 | ❌ 仅匹配固定词 | ✅ 语义理解，覆盖隐含意图 |")
    lines.append("| 场景覆盖 | 4类 (纠偏/否定/教学/追问) | 8类 (全部ISC场景) |")
    lines.append("| 准确率 | ~70% (边界case差) | 见上表 |")
    lines.append("| 延迟 | <1ms | 见上表 (100-2000ms) |")
    lines.append("| 成本 | ¥0 | 见上表 |")
    lines.append("| Fallback | N/A | 自动降级到V1关键词版 |")
    lines.append("")

    # === LLM调用方式 ===
    lines.append("## 5. LLM调用方式")
    lines.append("")
    lines.append("### 智谱GLM (glm-4-flash / glm-4-plus)")
    lines.append("```")
    lines.append("POST https://open.bigmodel.cn/api/paas/v4/chat/completions")
    lines.append("Authorization: Bearer $ZHIPU_API_KEY")
    lines.append("Model: glm-4-flash (低成本) / glm-4-plus (高精度)")
    lines.append("Temperature: 0.1")
    lines.append("```")
    lines.append("")
    lines.append("### Claude Opus 4.6")
    lines.append("```")
    lines.append("POST $CLAUDE_BASE/v1/messages")
    lines.append("x-api-key: $CLAUDE_KEY")
    lines.append("Model: claude-opus-4-6")
    lines.append("Temperature: 0.1")
    lines.append("```")
    lines.append("")

    # === Fallback ===
    lines.append("## 6. Fallback机制")
    lines.append("")
    lines.append("```")
    lines.append("用户消息")
    lines.append("  │")
    lines.append("  ├─ API Key存在? ─── 否 ──→ V1关键词Fallback")
    lines.append("  │       │")
    lines.append("  │      是")
    lines.append("  │       │")
    lines.append("  │  ┌────▼────┐")
    lines.append("  │  │ LLM调用  │")
    lines.append("  │  └────┬────┘")
    lines.append("  │       │")
    lines.append("  │  响应有效? ─── 否 ──→ V1关键词Fallback")
    lines.append("  │       │")
    lines.append("  │      是")
    lines.append("  │       │")
    lines.append("  │  JSON合法? ─── 否 ──→ V1关键词Fallback")
    lines.append("  │       │")
    lines.append("  │      是")
    lines.append("  │       ▼")
    lines.append("  └─→ V2 LLM结果输出")
    lines.append("```")
    lines.append("")

    # === Recommendation ===
    lines.append("## 7. 推荐")
    lines.append("")

    # Find best model
    if all_metrics:
        best_f1 = max(all_metrics.items(), key=lambda x: x[1].get("f1", 0))
        cheapest = min(all_metrics.items(), key=lambda x: x[1].get("cost_cny", 999))
        fastest = min(all_metrics.items(), key=lambda x: x[1].get("avg_latency_ms", 99999))

        lines.append(f"- **最高F1**: {best_f1[0]} (F1={best_f1[1]['f1']:.3f})")
        lines.append(f"- **最低成本**: {cheapest[0]} (¥{cheapest[1]['cost_cny']:.4f})")
        lines.append(f"- **最低延迟**: {fastest[0]} ({fastest[1]['avg_latency_ms']:.0f}ms)")
        lines.append("")
        lines.append("**生产建议**: 综合F1、延迟、成本三个维度选择最优模型作为默认引擎，其余作为备选fallback链。")

    lines.append("")

    with open(REPORT_PATH, "w") as f:
        f.write("\n".join(lines))

    print(f"\n📊 报告已写入: {REPORT_PATH}")


if __name__ == "__main__":
    main()
