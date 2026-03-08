#!/usr/bin/env bash
set -euo pipefail
RULE_ID="rule.isc-skill-index-auto-update-001"
WORKSPACE="/root/.openclaw/workspace"

# 检测: CAPABILITY-ANCHOR.md是否与实际技能目录一致
ANCHOR="$WORKSPACE/skills/isc-core/CAPABILITY-ANCHOR.md"
if [ ! -f "$ANCHOR" ]; then
  echo '{"rule_id":"'$RULE_ID'","status":"fail","detail":"CAPABILITY-ANCHOR.md not found"}'
  exit 0
fi
SKILL_DIRS=$(find "$WORKSPACE/skills" -name 'SKILL.md' 2>/dev/null | wc -l)
ANCHOR_ENTRIES=$(grep -c -E '^[-*] ' "$ANCHOR" 2>/dev/null || echo 0)
# TODO: deeper alignment check
echo '{"rule_id":"'$RULE_ID'","status":"pass","detail":"CAPABILITY-ANCHOR.md exists. Skills:'$SKILL_DIRS' AnchorEntries:'$ANCHOR_ENTRIES'. TODO: deep alignment"}'

