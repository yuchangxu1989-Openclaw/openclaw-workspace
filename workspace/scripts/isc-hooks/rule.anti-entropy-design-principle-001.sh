#!/usr/bin/env bash
# Handler: rule.anti-entropy-design-principle-001
# 反熵增设计原则检查 — 检查设计文档/架构决策是否满足4维度：可扩展/可泛化/可生长/反熵增
set -euo pipefail

RULE_ID="rule.anti-entropy-design-principle-001"
WORKSPACE="${WORKSPACE:-$(git rev-parse --show-toplevel 2>/dev/null || echo .)}"
INPUT_FILE="${1:-}"
STATUS="pass"
VIOLATIONS=()

# If no input file, scan recent design docs
if [ -z "$INPUT_FILE" ]; then
  FILES=$(find "$WORKSPACE" -path '*/design*' -name '*.md' -mtime -1 2>/dev/null || true)
  [ -z "$FILES" ] && FILES=$(find "$WORKSPACE/docs" -name '*.md' -mtime -1 2>/dev/null || true)
else
  FILES="$INPUT_FILE"
fi

if [ -z "$FILES" ]; then
  printf '{"rule_id":"%s","status":"skip","detail":"no recent design documents found","violations":[]}\n' "$RULE_ID"
  exit 0
fi

DIMENSIONS=("可扩展|extensib|scalab" "可泛化|generaliz|reusab" "可生长|evol|grow" "反熵增|anti.entropy|ordered|decoupl")
DIM_NAMES=("可扩展性(extensibility)" "可泛化性(generalizability)" "可生长性(evolvability)" "反熵增(anti-entropy)")

for f in $FILES; do
  [ -f "$f" ] || continue
  CONTENT=$(cat "$f" 2>/dev/null || true)
  for i in "${!DIMENSIONS[@]}"; do
    if ! echo "$CONTENT" | grep -qiE "${DIMENSIONS[$i]}"; then
      VIOLATIONS+=("$(basename "$f"): missing dimension ${DIM_NAMES[$i]}")
      STATUS="fail"
    fi
  done
done

VIOLATION_JSON=$(printf '%s\n' "${VIOLATIONS[@]}" 2>/dev/null | python3 -c "import sys,json; print(json.dumps([l.strip() for l in sys.stdin if l.strip()]))" 2>/dev/null || echo '[]')
DETAIL="checked $(echo "$FILES" | wc -w) files, ${#VIOLATIONS[@]} violations"
printf '{"rule_id":"%s","status":"%s","detail":"%s","violations":%s}\n' "$RULE_ID" "$STATUS" "$DETAIL" "$VIOLATION_JSON"
