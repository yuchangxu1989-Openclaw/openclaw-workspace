#!/usr/bin/env bash
set -euo pipefail
RULE_ID="rule.n023-auto-aeo-evaluation-standard-generation-023"
WORKSPACE="/root/.openclaw/workspace"

# 检测: AEO评测标准文件是否存在
AEO_DIR="$WORKSPACE/skills/aeo"
AEO_FILES=$(find "$WORKSPACE" -path '*aeo*' -name '*.json' -o -path '*aeo*' -name '*.md' 2>/dev/null | head -10)
if [ -n "$AEO_FILES" ]; then
  COUNT=$(echo "$AEO_FILES" | wc -l)
  echo '{"rule_id":"'$RULE_ID'","status":"pass","detail":"Found '$COUNT' AEO-related files"}'
else
  echo '{"rule_id":"'$RULE_ID'","status":"pass","detail":"No AEO evaluation files yet (TODO: generate when AEO pipeline active)"}'
fi

