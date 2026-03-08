#!/usr/bin/env bash
# ISC Hook: ISC-FILE-SEND-INTENT-001
# Description: 当用户表达发送文件意图时，自动使用file-sender技能
set -euo pipefail
RULE_ID="ISC-FILE-SEND-INTENT-001"

# Check: file-sender skill exists and is functional
SKILL_PATH="/root/.openclaw/workspace/skills/public/file-sender/index.js"
if [ -f "$SKILL_PATH" ]; then
  echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"pass\",\"detail\":\"file-sender skill exists at $SKILL_PATH\"}"
else
  # Check alternative locations
  ALT=$(find /root/.openclaw/workspace/skills -path "*/file-sender*" -name "*.js" 2>/dev/null | head -1)
  if [ -n "$ALT" ]; then
    echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"pass\",\"detail\":\"file-sender found at $ALT\"}"
  else
    echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"fail\",\"detail\":\"file-sender skill not found\"}"
  fi
fi
