#!/usr/bin/env bash
# ISC Hook: rule.eval-driven-development-loop-001
# Description: 评测驱动开发闭环：任何功能开发/系统建设必须遵循完整的场景化评测闭环流程，不允许跳步。
set -euo pipefail
RULE_ID="rule.eval-driven-development-loop-001"

# Check: skills/features have corresponding eval artifacts
SKILLS_WITH_EVAL=0
SKILLS_TOTAL=0
for skill_dir in /root/.openclaw/workspace/skills/*/; do
  [ -f "$skill_dir/SKILL.md" ] || continue
  SKILLS_TOTAL=$((SKILLS_TOTAL+1))
  if [ -d "$skill_dir/eval" ] || [ -d "$skill_dir/tests" ]; then
    SKILLS_WITH_EVAL=$((SKILLS_WITH_EVAL+1))
  fi
done
if [ "$SKILLS_TOTAL" -gt 0 ] && [ "$SKILLS_WITH_EVAL" -lt "$SKILLS_TOTAL" ]; then
  echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"fail\",\"detail\":\"$SKILLS_WITH_EVAL/$SKILLS_TOTAL skills have eval/test artifacts\"}"
else
  echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"pass\",\"detail\":\"All $SKILLS_TOTAL skills have eval coverage\"}"
fi
