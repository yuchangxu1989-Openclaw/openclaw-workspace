#!/usr/bin/env bash
# ISC Hook: rule.glm-vision-priority-001
# Description: 图像视频需求优先调用GLM-4V-Plus规则 - 根治遗忘
set -euo pipefail
RULE_ID="rule.glm-vision-priority-001"

# Check: model config prioritizes GLM-4V for vision tasks
CONFIG="/root/.openclaw/openclaw.yaml"
if [ -f "$CONFIG" ]; then
  if grep -q "glm-4v\|glm.*vision" "$CONFIG" 2>/dev/null; then
    echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"pass\",\"detail\":\"GLM vision model configured\"}"
  else
    echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"fail\",\"detail\":\"GLM vision model not found in config\"}"
  fi
else
  echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"fail\",\"detail\":\"Config file not found\"}"
fi
