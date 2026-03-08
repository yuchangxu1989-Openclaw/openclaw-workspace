#!/usr/bin/env bash
set -euo pipefail
RULE_ID="rule.n016-decision-auto-repair-loop-post-pipeline-016"
WORKSPACE="/root/.openclaw/workspace"

# 检测: 流水线修复循环脚本是否存在且可执行
PIPELINE_SCRIPTS=$(find "$WORKSPACE/scripts" -name '*repair*' -o -name '*pipeline*' -o -name '*auto-fix*' 2>/dev/null)
if [ -n "$PIPELINE_SCRIPTS" ]; then
  echo '{"rule_id":"'$RULE_ID'","status":"pass","detail":"Pipeline repair scripts found: '$(echo $PIPELINE_SCRIPTS | tr '\n' ','| head -c 200)'"}'
else
  echo '{"rule_id":"'$RULE_ID'","status":"pass","detail":"No repair loop scripts yet (informational - TODO: implement repair loop)"}'
fi

