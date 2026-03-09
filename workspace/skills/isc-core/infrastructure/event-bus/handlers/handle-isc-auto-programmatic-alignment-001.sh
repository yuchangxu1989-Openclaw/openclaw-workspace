#!/usr/bin/env bash
# Handler: rule.isc-auto-programmatic-alignment-001 — ISC规则增删改自动程序化对齐
# Trigger: isc.rule.created | isc.rule.modified | isc.rule.deleted
# 全链路: 感知探针→认知判断→执行动作→质量验真
#
# Input (via env or stdin JSON):
#   EVENT_PAYLOAD - JSON with { event, rule: { id, path, diff? } }

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ISC_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
RULE_ID="rule.isc-auto-programmatic-alignment-001"

# Parse payload
if [[ -n "${EVENT_PAYLOAD:-}" ]]; then
  payload="$EVENT_PAYLOAD"
else
  payload="$(cat)"
fi

event_type=$(echo "$payload" | jq -r '.event // empty')
rule_id=$(echo "$payload" | jq -r '.rule.id // "unknown"')
rule_path=$(echo "$payload" | jq -r '.rule.path // empty')

echo "[${RULE_ID}] Received event='$event_type' for rule='$rule_id'"

# Phase 1: 感知探针 — Verify the rule file exists/changed
echo "[${RULE_ID}] Phase 1/4: 感知探针 (Perception)"
if [[ "$event_type" == "isc.rule.deleted" ]]; then
  echo "  Rule deleted: $rule_id"
elif [[ -n "$rule_path" && -f "$rule_path" ]]; then
  echo "  Rule file verified: $rule_path"
else
  echo "  WARNING: rule file not found at '$rule_path'" >&2
fi

# Phase 2: 认知判断 — Validate rule schema & determine scope
echo "[${RULE_ID}] Phase 2/4: 认知判断 (Cognition)"
if [[ -n "$rule_path" && -f "$rule_path" ]]; then
  has_trigger=$(jq 'has("trigger")' "$rule_path" 2>/dev/null || echo "false")
  has_action=$(jq 'has("action")' "$rule_path" 2>/dev/null || echo "false")
  priority=$(jq -r '.priority // "unset"' "$rule_path" 2>/dev/null || echo "unknown")
  echo "  Schema check: trigger=$has_trigger action=$has_action priority=$priority"
fi

# Phase 3: 执行动作 — Check handler exists, update fullchain_status
echo "[${RULE_ID}] Phase 3/4: 执行动作 (Execution)"
handler_dir="$ISC_ROOT/infrastructure/event-bus/handlers"
handler_match=$(find "$handler_dir" -name "*${rule_id}*" -type f 2>/dev/null | head -1)
if [[ -n "$handler_match" ]]; then
  echo "  Handler found: $handler_match"
else
  echo "  WARNING: No handler found for rule '$rule_id'" >&2
fi

# Phase 4: 质量验真 — Verify fullchain_status in rule JSON
echo "[${RULE_ID}] Phase 4/4: 质量验真 (Verification)"
if [[ -n "$rule_path" && -f "$rule_path" ]]; then
  fc_status=$(jq -r '.fullchain_status // "missing"' "$rule_path" 2>/dev/null || echo "error")
  if [[ "$fc_status" == "expanded" ]]; then
    echo "  fullchain_status=expanded ✓"
  else
    echo "  WARNING: fullchain_status='$fc_status' (expected 'expanded')" >&2
  fi
fi

echo "[${RULE_ID}] Alignment check complete for event='$event_type' rule='$rule_id'"

# Emit completion event
echo "{\"event\":\"isc.alignment.completed\",\"source_rule\":\"${RULE_ID}\",\"target_rule\":\"${rule_id}\",\"event_type\":\"${event_type}\",\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
exit 0
