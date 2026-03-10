#!/usr/bin/env bash
# refresh-evalset.sh - 根据最新V4标准检查评测集合规性
# 用法: bash scripts/refresh-evalset.sh
#
# 工作原理:
#   1. 读取最新V4标准（从缓存文件）
#   2. 读取黄金case作为质量参照
#   3. 扫描 tests/benchmarks/intent/c2-golden/*.json
#   4. 对每个文件检查是否符合最新V4口径
#   5. 输出不合格case列表

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(cd "$SKILL_DIR/../../.." && pwd)"

V4_CACHE_FILE="$SKILL_DIR/.v4-standard-cache.md"
GOLDEN_REF="$REPO_ROOT/tests/benchmarks/intent/c2-golden/00-real-badcases.json"
EVAL_DIR="$REPO_ROOT/tests/benchmarks/intent/c2-golden"
REPORT_FILE="$SKILL_DIR/.refresh-report.json"

echo "=== 评测集合规刷新 ==="

# 检查V4标准缓存
if [ ! -f "$V4_CACHE_FILE" ]; then
  echo "ERROR: V4标准缓存不存在，请先运行 sync-v4-standard.sh"
  exit 1
fi

echo "V4标准: $V4_CACHE_FILE"
echo "黄金参照: $GOLDEN_REF"
echo "扫描目录: $EVAL_DIR"
echo ""

# 检查黄金参照是否存在
if [ ! -f "$GOLDEN_REF" ]; then
  echo "WARNING: 黄金case参照文件不存在: $GOLDEN_REF"
fi

# 扫描评测集文件
EVAL_FILES=$(find "$EVAL_DIR" -name "*.json" -type f 2>/dev/null | sort)
if [ -z "$EVAL_FILES" ]; then
  echo "WARNING: 未找到评测集文件"
  exit 0
fi

FILE_COUNT=$(echo "$EVAL_FILES" | wc -l)
echo "发现 $FILE_COUNT 个评测文件"
echo ""

# 检查每个文件的基本合规性
NON_COMPLIANT=()
COMPLIANT=0
ERRORS=0

for f in $EVAL_FILES; do
  BASENAME=$(basename "$f")
  
  # 基本JSON格式检查
  if ! jq empty "$f" 2>/dev/null; then
    echo "❌ $BASENAME - JSON格式错误"
    NON_COMPLIANT+=("$BASENAME:json_invalid")
    ((ERRORS++))
    continue
  fi
  
  # 检查是否为数组
  IS_ARRAY=$(jq 'type == "array"' "$f" 2>/dev/null || echo "false")
  if [ "$IS_ARRAY" != "true" ]; then
    echo "❌ $BASENAME - 非JSON数组格式"
    NON_COMPLIANT+=("$BASENAME:not_array")
    ((ERRORS++))
    continue
  fi
  
  # 检查必要字段（V4标准要求: input, expected_intent）
  MISSING_FIELDS=$(jq '[.[] | select(.input == null or .expected_intent == null)] | length' "$f" 2>/dev/null || echo "-1")
  TOTAL=$(jq 'length' "$f" 2>/dev/null || echo "0")
  
  if [ "$MISSING_FIELDS" != "0" ]; then
    echo "⚠️  $BASENAME - $MISSING_FIELDS/$TOTAL 条缺少必要字段 (input/expected_intent)"
    NON_COMPLIANT+=("$BASENAME:missing_fields:$MISSING_FIELDS/$TOTAL")
    ((ERRORS++))
  else
    echo "✅ $BASENAME - $TOTAL 条，结构合规"
    ((COMPLIANT++))
  fi
done

echo ""
echo "=== 检查结果 ==="
echo "合规文件: $COMPLIANT"
echo "不合规文件: $ERRORS"

# 写报告
cat > "$REPORT_FILE" <<EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "total_files": $FILE_COUNT,
  "compliant": $COMPLIANT,
  "non_compliant": $ERRORS,
  "issues": [
$(printf '    "%s"' "${NON_COMPLIANT[@]:-}" | paste -sd ',' -)
  ],
  "note": "深层语义合规检查需由Agent读取V4标准后逐条比对，此脚本仅做结构检查"
}
EOF
echo ""
echo "报告已写入: $REPORT_FILE"

if [ $ERRORS -gt 0 ]; then
  echo ""
  echo "⚠️  发现不合格文件，建议Agent读取V4标准后对这些文件逐条审查语义合规性"
  exit 1
fi
