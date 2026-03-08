#!/usr/bin/env bash
# ISC Hook: rule.isc-skill-permission-classification-031 — 技能权限分级体系
# 检测所有技能的SKILL.md是否包含permissions声明
set -euo pipefail
RULE_ID="rule.isc-skill-permission-classification-031"
WORKSPACE="${WORKSPACE:-/root/.openclaw/workspace}"
SKILLS_DIR="$WORKSPACE/skills"

if [ ! -d "$SKILLS_DIR" ]; then
  echo "{\"rule_id\":\"$RULE_ID\", \"status\":\"fail\", \"detail\":\"Skills directory not found\"}"
  exit 1
fi

MISSING_PERMS=()
CHECKED=0
for skill_md in "$SKILLS_DIR"/*/SKILL.md; do
  [ -f "$skill_md" ] || continue
  CHECKED=$((CHECKED + 1))
  SKILL_NAME=$(basename "$(dirname "$skill_md")")
  if ! grep -qi "permissions" "$skill_md" 2>/dev/null; then
    MISSING_PERMS+=("$SKILL_NAME")
  fi
done

if [ ${#MISSING_PERMS[@]} -gt 0 ]; then
  # 只报前5个
  SHOW="${MISSING_PERMS[*]:0:5}"
  echo "{\"rule_id\":\"$RULE_ID\", \"status\":\"fail\", \"detail\":\"${#MISSING_PERMS[@]}/$CHECKED skills missing permissions declaration: $SHOW ...\"}"
  exit 1
fi

echo "{\"rule_id\":\"$RULE_ID\", \"status\":\"pass\", \"detail\":\"All $CHECKED skills have permissions declared\"}"
exit 0
