#!/usr/bin/env bash
# ============================================================
# AEO评测集日常自动化流水线
# 功能：源数据巡检 → Badcase翻转 → 完整性校验
# 触发：cron每日执行
# ============================================================
set -euo pipefail

WORKSPACE="/root/.openclaw/workspace"
UNIFIED_DIR="$WORKSPACE/evals/unified"
REPORT_DIR="$WORKSPACE/reports/aeo-evalset-daily"
VERSION_FILE="$WORKSPACE/skills/isc-core/config/eval-standard-version.json"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
REPORT_FILE="$REPORT_DIR/report-${TIMESTAMP}.json"

mkdir -p "$UNIFIED_DIR" "$REPORT_DIR"

# 动态读取评测标准版本
EVAL_VERSION=$(python3 -c "import json; print(json.load(open('$VERSION_FILE'))['version'])")
echo "[aeo-sync] 评测标准版本: $EVAL_VERSION"

# ============================================================
# 阶段1：源数据巡检 - 扫描散落数据，归拢入库
# ============================================================
python3 << 'PYEOF'
import json, glob, os, hashlib, shutil, sys
from datetime import datetime

workspace = os.environ.get("WORKSPACE", "/root/.openclaw/workspace")
unified_dir = os.environ.get("UNIFIED_DIR", f"{workspace}/evals/unified")
report_file = os.environ.get("REPORT_FILE", "/tmp/aeo-report.json")
eval_version = os.environ.get("EVAL_VERSION", "V4")

# V4必需字段
V4_FIELDS = ["north_star_indicator"]
V4_OPTIONAL = ["scoring_rubric", "gate"]

report = {
    "timestamp": datetime.now().isoformat(),
    "eval_version": eval_version,
    "phase1_scan": {"sources_scanned": 0, "new_cases_found": 0, "cases_imported": 0, "sources": []},
    "phase2_badcase": {"badcases_found": 0, "flipped": 0, "errors": []},
    "phase3_integrity": {"total_cases": 0, "v4_coverage": {}, "north_star_distribution": {}, "gaps": []}
}

# --- 阶段1：扫描所有数据源 ---
scan_dirs = [
    ("golden-testset", f"{workspace}/infrastructure/aeo/golden-testset"),
    ("skills-evals", f"{workspace}/skills/*/evals"),
    ("evalset-cron-output", f"{workspace}/skills/aeo/evalset-cron-output"),
    ("evalset-refresh", f"{workspace}/skills/aeo/generated/evalset-refresh"),
    ("generated", f"{workspace}/skills/aeo/generated"),
]

# 已入库的case ID集合（用于去重）
existing_ids = set()
for f in glob.glob(f"{unified_dir}/*.json"):
    try:
        data = json.load(open(f))
        cases = data if isinstance(data, list) else data.get("cases", data.get("dataset", []))
        for c in cases:
            if isinstance(c, dict) and "id" in c:
                existing_ids.add(c["id"])
    except:
        pass

new_cases_all = []

for source_name, pattern in scan_dirs:
    files = glob.glob(f"{pattern}/*.json") if "*" not in pattern else glob.glob(pattern.replace("*", "**"), recursive=False)
    if "*" in pattern:
        # 展开通配符
        files = []
        base, wild = pattern.rsplit("*", 1)
        import pathlib
        for p in pathlib.Path(workspace).glob(pattern.replace(workspace+"/", "")):
            if p.suffix == ".json" and "evals" in str(p):
                files.append(str(p))
    else:
        files = glob.glob(f"{pattern}/*.json")

    report["phase1_scan"]["sources_scanned"] += len(files)
    source_new = 0

    for fpath in files:
        try:
            data = json.load(open(fpath))
            cases = data if isinstance(data, list) else data.get("cases", data.get("dataset", []))
            if not isinstance(cases, list):
                continue
            for c in cases:
                if not isinstance(c, dict):
                    continue
                cid = c.get("id", "")
                if not cid or cid in existing_ids:
                    continue
                existing_ids.add(cid)
                new_cases_all.append(c)
                source_new += 1
        except:
            pass

    if source_new > 0:
        report["phase1_scan"]["sources"].append({"name": source_name, "new_cases": source_new})

report["phase1_scan"]["new_cases_found"] = len(new_cases_all)

# 写入统一目录
if new_cases_all:
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    outfile = f"{unified_dir}/imported-{ts}.json"
    json.dump({
        "schema_version": eval_version,
        "imported_at": datetime.now().isoformat(),
        "cases": new_cases_all
    }, open(outfile, "w"), ensure_ascii=False, indent=2)
    report["phase1_scan"]["cases_imported"] = len(new_cases_all)
    print(f"[阶段1] 导入 {len(new_cases_all)} 条新case到 {outfile}")
else:
    print("[阶段1] 无新数据需要导入")

# --- 阶段2：Badcase自动翻转 ---
badcase_dirs = [
    f"{workspace}/skills/public/badcase-to-goodcase",
    f"{workspace}/skills/public/auto-badcase-harvest",
    f"{workspace}/tests/benchmarks/intent/c2-golden",
]

flipped_cases = []
for bd in badcase_dirs:
    for f in glob.glob(f"{bd}/**/*.json", recursive=True):
        try:
            data = json.load(open(f))
            items = data if isinstance(data, list) else data.get("badcases", data.get("cases", []))
            if not isinstance(items, list):
                continue
            for item in items:
                if not isinstance(item, dict):
                    continue
                # 只翻转标记为badcase的
                if item.get("type") != "badcase" and "badcase" not in f.lower():
                    continue
                report["phase2_badcase"]["badcases_found"] += 1
                bc_id = item.get("id", hashlib.md5(json.dumps(item, sort_keys=True).encode()).hexdigest()[:8])
                gc_id = f"FLIP-{bc_id}"
                if gc_id in existing_ids:
                    continue
                # 翻转：保留input，用corrected_output或expected_output
                flipped = {
                    "id": gc_id,
                    "input": item.get("input", item.get("query", "")),
                    "expected_output": item.get("corrected_output", item.get("expected_output", item.get("good_response", ""))),
                    "category": item.get("category", "badcase-flip"),
                    "source": "badcase-flip",
                    "original_badcase_id": bc_id,
                    "north_star_indicator": item.get("north_star_indicator", "任务完成率"),
                    "difficulty": item.get("difficulty", "C2"),
                    "tags": item.get("tags", ["badcase-flip"]),
                }
                # 补齐V4字段
                if "scoring_rubric" not in flipped:
                    flipped["scoring_rubric"] = f"基于{eval_version}标准评分"
                if "gate" not in flipped:
                    flipped["gate"] = item.get("gate", "intent_accuracy")
                flipped_cases.append(flipped)
                existing_ids.add(gc_id)
                report["phase2_badcase"]["flipped"] += 1
        except Exception as e:
            report["phase2_badcase"]["errors"].append(f"{f}: {str(e)}")

if flipped_cases:
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    outfile = f"{unified_dir}/badcase-flipped-{ts}.json"
    json.dump({
        "schema_version": eval_version,
        "source": "badcase-auto-flip",
        "flipped_at": datetime.now().isoformat(),
        "cases": flipped_cases
    }, open(outfile, "w"), ensure_ascii=False, indent=2)
    print(f"[阶段2] 翻转 {len(flipped_cases)} 条badcase")
else:
    print("[阶段2] 无新badcase需要翻转")

# --- 阶段3：完整性校验 ---
all_cases = []
for f in glob.glob(f"{unified_dir}/*.json"):
    try:
        data = json.load(open(f))
        cases = data if isinstance(data, list) else data.get("cases", data.get("dataset", []))
        if isinstance(cases, list):
            all_cases.extend([c for c in cases if isinstance(c, dict)])
    except:
        pass

# 也统计golden-testset
for f in glob.glob(f"{workspace}/infrastructure/aeo/golden-testset/*.json"):
    try:
        data = json.load(open(f))
        cases = data if isinstance(data, list) else data.get("cases", data.get("dataset", []))
        if isinstance(cases, list):
            all_cases.extend([c for c in cases if isinstance(c, dict)])
    except:
        pass

report["phase3_integrity"]["total_cases"] = len(all_cases)

# V4字段覆盖率
v4_check_fields = ["north_star_indicator", "scoring_rubric", "gate", "execution_chain_steps"]
for field in v4_check_fields:
    count = sum(1 for c in all_cases if c.get(field))
    pct = round(count / len(all_cases) * 100, 1) if all_cases else 0
    report["phase3_integrity"]["v4_coverage"][field] = {"count": count, "total": len(all_cases), "pct": pct}

# 北极星分布
ns_dist = {}
for c in all_cases:
    ns = c.get("north_star_indicator", "未标注")
    ns_dist[ns] = ns_dist.get(ns, 0) + 1
report["phase3_integrity"]["north_star_distribution"] = dict(sorted(ns_dist.items(), key=lambda x: -x[1]))

# 缺口检测
expected_ns = ["任务完成率", "意图识别准确率", "代码正确性", "知识准确性", "响应质量"]
for ns in expected_ns:
    if ns not in ns_dist or ns_dist[ns] < 10:
        report["phase3_integrity"]["gaps"].append({
            "north_star": ns,
            "current_count": ns_dist.get(ns, 0),
            "minimum_expected": 10,
            "status": "待补充"
        })

# 写报告
json.dump(report, open(report_file, "w"), ensure_ascii=False, indent=2)
print(f"\n[阶段3] 完整性校验完成")
print(f"  总case数: {len(all_cases)}")
for field, info in report["phase3_integrity"]["v4_coverage"].items():
    print(f"  {field}: {info['pct']}% ({info['count']}/{info['total']})")
print(f"  北极星类型数: {len(ns_dist)}")
if report["phase3_integrity"]["gaps"]:
    print(f"  ⚠️ 发现 {len(report['phase3_integrity']['gaps'])} 个覆盖缺口")
print(f"\n报告已写入: {report_file}")
PYEOF

echo "[aeo-sync] 流水线完成"
