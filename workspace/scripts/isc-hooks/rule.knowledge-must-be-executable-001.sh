#!/usr/bin/env bash
set -euo pipefail
RULE_ID="rule.knowledge-must-be-executable-001"
WORKSPACE="/root/.openclaw/workspace"

# 检测: MEMORY.md中是否有未转化为规则/技能的可执行知识
MEMORY="$WORKSPACE/MEMORY.md"
if [ ! -f "$MEMORY" ]; then
  echo '{"rule_id":"'$RULE_ID'","status":"pass","detail":"No MEMORY.md found, nothing to check"}'
  exit 0
fi
# 简单检测: 含"应该"/"必须"/"规则"但未关联rule文件的行
ACTIONABLE=$(grep -c -iE '(应该|必须|规则|每次|永远不)' "$MEMORY" 2>/dev/null || echo 0)
if [ "$ACTIONABLE" -gt 5 ]; then
  echo '{"rule_id":"'$RULE_ID'","status":"fail","detail":"MEMORY.md contains '$ACTIONABLE' actionable statements potentially not converted to rules/skills"}'
else
  echo '{"rule_id":"'$RULE_ID'","status":"pass","detail":"MEMORY.md has '$ACTIONABLE' actionable statements (within threshold)"}'
fi

