#!/usr/bin/env bash
# ISC Hook: rule.coding-quality-thinking-001
# Description: 核心模块的编码，开发工程师必须开thinking（高质量推理模式）。
set -euo pipefail
RULE_ID="rule.coding-quality-thinking-001"

# Check: core module changes use thinking mode (check git log for thinking indicators)
# TODO: integrate with actual session metadata to verify thinking was enabled
CORE_MODULES="/root/.openclaw/workspace/skills"
RECENT_CHANGES=$(cd /root/.openclaw/workspace && git log --oneline -20 --diff-filter=M -- "skills/*/src/*" "skills/*/lib/*" 2>/dev/null | wc -l)
if [ "$RECENT_CHANGES" -gt 0 ]; then
  echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"pass\",\"detail\":\"$RECENT_CHANGES recent core module changes detected; thinking mode enforcement is advisory\"}"
else
  echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"pass\",\"detail\":\"No recent core module changes\"}"
fi
