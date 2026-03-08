#!/usr/bin/env bash
# ISC Hook: rule.auto-fix-high-severity-001
# Description: 自动修复高严重度问题 - 严重度高且允许自动修复时执行
set -euo pipefail
RULE_ID="rule.auto-fix-high-severity-001"

# Check: no unresolved HIGH severity issues
ISSUES_DIR="/root/.openclaw/workspace/reports/issues"
if [ -d "$ISSUES_DIR" ]; then
  HIGH=$(grep -rl '"severity"\s*:\s*"HIGH"' "$ISSUES_DIR" 2>/dev/null | while read f; do
    grep -l '"status"\s*:\s*"open"' "$f" 2>/dev/null
  done | wc -l)
  if [ "$HIGH" -gt 0 ]; then
    echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"fail\",\"detail\":\"$HIGH open HIGH severity issues\"}"
  else
    echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"pass\",\"detail\":\"No open HIGH severity issues\"}"
  fi
else
  echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"pass\",\"detail\":\"No issues directory, nothing to fix\"}"
fi
