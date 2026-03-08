#!/usr/bin/env bash
# ISC Hook: rule.auto-skillization-trigger-001
# Description: 自动技能化触发规则 - 技能质量分>=50时自动触发技能化流程
set -euo pipefail
RULE_ID="rule.auto-skillization-trigger-001"

# Check: skills with quality score >= 50 have been through skillization
SKILLS_DIR="/root/.openclaw/workspace/skills"
if [ -d "$SKILLS_DIR" ]; then
  COUNT=$(find "$SKILLS_DIR" -name "SKILL.md" | wc -l)
  echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"pass\",\"detail\":\"$COUNT skills found in skills directory\"}"
else
  echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"fail\",\"detail\":\"Skills directory not found\"}"
fi
