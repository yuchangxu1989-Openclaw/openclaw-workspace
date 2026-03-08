#!/usr/bin/env bash
# dedup-eval-cases.sh — 评测用例去重脚本
# 基于 input 字段文本相似度去重（完全相同 或 >90% 相似）
# 用法: bash dedup-eval-cases.sh [dir_or_file]
# 如果是目录，合并所有 *.json 去重后写入 eval-cases-deduped.json
# 如果是文件，对文件内部去重后覆盖写回
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG="$SCRIPT_DIR/../config.json"
TARGET="${1:-$(jq -r '.output_dir' "$CONFIG")}"

echo "=== 评测用例去重 ==="
echo "目标: $TARGET"

if [ -f "$TARGET" ]; then
  # 单文件去重
  MERGED="$TARGET"
  DEDUPED=$(mktemp /tmp/eval-deduped-XXXXXX.json)
  FINAL_FILE="$TARGET"
  echo "模式: 单文件内部去重"
elif [ -d "$TARGET" ]; then
  # 目录合并去重
  MERGED=$(mktemp /tmp/eval-merged-XXXXXX.json)
  DEDUPED=$(mktemp /tmp/eval-deduped-XXXXXX.json)
  FINAL_FILE="$TARGET/eval-cases-deduped.json"

  echo "合并文件..."
  # 合并所有 JSON 数组（mined-*.json 和其他 *.json）
  json_files=()
  for f in "$TARGET"/*.json; do
    [ -f "$f" ] || continue
    json_files+=("$f")
  done

  if [ ${#json_files[@]} -eq 0 ]; then
    echo "错误: 没有找到 JSON 文件"
    exit 1
  fi

  jq -s '[.[] | if type == "array" then .[] else . end]' "${json_files[@]}" > "$MERGED" 2>/dev/null || {
    echo "错误: JSON 合并失败"
    exit 1
  }
  echo "模式: 目录合并去重"
else
  echo "错误: $TARGET 不存在"
  exit 1
fi

total_before=$(jq length "$MERGED")
echo "去重前总数: $total_before"

python3 - "$MERGED" "$DEDUPED" << 'PYEOF'
import json, sys
from difflib import SequenceMatcher

merged_path = sys.argv[1]
deduped_path = sys.argv[2]

with open(merged_path) as f:
    cases = json.load(f)

if not cases:
    with open(deduped_path, 'w') as f:
        json.dump([], f)
    print("空数组，无需去重")
    sys.exit(0)

kept = []
kept_inputs = []

for case in cases:
    inp = case.get('input', '')
    if isinstance(inp, list):
        inp = json.dumps(inp, ensure_ascii=False)
    inp = inp.strip()
    if not inp:
        continue

    is_dup = False
    for existing in kept_inputs:
        if inp == existing:
            is_dup = True
            break
        if SequenceMatcher(None, inp, existing).ratio() > 0.9:
            is_dup = True
            break

    if not is_dup:
        kept.append(case)
        kept_inputs.append(inp)

with open(deduped_path, 'w') as f:
    json.dump(kept, f, ensure_ascii=False, indent=2)
    f.write('\n')

print(f"保留: {len(kept)} 条，去除: {len(cases) - len(kept)} 条")
PYEOF

total_after=$(jq length "$DEDUPED")

cp "$DEDUPED" "$FINAL_FILE"

echo "去重后总数: $total_after"
echo "输出文件: $FINAL_FILE"

# 清理临时文件
[ -f "$TARGET" ] || rm -f "$MERGED"
rm -f "$DEDUPED"

echo "=== 去重完成 ==="
