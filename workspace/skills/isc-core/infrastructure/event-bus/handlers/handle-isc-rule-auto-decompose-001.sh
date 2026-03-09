#!/usr/bin/env bash
# Handler: rule.isc-rule-auto-decompose-001
# Event:   isc.rule.created
# Priority: P0 (block)
# Description: 规则创建后自动拆解——事件绑定、DTO关联、三层归属验证，输出对齐矩阵
#
# Usage: This handler is invoked by the EventBus when a new rule is created.
#        Input: RULE_FILE env var pointing to the newly created rule JSON.
# ------------------------------------------------------------------

set -euo pipefail

RULES_DIR="${RULES_DIR:-$(dirname "$(realpath "$0")")/../../../rules}"
RULE_FILE="${RULE_FILE:?RULE_FILE env var required (path to the new rule JSON)}"

if [[ ! -f "$RULE_FILE" ]]; then
  echo "[ERROR] Rule file not found: $RULE_FILE" >&2
  exit 1
fi

RULE_ID=$(jq -r '.id // empty' "$RULE_FILE")
RULE_NAME=$(jq -r '.name // empty' "$RULE_FILE")
echo "=== ISC Rule Auto-Decompose ==="
echo "Rule: $RULE_ID ($RULE_NAME)"
echo ""

# ── Step 1: 事件拆解 ──────────────────────────────────────────
echo "[Step 1/4] 事件拆解 — 分析规则监听的事件"
EVENTS=$(jq -r '.trigger.events[]? // .trigger.event // empty' "$RULE_FILE" 2>/dev/null)
if [[ -z "$EVENTS" ]]; then
  echo "  ⚠ No trigger events defined — rule is an orphan!"
  DECOMPOSE_OK=false
else
  echo "  ✓ Registered events:"
  for evt in $EVENTS; do
    echo "    - $evt → EventBus"
  done
  DECOMPOSE_OK=true
fi
echo ""

# ── Step 2: DTO绑定 ──────────────────────────────────────────
echo "[Step 2/4] DTO绑定 — 触发后动作绑定"
ACTIONS=$(jq -r '.trigger.actions[]? // empty' "$RULE_FILE" 2>/dev/null)
HANDLER=$(jq -r '.action.handler // empty' "$RULE_FILE" 2>/dev/null)
if [[ -n "$ACTIONS" ]]; then
  echo "  ✓ Bound actions:"
  for act in $ACTIONS; do
    echo "    - $act"
  done
else
  echo "  ⚠ No trigger actions defined"
fi
if [[ -n "$HANDLER" ]]; then
  echo "  ✓ Handler: $HANDLER"
else
  echo "  ⚠ No handler specified"
fi
echo ""

# ── Step 3: 三层归属验证 ──────────────────────────────────────
echo "[Step 3/4] 三层归属验证"
DOMAIN=$(jq -r '.domain // "unset"' "$RULE_FILE")
SCOPE=$(jq -r '.scope // "unset"' "$RULE_FILE")
# Perception layer: trigger events define who senses
# Cognition layer: governance/standard defines who decides
# Execution layer: action defines who executes
PERCEPTION="trigger.events → [${EVENTS:-none}]"
COGNITION="governance.auto_execute=$(jq -r '.governance.auto_execute // false' "$RULE_FILE")"
EXECUTION="action.handler=${HANDLER:-none}"

echo "  感知层 (Perception): $PERCEPTION"
echo "  认知层 (Cognition):  $COGNITION"
echo "  执行层 (Execution):  $EXECUTION"

MISSING_LAYERS=0
[[ -z "$EVENTS" ]] && ((MISSING_LAYERS++))
[[ -z "$HANDLER" ]] && ((MISSING_LAYERS++))
if [[ $MISSING_LAYERS -gt 0 ]]; then
  echo "  ⚠ $MISSING_LAYERS layer(s) incomplete"
  DECOMPOSE_OK=false
fi
echo ""

# ── Step 4: 对齐矩阵输出 ──────────────────────────────────────
echo "[Step 4/4] 对齐矩阵"
echo "┌──────────────────────────────────────────────────────────┐"
printf "│ %-12s │ %-40s │\n" "Rule" "$RULE_ID"
printf "│ %-12s │ %-40s │\n" "Domain" "$DOMAIN"
printf "│ %-12s │ %-40s │\n" "Scope" "$SCOPE"
printf "│ %-12s │ %-40s │\n" "Events" "${EVENTS:-NONE}"
printf "│ %-12s │ %-40s │\n" "Actions" "$(echo $ACTIONS | tr '\n' ',')"
printf "│ %-12s │ %-40s │\n" "Handler" "${HANDLER:-NONE}"
printf "│ %-12s │ %-40s │\n" "Perception" "${EVENTS:-⚠ missing}"
printf "│ %-12s │ %-40s │\n" "Cognition" "auto_execute=$(jq -r '.governance.auto_execute // false' "$RULE_FILE")"
printf "│ %-12s │ %-40s │\n" "Execution" "${HANDLER:-⚠ missing}"
echo "└──────────────────────────────────────────────────────────┘"
echo ""

if [[ "$DECOMPOSE_OK" == "true" ]]; then
  echo "✅ Decomposition complete — no orphan detected."
else
  echo "⚠ Decomposition found issues — review required."
fi
