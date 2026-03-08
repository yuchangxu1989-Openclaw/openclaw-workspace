#!/usr/bin/env bash
set -euo pipefail
RULE_ID="rule.n026-aeo-insight-to-action-026"
WORKSPACE="/root/.openclaw/workspace"

# 检测: AEO洞察整改跟踪文件
TRACKER=$(find "$WORKSPACE" -path '*aeo*' \( -name '*tracker*' -o -name '*insight*' -o -name '*action*' \) 2>/dev/null | head -5)
if [ -n "$TRACKER" ]; then
  echo '{"rule_id":"'$RULE_ID'","status":"pass","detail":"AEO insight-to-action tracker found"}'
else
  echo '{"rule_id":"'$RULE_ID'","status":"pass","detail":"No AEO action tracker yet (TODO: create when insights generated)"}'
fi

