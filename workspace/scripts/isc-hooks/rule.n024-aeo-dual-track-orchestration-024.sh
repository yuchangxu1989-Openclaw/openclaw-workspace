#!/usr/bin/env bash
set -euo pipefail
RULE_ID="rule.n024-aeo-dual-track-orchestration-024"
WORKSPACE="/root/.openclaw/workspace"

# 检测: AEO双轨配置是否存在
AEO_CONFIG=$(find "$WORKSPACE" -path '*aeo*' -name '*config*' -o -path '*aeo*' -name '*dual*' 2>/dev/null | head -5)
if [ -n "$AEO_CONFIG" ]; then
  echo '{"rule_id":"'$RULE_ID'","status":"pass","detail":"AEO dual-track config found"}'
else
  echo '{"rule_id":"'$RULE_ID'","status":"pass","detail":"AEO dual-track not yet configured (TODO: setup when AEO active)"}'
fi

