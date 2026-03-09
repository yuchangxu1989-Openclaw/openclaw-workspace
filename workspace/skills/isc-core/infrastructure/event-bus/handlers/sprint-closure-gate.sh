#!/usr/bin/env bash
# =============================================================================
# Handler: sprint-closure-gate
# Rule:    rule.sprint-closure-acceptance-001
# Event:   sprint.closure.requested / sprint.day.closure.requested
# Priority: P0 (block)
# Description: Sprint收工四重验收门禁
#   Gate 1: artifact_audit    — 产物核查
#   Gate 2: metrics_collected — 指标采集
#   Gate 3: lessons_captured  — 经验沉淀
#   Gate 4: tribunal_verdict  — 裁决殿裁决
# =============================================================================
set -euo pipefail

RULE_ID="rule.sprint-closure-acceptance-001"
WORKSPACE="${WORKSPACE:-/root/.openclaw/workspace}"
EVENT="${1:-sprint.closure.requested}"
SPRINT_ID="${2:-$(date +%Y-%m-%d)}"

PASS=0
FAIL=0
WARN=0
RESULTS=()

# ---------- helper ----------
gate_result() {
  local id="$1" name="$2" status="$3" detail="$4" action="$5"
  RESULTS+=("{\"gate\":\"${id}\",\"name\":\"${name}\",\"status\":\"${status}\",\"detail\":\"${detail}\"}")
  if [ "$status" = "pass" ]; then
    ((PASS++))
  elif [ "$action" = "block" ]; then
    ((FAIL++))
  else
    ((WARN++))
  fi
}

# ---------- Gate 1: artifact_audit (产物核查) ----------
# Check if project artifact gate rule script exists and passes
ARTIFACT_HOOK="$WORKSPACE/scripts/isc-hooks/rule.project-artifact-gate-001.sh"
if [ -x "$ARTIFACT_HOOK" ]; then
  if "$ARTIFACT_HOOK" "$SPRINT_ID" >/dev/null 2>&1; then
    gate_result "artifact_audit" "产物核查" "pass" "artifact gate passed" "block"
  else
    gate_result "artifact_audit" "产物核查" "fail" "artifact gate rejected — run rule.project-artifact-gate-001" "block"
  fi
else
  # Fallback: check if any task artifacts exist for this sprint
  TRACKER="$WORKSPACE/skills/project-mgmt/PROJECT-TRACKER.md"
  if [ -f "$TRACKER" ]; then
    gate_result "artifact_audit" "产物核查" "pass" "PROJECT-TRACKER exists (manual review recommended)" "block"
  else
    gate_result "artifact_audit" "产物核查" "fail" "no PROJECT-TRACKER found" "block"
  fi
fi

# ---------- Gate 2: metrics_collected (指标采集) ----------
METRICS_DIR="$WORKSPACE/skills/project-mgmt/metrics"
MONTH_FILE="$METRICS_DIR/$(date +%Y-%m).json"
REQUIRED_FIELDS=("planned_days" "actual_days" "tasks_total" "tasks_completed" "review_rejections" "parallel_ratio")

if [ -f "$MONTH_FILE" ]; then
  MISSING=()
  for field in "${REQUIRED_FIELDS[@]}"; do
    if ! grep -q "\"$field\"" "$MONTH_FILE" 2>/dev/null; then
      MISSING+=("$field")
    fi
  done
  if [ ${#MISSING[@]} -eq 0 ]; then
    gate_result "metrics_collected" "指标采集" "pass" "all required fields present in $MONTH_FILE" "block"
  else
    gate_result "metrics_collected" "指标采集" "fail" "missing fields: ${MISSING[*]}" "block"
  fi
else
  gate_result "metrics_collected" "指标采集" "fail" "metrics file not found: $MONTH_FILE" "block"
fi

# ---------- Gate 3: lessons_captured (经验沉淀) ----------
LESSONS_DIR="$WORKSPACE/skills/project-mgmt/lessons"
# Look for lesson file matching today or sprint id
LESSON_FILE=$(find "$LESSONS_DIR" -name "*.md" -newer "$METRICS_DIR/../PROJECT-TRACKER.md" 2>/dev/null | head -1)
if [ -z "$LESSON_FILE" ]; then
  LESSON_FILE="$LESSONS_DIR/$(date +%Y-%m-%d)-sprint.md"
fi

if [ -f "$LESSON_FILE" ]; then
  REQUIRED_SECTIONS=("目标vs实际" "做对了什么" "做错了什么" "流程改进点")
  MISSING_SEC=()
  for sec in "${REQUIRED_SECTIONS[@]}"; do
    if ! grep -q "$sec" "$LESSON_FILE" 2>/dev/null; then
      MISSING_SEC+=("$sec")
    fi
  done
  if [ ${#MISSING_SEC[@]} -eq 0 ]; then
    gate_result "lessons_captured" "经验沉淀" "pass" "all required sections present" "block"
  else
    gate_result "lessons_captured" "经验沉淀" "fail" "missing sections: ${MISSING_SEC[*]}" "block"
  fi
else
  gate_result "lessons_captured" "经验沉淀" "fail" "no lesson file found for sprint" "block"
fi

# ---------- Gate 4: tribunal_verdict (裁决殿裁决) ----------
VERDICT_DIR="$WORKSPACE/skills/isc-core/rulings"
LATEST_VERDICT=$(find "$VERDICT_DIR" -name "*.json" -newer /proc/1 2>/dev/null | sort -r | head -1)
if [ -n "$LATEST_VERDICT" ] && [ -f "$LATEST_VERDICT" ]; then
  if grep -qE '"verdict"\s*:\s*"(approved|conditional)"' "$LATEST_VERDICT" 2>/dev/null; then
    gate_result "tribunal_verdict" "裁决殿裁决" "pass" "tribunal verdict found" "warn_with_escalation"
  else
    gate_result "tribunal_verdict" "裁决殿裁决" "warn" "tribunal verdict is rejection or unrecognized" "warn_with_escalation"
  fi
else
  gate_result "tribunal_verdict" "裁决殿裁决" "warn" "no tribunal verdict found — escalation recommended" "warn_with_escalation"
fi

# ---------- Verdict ----------
echo "{"
echo "  \"rule_id\": \"$RULE_ID\","
echo "  \"event\": \"$EVENT\","
echo "  \"sprint_id\": \"$SPRINT_ID\","
echo "  \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\","
echo "  \"gates_passed\": $PASS,"
echo "  \"gates_failed\": $FAIL,"
echo "  \"gates_warned\": $WARN,"
echo "  \"gates\": [$(IFS=,; echo "${RESULTS[*]}")],"

if [ "$FAIL" -gt 0 ]; then
  echo "  \"verdict\": \"blocked\","
  echo "  \"emit\": \"sprint.closure.rejected\","
  echo "  \"message\": \"Sprint closure blocked — $FAIL gate(s) failed. Fix before closing.\""
else
  echo "  \"verdict\": \"approved\","
  echo "  \"emit\": \"sprint.closure.approved\","
  echo "  \"message\": \"Sprint closure approved ($WARN warning(s)).\""
fi
echo "}"

# Exit with failure if any blocking gate failed
[ "$FAIL" -eq 0 ]
