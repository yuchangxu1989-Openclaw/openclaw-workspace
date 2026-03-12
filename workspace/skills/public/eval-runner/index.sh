#!/bin/bash
# eval-runner v2: V4评测流水线入口
# 用法: bash index.sh <case_file> [batch_size] [track]
# track: legacy | gate | northstar | full (默认full)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CASE_FILE="${1:?用法: bash index.sh <case_file> [batch_size] [track]}"
BATCH_SIZE="${2:-10}"
TRACK="${3:-full}"
TIMESTAMP="$(date +%s)"
RESULTS_DIR="${SCRIPT_DIR}/results"
mkdir -p "$RESULTS_DIR"
RESULTS_FILE="${RESULTS_DIR}/eval-results-${TIMESTAMP}.json"
REPORT_FILE="${RESULTS_DIR}/eval-report-${TIMESTAMP}.md"
TMPDIR_EVAL=$(mktemp -d)
trap 'rm -rf "$TMPDIR_EVAL"' EXIT

# 验证输入文件
if [ ! -f "$CASE_FILE" ]; then
  echo "ERROR: 文件不存在: $CASE_FILE" >&2
  exit 1
fi

# 获取case总数（支持数组和{samples:[]}两种格式）
TOTAL=$(python3 -c "
import json, sys
data = json.load(open(sys.argv[1]))
if isinstance(data, list):
    print(len(data))
elif isinstance(data, dict) and 'samples' in data:
    print(len(data['samples']))
else:
    print(0)
" "$CASE_FILE")

if [ "$TOTAL" -eq 0 ]; then
  echo "ERROR: 评测集为空或格式不支持" >&2
  exit 1
fi

echo "📋 评测集: $CASE_FILE ($TOTAL 条case, batch=$BATCH_SIZE, track=$TRACK)"

# 初始化结果
echo "[]" > "$RESULTS_FILE"

# ====== Gate Track ======
run_gate_track() {
  echo ""
  echo "🚪 === Gate Track (串行短路) ==="
  local gate_result
  gate_result=$(node "$SCRIPT_DIR/scripts/eval-gate-track.js" "$CASE_FILE" 2>&1) || {
    echo "  ❌ Gate Track 执行异常"
    echo "$gate_result"
    return 1
  }
  echo "$gate_result" > "$TMPDIR_EVAL/gate-result.json"

  local all_passed
  all_passed=$(echo "$gate_result" | python3 -c "import json,sys; print(json.load(sys.stdin).get('all_passed', False))")
  if [ "$all_passed" = "True" ]; then
    echo "  ✅ Gate Track 全部通过"
    return 0
  else
    local terminated_at
    terminated_at=$(echo "$gate_result" | python3 -c "import json,sys; print(json.load(sys.stdin).get('terminated_at','unknown'))")
    echo "  ❌ Gate Track 短路终止于: $terminated_at"
    return 1
  fi
}

# ====== 单条评测（修复引号问题：用临时文件传递JSON） ======
run_single_case() {
  local idx="$1"
  local case_tmpfile="$TMPDIR_EVAL/case-${idx}.json"

  # 用python提取单条case写入临时文件（避免shell引号问题）
  python3 -c "
import json, sys
data = json.load(open(sys.argv[1]))
cases = data if isinstance(data, list) else data.get('samples', [])
json.dump(cases[int(sys.argv[2])], open(sys.argv[3], 'w'), ensure_ascii=False)
" "$CASE_FILE" "$idx" "$case_tmpfile"

  # 用文件路径传递，不经过shell变量展开
  node "$SCRIPT_DIR/scripts/eval-single-case.js" "$(cat "$case_tmpfile")" 2>&1
}

# ====== 主流程 ======
PASS=0; PARTIAL=0; BADCASE=0; PROCESSED=0; GATE_PASSED="skip"

# Gate Track（full或gate模式执行）
if [ "$TRACK" = "full" ] || [ "$TRACK" = "gate" ]; then
  if run_gate_track; then
    GATE_PASSED="true"
  else
    GATE_PASSED="false"
    if [ "$TRACK" = "full" ]; then
      echo ""
      echo "⛔ Gate未通过，跳过北极星评测，最终评级: F"
      # 生成F评级报告
      cat > "$REPORT_FILE" <<EOF
# 评测报告 — $(date '+%Y-%m-%d %H:%M:%S')

## 概览
- **评测集**: $CASE_FILE
- **Track**: $TRACK
- **Gate结果**: ❌ 未通过
- **最终评级**: F

## Gate详情
$(cat "$TMPDIR_EVAL/gate-result.json" 2>/dev/null || echo "无")
EOF
      echo "✅ 报告: $REPORT_FILE"
      exit 0
    fi
  fi
fi

# 北极星/Legacy评测（full或northstar或legacy模式）
if [ "$TRACK" != "gate" ]; then
  echo ""
  echo "⭐ === 评测执行 (track=$TRACK) ==="
  for ((i=0; i<TOTAL; i++)); do
    echo "  ▶ [$((i+1))/$TOTAL] 评测中..."

    RESULT=$(run_single_case "$i") || {
      echo "  ⚠ case $((i+1)) 评测异常，跳过"
      continue
    }

    # 用python安全追加结果（避免引号问题）
    local_result_file="$TMPDIR_EVAL/result-${i}.json"
    echo "$RESULT" > "$local_result_file"
    python3 -c "
import json, sys
results = json.load(open(sys.argv[1]))
result = json.load(open(sys.argv[2]))
results.append(result)
json.dump(results, open(sys.argv[1], 'w'), ensure_ascii=False, indent=2)
" "$RESULTS_FILE" "$local_result_file"

    # 统计verdict
    VERDICT=$(python3 -c "import json; print(json.load(open('$local_result_file')).get('verdict','unknown'))")
    case "$VERDICT" in
      Pass) ((PASS++)) || true ;;
      Partial) ((PARTIAL++)) || true ;;
      Badcase|*) ((BADCASE++)) || true ;;
    esac
    ((PROCESSED++)) || true

    if (( (i+1) % BATCH_SIZE == 0 )); then
      echo "  📊 已完成 $((i+1))/$TOTAL (Pass=$PASS Partial=$PARTIAL Badcase=$BADCASE)"
    fi
  done
fi

# ====== 计算最终评级 ======
if [ "$PROCESSED" -gt 0 ]; then
  PASS_RATE=$((PASS*100/PROCESSED))
else
  PASS_RATE=0
fi

FINAL_RATING="F"
if [ "$GATE_PASSED" != "false" ]; then
  if [ "$PASS_RATE" -ge 90 ]; then FINAL_RATING="S"
  elif [ "$PASS_RATE" -ge 70 ]; then FINAL_RATING="A"
  elif [ "$PASS_RATE" -ge 50 ]; then FINAL_RATING="B"
  elif [ "$PASS_RATE" -ge 20 ]; then FINAL_RATING="C"
  fi
fi

# ====== 生成报告 ======
cat > "$REPORT_FILE" <<EOF
# 评测报告 — $(date '+%Y-%m-%d %H:%M:%S')

## 概览
- **评测集**: $CASE_FILE
- **Track**: $TRACK
- **总条数**: $TOTAL
- **已评测**: $PROCESSED
- **Pass**: $PASS (${PASS_RATE}%)
- **Partial**: $PARTIAL
- **Badcase**: $BADCASE
- **Gate通过**: $GATE_PASSED
- **最终评级**: $FINAL_RATING

## 评测标准
$(python3 -c "
import json
try:
    cfg = json.load(open('$SCRIPT_DIR/../../../isc-core/config/eval-standard-version.json'))
    print(f'版本: {cfg.get(\"version\",\"?\")}, 更新: {cfg.get(\"updated_at\",\"?\")}')
except: print('版本: 未知')
")

## 详细结果
见 \`$(basename "$RESULTS_FILE")\`
EOF

echo ""
echo "✅ 评测完成!"
echo "  结果: $RESULTS_FILE"
echo "  报告: $REPORT_FILE"
echo "  Pass=$PASS | Partial=$PARTIAL | Badcase=$BADCASE | 评级=$FINAL_RATING"
