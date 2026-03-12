#!/usr/bin/env bash
# ============================================================
# Badcase自动翻转工具脚本
# 由PDCA check-loop调用，不独立cron
# 扫描badcase产出 → 翻转为evalset格式 → 入库到evals/unified/
# ============================================================
set -euo pipefail

WORKSPACE="/root/.openclaw/workspace"
UNIFIED_DIR="$WORKSPACE/evals/unified"
VERSION_FILE="$WORKSPACE/skills/isc-core/config/eval-standard-version.json"

mkdir -p "$UNIFIED_DIR"

# 动态读取评测标准版本
EVAL_VERSION=$(python3 -c "import json; print(json.load(open('$VERSION_FILE'))['version'])")

python3 << PYEOF
import json, glob, os, hashlib
from datetime import datetime

workspace = "$WORKSPACE"
unified_dir = "$UNIFIED_DIR"
eval_version = "$EVAL_VERSION"

# 已入库case ID
existing_ids = set()
for f in glob.glob(f"{unified_dir}/*.json"):
    try:
        data = json.load(open(f))
        cases = data if isinstance(data, list) else data.get("cases", data.get("dataset", []))
        for c in cases:
            if isinstance(c, dict) and "id" in c:
                existing_ids.add(c["id"])
    except: pass

# 扫描badcase源
badcase_dirs = [
    f"{workspace}/skills/public/badcase-to-goodcase",
    f"{workspace}/skills/public/auto-badcase-harvest",
    f"{workspace}/tests/benchmarks/intent/c2-golden",
]

flipped = []
for bd in badcase_dirs:
    for f in glob.glob(f"{bd}/**/*.json", recursive=True):
        try:
            data = json.load(open(f))
            items = data if isinstance(data, list) else data.get("badcases", data.get("cases", []))
            if not isinstance(items, list): continue
            for item in items:
                if not isinstance(item, dict): continue
                if item.get("type") != "badcase" and "badcase" not in f.lower(): continue
                bc_id = item.get("id", hashlib.md5(json.dumps(item, sort_keys=True).encode()).hexdigest()[:8])
                gc_id = f"FLIP-{bc_id}"
                if gc_id in existing_ids: continue
                flipped.append({
                    "id": gc_id,
                    "input": item.get("input", item.get("query", "")),
                    "expected_output": item.get("corrected_output", item.get("expected_output", item.get("good_response", ""))),
                    "category": item.get("category", "badcase-flip"),
                    "source": "badcase-flip",
                    "original_badcase_id": bc_id,
                    "north_star_indicator": item.get("north_star_indicator", "任务完成率"),
                    "difficulty": item.get("difficulty", "C2"),
                    "scoring_rubric": f"基于{eval_version}标准评分",
                    "gate": item.get("gate", "intent_accuracy"),
                    "tags": item.get("tags", ["badcase-flip"]),
                })
                existing_ids.add(gc_id)
        except: pass

if flipped:
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    outfile = f"{unified_dir}/badcase-flipped-{ts}.json"
    json.dump({"schema_version": eval_version, "source": "badcase-auto-flip", "flipped_at": datetime.now().isoformat(), "cases": flipped}, open(outfile, "w"), ensure_ascii=False, indent=2)
    print(json.dumps({"flipped": len(flipped), "output": outfile}))
else:
    print(json.dumps({"flipped": 0}))
PYEOF
