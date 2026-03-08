#!/bin/bash
# eval-runner: 评测执行入口
# 用法: bash index.sh <case_file> [batch_size]
# case_file: 评测集JSON文件路径
# batch_size: 每批评测条数，默认10

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CASE_FILE="${1:?用法: bash index.sh <case_file> [batch_size]}"
BATCH_SIZE="${2:-10}"
TIMESTAMP="$(date +%s)"
RESULTS_FILE="${SCRIPT_DIR}/eval-results-${TIMESTAMP}.json"
REPORT_FILE="${SCRIPT_DIR}/eval-report-${TIMESTAMP}.md"

# 验证输入文件
if [ ! -f "$CASE_FILE" ]; then
  echo "ERROR: 文件不存在: $CASE_FILE" >&2
  exit 1
fi

# 获取case总数
TOTAL=$(python3 -c "import json; print(len(json.load(open('$CASE_FILE'))))")
echo "📋 评测集: $CASE_FILE ($TOTAL 条case, batch_size=$BATCH_SIZE)"

# 初始化结果数组
echo "[]" > "$RESULTS_FILE"

# 分批处理
PASS=0; PARTIAL=0; BADCASE=0; PROCESSED=0
for ((i=0; i<TOTAL; i++)); do
  CASE_JSON=$(python3 -c "
import json, sys
cases = json.load(open('$CASE_FILE'))
print(json.dumps(cases[$i], ensure_ascii=False))
")

  echo "  ▶ [$((i+1))/$TOTAL] 评测中..."

  # 调用单条评测脚本
  RESULT=$(node "$SCRIPT_DIR/scripts/eval-single-case.js" "$CASE_JSON" 2>&1) || {
    echo "  ⚠ case $((i+1)) 评测异常，跳过"
    continue
  }

  # 追加结果
  python3 -c "
import json
results = json.load(open('$RESULTS_FILE'))
results.append(json.loads('''$RESULT'''))
json.dump(results, open('$RESULTS_FILE', 'w'), ensure_ascii=False, indent=2)
"

  # 统计
  VERDICT=$(echo "$RESULT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('verdict','unknown'))")
  case "$VERDICT" in
    Pass) ((PASS++)) ;;
    Partial) ((PARTIAL++)) ;;
    Badcase) ((BADCASE++)) ;;
  esac
  ((PROCESSED++))

  # batch间隔日志
  if (( (i+1) % BATCH_SIZE == 0 )); then
    echo "  📊 已完成 $((i+1))/$TOTAL (Pass=$PASS Partial=$PARTIAL Badcase=$BADCASE)"
  fi
done

# 生成MD报告
cat > "$REPORT_FILE" <<EOF
# 评测报告 — $(date '+%Y-%m-%d %H:%M:%S')

## 概览
- **评测集**: $CASE_FILE
- **总条数**: $TOTAL
- **已评测**: $PROCESSED
- **Pass**: $PASS ($((PASS*100/(PROCESSED>0?PROCESSED:1)))%)
- **Partial**: $PARTIAL ($((PARTIAL*100/(PROCESSED>0?PROCESSED:1)))%)
- **Badcase**: $BADCASE ($((BADCASE*100/(PROCESSED>0?PROCESSED:1)))%)

## V3评测维度
1. 意图分类准确性
2. 执行链完整性
3. 跨模块协同
4. 隐含意图捕获
5. 上下文利用

## 详细结果
见 \`eval-results-${TIMESTAMP}.json\`
EOF

echo ""
echo "✅ 评测完成!"
echo "  结果: $RESULTS_FILE"
echo "  报告: $REPORT_FILE"
echo "  Pass=$PASS | Partial=$PARTIAL | Badcase=$BADCASE"
