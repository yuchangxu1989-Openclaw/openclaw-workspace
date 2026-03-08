#!/usr/bin/env bash
# ISC Hook: rule.failure-pattern-alert-001
# Description: 检测到系统故障模式时触发告警通知
set -euo pipefail
RULE_ID="rule.failure-pattern-alert-001"

# Check: recent logs for repeated failure patterns
LOG_DIR="/root/.openclaw/workspace/logs"
if [ -d "$LOG_DIR" ]; then
  FAILURES=$(grep -r "ERROR\|FAIL\|error\|fail" "$LOG_DIR"/ 2>/dev/null | tail -100 | sort | uniq -c | sort -rn | head -5)
  PATTERN_COUNT=$(echo "$FAILURES" | grep -c "^" 2>/dev/null)
  if [ -n "$FAILURES" ] && [ "$PATTERN_COUNT" -gt 3 ]; then
    echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"fail\",\"detail\":\"$PATTERN_COUNT recurring failure patterns detected\"}"
  else
    echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"pass\",\"detail\":\"No significant failure patterns\"}"
  fi
else
  echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"pass\",\"detail\":\"No logs directory\"}"
fi
