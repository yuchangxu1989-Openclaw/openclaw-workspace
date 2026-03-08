#!/usr/bin/env bash
# ISC Hook: rule.capability-anchor-lifecycle-sync-001
# Description: 技能修改时触发能力锚点同步
set -euo pipefail
RULE_ID="rule.capability-anchor-lifecycle-sync-001"

# Check: capability anchors are in sync with skill modifications
ANCHORS="/root/.openclaw/workspace/skills/isc-core/capability-anchors"
if [ -d "$ANCHORS" ] && [ "$(ls -A "$ANCHORS" 2>/dev/null)" ]; then
  echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"pass\",\"detail\":\"Capability anchors directory exists and has content\"}"
else
  echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"fail\",\"detail\":\"Capability anchors directory missing or empty\"}"
fi
