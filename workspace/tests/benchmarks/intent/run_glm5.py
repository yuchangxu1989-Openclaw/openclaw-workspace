#!/usr/bin/env python3
"""Run GLM-5 intent probe benchmark on 128 cases."""

import json, os, sys, time, re, traceback
from datetime import datetime
from pathlib import Path
import urllib.request, urllib.error

EVAL_SET = Path("/root/.openclaw/workspace/tests/benchmarks/intent/intent-probe-regression-100.json")
RESULTS_DIR = Path("/root/.openclaw/workspace/tests/benchmarks/intent/results")
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

ZHIPU_KEY = ""
env_file = "/root/.openclaw/.secrets/zhipu-keys.env"
with open(env_file) as f:
    for line in f:
        line = line.strip()
        if line.startswith("ZHIPU_API_KEY_1="):
            ZHIPU_KEY = line.split("=", 1)[1].strip('"').strip("'")

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


def parse_llm_output(content, usage=None):
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


def call_glm5(message):
    url = "https://open.bigmodel.cn/api/paas/v4/chat/completions"
    payload = json.dumps({
        "model": "glm-5",
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": message}
        ],
        "temperature": 0.1,
        "max_tokens": 2048
    }, ensure_ascii=False).encode("utf-8")

    req = urllib.request.Request(url, data=payload, headers={
        "Authorization": f"Bearer {ZHIPU_KEY}",
        "Content-Type": "application/json"
    })

    t0 = time.monotonic()
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            body = json.loads(resp.read())
    except Exception as e:
        return {"error": str(e)}, (time.monotonic() - t0) * 1000
    latency = (time.monotonic() - t0) * 1000

    msg_obj = body.get("choices", [{}])[0].get("message", {})
    content = msg_obj.get("content", "")
    # GLM-5 is a reasoning model; if content is empty, try reasoning_content
    if not content and msg_obj.get("reasoning_content"):
        content = msg_obj.get("reasoning_content", "")
    usage = body.get("usage", {})
    return parse_llm_output(content, usage), latency


def main():
    with open(EVAL_SET) as f:
        data = json.load(f)
    cases = data["cases"]
    print(f"评测集: {len(cases)} cases")
    print(f"模型: glm-5")
    print(f"开始时间: {datetime.now().isoformat()}")
    print()

    results = []
    for i, case in enumerate(cases):
        msg = case["message"]
        try:
            result, latency = call_glm5(msg)
        except Exception as e:
            result = {"error": str(e)}
            latency = 0
            traceback.print_exc()

        entry = {
            "id": case["id"],
            "scenario": case["scenario"],
            "case_type": case["case_type"],
            "message": msg,
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
        print(f"[{i+1}/{len(cases)}] {status} id={case['id']} {case['scenario']}/{case['case_type']} → {result.get('intent_type', 'ERR')} h={actual_h} ({latency:.0f}ms)")

        if i < len(cases) - 1:
            time.sleep(0.15)

    # Save raw results
    result_file = RESULTS_DIR / "glm-5-results.json"
    with open(result_file, "w") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"\n结果已保存: {result_file}")
    print(f"结束时间: {datetime.now().isoformat()}")

if __name__ == "__main__":
    main()
