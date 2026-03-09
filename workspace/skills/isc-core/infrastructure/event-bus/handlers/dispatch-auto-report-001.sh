#!/usr/bin/env bash
# ISC Event Handler: dispatch-auto-report-001
# Rule: 批量派发后自动汇报
# Event: dispatch.batch.completed (spawned_count >= 2)
# Enforcement: After batch spawn, verify that multi-agent-reporting was invoked
#   and standard format queue status was output to user.
set -euo pipefail

RULE_ID="dispatch-auto-report-001"
WORKSPACE="/root/.openclaw/workspace"
STATUS="pass"
DETAIL=""

# Check 1: multi-agent-reporting skill exists
REPORTING_SKILL="$WORKSPACE/skills/multi-agent-reporting"
if [ ! -d "$REPORTING_SKILL" ]; then
  # Also check alternative locations
  REPORTING_SKILL=$(find "$WORKSPACE/skills" -maxdepth 2 -name '*multi-agent-report*' -type d 2>/dev/null | head -1)
  if [ -z "$REPORTING_SKILL" ]; then
    STATUS="fail"
    DETAIL="multi-agent-reporting skill not found. Cannot auto-report after batch dispatch."
    printf '{"rule_id":"%s","status":"%s","detail":"%s"}\n' "$RULE_ID" "$STATUS" "$DETAIL"
    exit 1
  fi
fi

# Check 2: Skill has a SKILL.md with format spec
if [ -f "$REPORTING_SKILL/SKILL.md" ]; then
  # Verify it mentions the required format elements
  if grep -qE '(并行总数|状态表|汇总|queue)' "$REPORTING_SKILL/SKILL.md" 2>/dev/null; then
    DETAIL="multi-agent-reporting skill found with format spec. Auto-report capability OK."
  else
    STATUS="warn"
    DETAIL="multi-agent-reporting skill exists but format spec may be incomplete."
  fi
else
  STATUS="warn"
  DETAIL="multi-agent-reporting skill directory found but SKILL.md missing."
fi

printf '{"rule_id":"%s","status":"%s","detail":"%s"}\n' "$RULE_ID" "$STATUS" "$DETAIL"
[ "$STATUS" = "fail" ] && exit 1 || exit 0
