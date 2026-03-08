#!/usr/bin/env bash
set -euo pipefail
RULE_ID="rule.design-document-structure-001"
DOC="${1:-}"
STATUS="pass"
DETAIL="design document structure checked"
REQUIRED=("背景" "目标" "架构" "风险" "验收")
if [[ -n "$DOC" && -f "$DOC" ]]; then
  for k in "${REQUIRED[@]}"; do
    if ! grep -q "$k" "$DOC"; then
      STATUS="fail"
      DETAIL="missing section: $k"
      break
    fi
  done
else
  DETAIL="TODO: connect to design doc artifact path"
fi
printf '{"rule_id":"%s","status":"%s","detail":"%s"}\n' "$RULE_ID" "$STATUS" "$DETAIL"
