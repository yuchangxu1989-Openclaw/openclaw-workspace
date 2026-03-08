#!/usr/bin/env bash
# ISC Hook: ISC-COMPLETION-HANDLER-001
# Description: 收到子Agent completion event后必须先调用completion-handler.sh，不得跳过直接回复用户
set -euo pipefail
RULE_ID="ISC-COMPLETION-HANDLER-001"

# Check: completion-handler.sh exists and is executable
HANDLER="/root/.openclaw/workspace/scripts/completion-handler.sh"
if [ -x "$HANDLER" ]; then
  echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"pass\",\"detail\":\"completion-handler.sh exists and is executable\"}"
else
  echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"fail\",\"detail\":\"completion-handler.sh missing or not executable\"}"
fi
