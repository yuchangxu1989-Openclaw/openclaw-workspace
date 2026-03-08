#!/usr/bin/env bash
set -euo pipefail
RULE_ID="rule.n019-auto-skill-md-generation-019"
WORKSPACE="/root/.openclaw/workspace"

# 检测: 是否存在有代码但无SKILL.md的技能目录
MISSING=""
for d in "$WORKSPACE"/skills/*/; do
  [ ! -d "$d" ] && continue
  HAS_CODE=$(find "$d" -maxdepth 2 \( -name '*.py' -o -name '*.sh' -o -name '*.js' -o -name '*.ts' \) | head -1)
  if [ -n "$HAS_CODE" ] && [ ! -f "$d/SKILL.md" ]; then
    MISSING="$MISSING $(basename $d)"
  fi
done
if [ -n "$MISSING" ]; then
  echo '{"rule_id":"'$RULE_ID'","status":"fail","detail":"Skills missing SKILL.md:'"$MISSING"'"}'
else
  echo '{"rule_id":"'$RULE_ID'","status":"pass","detail":"All skill directories with code have SKILL.md"}'
fi

