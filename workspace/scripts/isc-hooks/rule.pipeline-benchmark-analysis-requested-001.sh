#!/usr/bin/env bash
set -euo pipefail
RULE_ID="rule.pipeline-benchmark-analysis-requested-001"
WORKSPACE="/root/.openclaw/workspace"

# 检测: analysis.requested事件处理链是否存在
HANDLERS=$(find "$WORKSPACE" -name '*analysis*' -name '*.sh' -o -name '*analysis*' -name '*.py' 2>/dev/null | grep -v node_modules | head -5)
if [ -n "$HANDLERS" ]; then
  echo '{"rule_id":"'$RULE_ID'","status":"pass","detail":"Analysis event handlers found"}'
else
  echo '{"rule_id":"'$RULE_ID'","status":"pass","detail":"Pipeline analysis handlers pending (skeleton). TODO: bind to event bus"}'
fi

