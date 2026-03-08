#!/usr/bin/env bash
# test-mining.sh — 验证挖掘产出
# 用法: bash test-mining.sh [output_dir]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG="$SCRIPT_DIR/../config.json"
OUTPUT_DIR="${1:-$(jq -r '.output_dir' "$CONFIG")}"

echo "=== 验证挖掘产出 ==="
echo "目录: $OUTPUT_DIR"
echo ""

total_files=0
passed=0
failed=0
empty=0
total_cases=0

for f in "$OUTPUT_DIR"/mined-*.json; do
  [ -f "$f" ] || continue
  total_files=$((total_files + 1))
  fname=$(basename "$f")
  
  # 检查是否有效 JSON
  if ! jq empty "$f" 2>/dev/null; then
    echo "FAILED: $fname — 无效JSON"
    failed=$((failed + 1))
    continue
  fi
  
  count=$(jq length "$f")
  
  if [ "$count" -eq 0 ]; then
    echo "FAILED: $fname — 空数组"
    empty=$((empty + 1))
    failed=$((failed + 1))
    continue
  fi
  
  # 检查必要字段
  missing=$(jq '[.[] | select(.input == null or .expected_intent == null)] | length' "$f")
  if [ "$missing" -gt 0 ]; then
    echo "WARN:   $fname — $count 条，但 $missing 条缺少必要字段"
  else
    echo "DONE:   $fname — $count 条 ✓"
  fi
  
  passed=$((passed + 1))
  total_cases=$((total_cases + count))
done

echo ""
echo "=== 汇总 ==="
echo "总文件数: $total_files"
echo "通过: $passed"
echo "失败: $failed (其中空文件: $empty)"
echo "总用例数: $total_cases"

if [ $failed -gt 0 ]; then
  echo ""
  echo "⚠️  有 $failed 个批次失败，建议重新挖掘"
  exit 1
fi

echo "✅ 全部通过"
