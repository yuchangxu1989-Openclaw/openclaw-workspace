#!/usr/bin/env bash
# ISC Hook: rule.auto-evomap-sync-trigger-001
# Description: 自动EvoMap同步触发规则 - 技能创建或更新时同步到EvoMap网络
set -euo pipefail
RULE_ID="rule.auto-evomap-sync-trigger-001"

# Check: EvoMap sync artifacts exist
EVOMAP="/root/.openclaw/workspace/skills/isc-core/evomap"
if [ -d "$EVOMAP" ] && [ "$(ls -A "$EVOMAP" 2>/dev/null)" ]; then
  echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"pass\",\"detail\":\"EvoMap directory exists with content\"}"
else
  echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"fail\",\"detail\":\"EvoMap directory missing or empty\"}"
fi
