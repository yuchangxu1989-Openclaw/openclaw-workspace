#!/usr/bin/env bash
# ISC Hook: ISC-AUTO-QA-001
# Description: coder/writer/researcher完成的任务必须自动触发质量核查，核查者必须是不同Agent
set -euo pipefail
RULE_ID="ISC-AUTO-QA-001"

# Check: completion events have corresponding QA review records
COMPLETION_LOG="/root/.openclaw/workspace/logs/completions"
QA_LOG="/root/.openclaw/workspace/logs/qa-reviews"
if [ -d "$COMPLETION_LOG" ]; then
  TOTAL=$(ls "$COMPLETION_LOG" 2>/dev/null | wc -l)
  REVIEWED=$(ls "$QA_LOG" 2>/dev/null | wc -l)
  if [ "$TOTAL" -gt 0 ] && [ "$REVIEWED" -lt "$TOTAL" ]; then
    echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"fail\",\"detail\":\"$REVIEWED/$TOTAL completions have QA reviews\"}"
  else
    echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"pass\",\"detail\":\"All completions reviewed ($REVIEWED/$TOTAL)\"}"
  fi
else
  echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"pass\",\"detail\":\"No completion logs found\"}"
fi
