#!/usr/bin/env bash
set -euo pipefail
RULE_ID="rule.caijuedian-tribunal-001"
WORKSPACE="/root/.openclaw/workspace"

# 检测: 裁决殿技能是否存在且可调用
SKILL_PATH="$WORKSPACE/skills/caijuedian-tribunal"
if [ -d "$SKILL_PATH" ] && [ -f "$SKILL_PATH/SKILL.md" ]; then
  echo '{"rule_id":"'$RULE_ID'","status":"pass","detail":"Lingxiaoge tribunal skill found at '$SKILL_PATH'"}'
else
  # 也检查其他可能路径
  ALT=$(find "$WORKSPACE/skills" -path '*lingxiao*' -name 'SKILL.md' 2>/dev/null | head -1)
  if [ -n "$ALT" ]; then
    echo '{"rule_id":"'$RULE_ID'","status":"pass","detail":"Lingxiaoge skill found: '$ALT'"}'
  else
    echo '{"rule_id":"'$RULE_ID'","status":"fail","detail":"Lingxiaoge tribunal skill directory not found"}'
  fi
fi

