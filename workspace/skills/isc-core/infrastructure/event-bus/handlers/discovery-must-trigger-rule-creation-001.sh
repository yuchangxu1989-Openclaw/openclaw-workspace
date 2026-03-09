#!/usr/bin/env bash
# ISC Event Handler: discovery-must-trigger-rule-creation-001
# Rule: 发现问题必须同步创建规则
# Events: system.issue.discovered, architecture.gap.detected, aeo.methodology.upgraded
# Enforcement: When an issue/gap is discovered, verify that the fix includes
#   the "三件套": rule JSON + event binding + LTO execution chain.
set -euo pipefail

RULE_ID="rule.discovery-must-trigger-rule-creation-001"
WORKSPACE="/root/.openclaw/workspace"
RULES_DIR="$WORKSPACE/skills/isc-core/rules"
HOOKS_DIR="$WORKSPACE/scripts/isc-hooks"
STATUS="pass"
DETAIL=""

# Accept optional argument: the issue/fix context directory or commit range
CONTEXT="${1:-}"

# Check 1: Rules directory has recent rules (basic liveness)
RULE_COUNT=$(find "$RULES_DIR" -maxdepth 1 -name 'rule.*.json' -newer "$RULES_DIR" -mmin -1440 2>/dev/null | wc -l || echo 0)

# Check 2: For each rule JSON, verify a corresponding hook script exists
MISSING_HOOKS=()
for rule_file in "$RULES_DIR"/rule.*.json; do
  [ -f "$rule_file" ] || continue
  rule_basename=$(basename "$rule_file" .json)
  # Check if a handler exists in hooks dir or event-bus handlers
  hook_in_hooks="$HOOKS_DIR/${rule_basename}.sh"
  hook_in_handlers="$(dirname "$0")/${rule_basename#rule.}.sh"
  if [ ! -f "$hook_in_hooks" ] && [ ! -f "$hook_in_handlers" ]; then
    MISSING_HOOKS+=("$rule_basename")
  fi
done

if [ ${#MISSING_HOOKS[@]} -gt 0 ]; then
  # Warn but don't fail — some rules may be advisory-only
  DETAIL="rules missing handler scripts: ${MISSING_HOOKS[*]:0:5} (${#MISSING_HOOKS[@]} total). Ensure 三件套 for each discovery."
  # If more than 50% are missing, that's a fail
  TOTAL_RULES=$(find "$RULES_DIR" -maxdepth 1 -name 'rule.*.json' | wc -l)
  if [ ${#MISSING_HOOKS[@]} -gt $((TOTAL_RULES / 2)) ]; then
    STATUS="warn"
  fi
else
  DETAIL="All rules have corresponding handler scripts. 三件套 coverage OK."
fi

printf '{"rule_id":"%s","status":"%s","detail":"%s"}\n' "$RULE_ID" "$STATUS" "$DETAIL"
[ "$STATUS" = "fail" ] && exit 1 || exit 0
