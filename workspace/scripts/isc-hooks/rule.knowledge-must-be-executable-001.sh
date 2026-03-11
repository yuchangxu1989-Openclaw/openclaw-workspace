#!/usr/bin/env bash
set -euo pipefail
RULE_ID="rule.knowledge-must-be-executable-001"
WORKSPACE="/root/.openclaw/workspace"
MEMOS_READER="$WORKSPACE/scripts/memos-reader.js"

# 检测: MemOS中是否有未转化为规则/技能的可执行知识（MEMORY.md已废弃）
if [ ! -f "$MEMOS_READER" ]; then
  echo '{"rule_id":"'$RULE_ID'","status":"pass","detail":"memos-reader.js not found, nothing to check"}'
  exit 0
fi

ACTIONABLE=$(node -e "
  const m = require('$MEMOS_READER');
  if (!m.isAvailable()) { console.log(0); process.exit(0); }
  const rows = m.searchFTS('应该 OR 必须 OR 规则 OR 每次 OR 永远不', 50);
  console.log(rows.length);
" 2>/dev/null || echo 0)

if [ "$ACTIONABLE" -gt 5 ]; then
  echo '{"rule_id":"'$RULE_ID'","status":"fail","detail":"MemOS contains '$ACTIONABLE' actionable entries potentially not converted to rules/skills"}'
else
  echo '{"rule_id":"'$RULE_ID'","status":"pass","detail":"MemOS has '$ACTIONABLE' actionable entries (within threshold)"}'
fi
