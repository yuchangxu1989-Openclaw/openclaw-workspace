#!/usr/bin/env bash
# dedup-eval-cases.sh — 评测用例去重脚本
# 基于 input 字段文本相似度去重（完全相同 或 >90% 相似）
# 用法: bash dedup-eval-cases.sh [output_dir]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG="$SCRIPT_DIR/../config.json"
OUTPUT_DIR="${1:-$(jq -r '.output_dir' "$CONFIG")}"

echo "=== 评测用例去重 ==="
echo "目录: $OUTPUT_DIR"

# 合并所有 mined-*.json 到临时文件
MERGED=$(mktemp /tmp/eval-merged-XXXXXX.json)
DEDUPED=$(mktemp /tmp/eval-deduped-XXXXXX.json)

# 合并所有 JSON 数组
echo "合并文件..."
jq -s 'add // []' "$OUTPUT_DIR"/mined-*.json > "$MERGED" 2>/dev/null || {
  echo "错误: 没有找到 mined-*.json 文件"
  rm -f "$MERGED" "$DEDUPED"
  exit 1
}

total_before=$(jq length "$MERGED")
echo "去重前总数: $total_before"

# 使用 Python 做文本相似度去重
python3 -c "
import json, sys
from difflib import SequenceMatcher

with open('$MERGED') as f:
    cases = json.load(f)

if not cases:
    print('[]')
    sys.exit(0)

kept = []
kept_inputs = []

for case in cases:
    inp = case.get('input', '').strip()
    if not inp:
        continue
    
    is_dup = False
    for existing in kept_inputs:
        # 完全相同
        if inp == existing:
            is_dup = True
            break
        # >90% 相似
        ratio = SequenceMatcher(None, inp, existing).ratio()
        if ratio > 0.9:
            is_dup = True
            break
    
    if not is_dup:
        kept.append(case)
        kept_inputs.append(inp)

with open('$DEDUPED', 'w') as f:
    json.dump(kept, f, ensure_ascii=False, indent=2)

print(f'保留: {len(kept)} 条，去除: {len(cases) - len(kept)} 条')
"

total_after=$(jq length "$DEDUPED")

# 写入最终文件
FINAL_FILE="$OUTPUT_DIR/eval-cases-deduped.json"
cp "$DEDUPED" "$FINAL_FILE"

echo "去重后总数: $total_after"
echo "输出文件: $FINAL_FILE"

# 清理
rm -f "$MERGED" "$DEDUPED"

echo "=== 去重完成 ==="
