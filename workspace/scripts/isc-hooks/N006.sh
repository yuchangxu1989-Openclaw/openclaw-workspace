#!/usr/bin/env bash
set -euo pipefail
RULE_ID="N006"
INPUT="${1:-}"
STATUS="pass"
DETAIL="skill_name_bilingual_display checked"
if [[ -n "$INPUT" && -f "$INPUT" ]]; then
  if grep -Eq '"(name|skill_name)"\s*:\s*"[^"]+[（(][^)"]+[)）]"' "$INPUT"; then
    DETAIL="bilingual skill name detected"
  else
    STATUS="fail"
    DETAIL="missing bilingual skill name format (中文+English)"
  fi
else
  DETAIL="TODO: provide target json path as arg for full validation"
fi
printf '{"rule_id":"%s","status":"%s","detail":"%s"}\n' "$RULE_ID" "$STATUS" "$DETAIL"
