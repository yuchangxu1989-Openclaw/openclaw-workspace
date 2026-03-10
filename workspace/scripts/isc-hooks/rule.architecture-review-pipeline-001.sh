#!/usr/bin/env bash
# Handler: rule.architecture-review-pipeline-001
# 架构评审流水线 — 架构文档提交后检查是否经过完整评审流程
set -euo pipefail

RULE_ID="rule.architecture-review-pipeline-001"
WORKSPACE="${WORKSPACE:-$(git rev-parse --show-toplevel 2>/dev/null || echo .)}"
STATUS="pass"
ISSUES=()

REVIEW_STAGES=("architect" "engineer" "quality" "tribunal")
STAGE_NAMES=("架构师出方案" "工程师验证" "质量分析师验证" "裁决殿终审")

# Scan design documents for review markers
DESIGN_DOCS=$(find "$WORKSPACE" -path '*/design*' -name '*.md' -o -path '*/architecture*' -name '*.md' 2>/dev/null || true)

if [ -z "$DESIGN_DOCS" ]; then
  printf '{"rule_id":"%s","status":"skip","detail":"no architecture/design documents found","issues":[]}\n' "$RULE_ID"
  exit 0
fi

DOC_COUNT=0
for doc in $DESIGN_DOCS; do
  [ -f "$doc" ] || continue
  DOC_COUNT=$((DOC_COUNT + 1))
  CONTENT=$(cat "$doc" 2>/dev/null || true)
  BASENAME=$(basename "$doc")
  
  for i in "${!REVIEW_STAGES[@]}"; do
    PATTERN="${REVIEW_STAGES[$i]}"
    if ! echo "$CONTENT" | grep -qiE "(review|审查|评审|验证|approved).*(${PATTERN})|${PATTERN}.*(review|审查|评审|验证|approved)|## .*${PATTERN}"; then
      # Also check for Chinese equivalents
      CN_PATTERN="${STAGE_NAMES[$i]}"
      if ! echo "$CONTENT" | grep -qF "$CN_PATTERN"; then
        ISSUES+=("$BASENAME: missing review stage '${STAGE_NAMES[$i]}'")
        STATUS="fail"
      fi
    fi
  done
done

DETAIL="scanned $DOC_COUNT docs, ${#ISSUES[@]} missing review stages"
ISSUES_JSON=$(printf '%s\n' "${ISSUES[@]}" 2>/dev/null | python3 -c "import sys,json;print(json.dumps([l.strip() for l in sys.stdin if l.strip()]))" 2>/dev/null || echo '[]')
printf '{"rule_id":"%s","status":"%s","detail":"%s","issues":%s}\n' "$RULE_ID" "$STATUS" "$DETAIL" "$ISSUES_JSON"
