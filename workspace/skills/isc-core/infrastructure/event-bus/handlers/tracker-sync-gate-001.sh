#!/usr/bin/env bash
# Handler: rule.tracker-sync-gate-001 — PROJECT-TRACKER 同步门禁
# Priority: P0 (block on failure)
# Trigger events: task.status.changed, task.created, task.expanded,
#                 subtask.created, sprint.started, sprint.completed
#
# This handler ensures every task state change is reflected in PROJECT-TRACKER.md.
# TRACKER is the single source of truth; desync = state loss.

set -euo pipefail

RULE_ID="rule.tracker-sync-gate-001"
EVENT="${ISC_EVENT:-unknown}"
TASK_ID="${ISC_TASK_ID:-}"
NEW_STATUS="${ISC_NEW_STATUS:-}"
TRACKER_FILE="${ISC_TRACKER_FILE:-/root/.openclaw/workspace/PROJECT-TRACKER.md}"

# Status emoji mapping
declare -A STATUS_MAP=(
  [open]="📋"
  [doing]="⏳"
  [done]="✅"
  [blocked]="🔴"
  [rejected]="❌"
)

log() { echo "[${RULE_ID}] $(date +%H:%M:%S) $*"; }

# --- Guard ---
if [[ ! -f "$TRACKER_FILE" ]]; then
  log "ERROR: TRACKER file not found: $TRACKER_FILE"
  exit 1
fi

# --- Event dispatch ---
case "$EVENT" in

  task.created)
    EMOJI="${STATUS_MAP[open]}"
    log "Adding new task $TASK_ID to TRACKER with status $EMOJI"
    # Append to tracker under active tasks section
    echo "| ${TASK_ID} | ${EMOJI} 待启动 | $(date +%Y-%m-%d) | — |" >> "$TRACKER_FILE"
    ;;

  task.status.changed)
    if [[ -z "$NEW_STATUS" ]]; then
      log "ERROR: ISC_NEW_STATUS not set"
      exit 1
    fi
    EMOJI="${STATUS_MAP[$NEW_STATUS]:-❓}"
    log "Updating $TASK_ID → $EMOJI ($NEW_STATUS)"
    # In-place update: find task row and replace status
    if grep -q "| ${TASK_ID} |" "$TRACKER_FILE"; then
      sed -i "s/| ${TASK_ID} | [^ ]* /| ${TASK_ID} | ${EMOJI} ${NEW_STATUS} /" "$TRACKER_FILE"
    else
      log "WARN: task $TASK_ID not found in TRACKER — appending"
      echo "| ${TASK_ID} | ${EMOJI} ${NEW_STATUS} | $(date +%Y-%m-%d) | auto-added |" >> "$TRACKER_FILE"
    fi
    ;;

  task.expanded|subtask.created)
    PARENT_ID="${ISC_PARENT_ID:-$TASK_ID}"
    SUBTASK_ID="${ISC_SUBTASK_ID:-${TASK_ID}-sub}"
    log "Expanding: adding subtask $SUBTASK_ID under $PARENT_ID"
    # Insert subtask row after parent
    sed -i "/| ${PARENT_ID} |/a | └─ ${SUBTASK_ID} | 📋 待启动 | $(date +%Y-%m-%d) | 自动扩列 |" "$TRACKER_FILE"
    ;;

  sprint.started)
    SPRINT="${ISC_SPRINT:-??}"
    log "Sprint $SPRINT started — marking in TRACKER"
    echo "" >> "$TRACKER_FILE"
    echo "### Sprint ${SPRINT} — Started $(date +%Y-%m-%d)" >> "$TRACKER_FILE"
    ;;

  sprint.completed)
    SPRINT="${ISC_SPRINT:-??}"
    log "Sprint $SPRINT completed — archiving in TRACKER"
    echo "" >> "$TRACKER_FILE"
    echo "### Sprint ${SPRINT} — ✅ Completed $(date +%Y-%m-%d)" >> "$TRACKER_FILE"
    ;;

  *)
    log "WARN: unhandled event '$EVENT'"
    ;;
esac

# --- Desync check ---
# If a task JSON exists, verify TRACKER reflects it
TASK_JSON="${ISC_TASK_JSON:-}"
if [[ -n "$TASK_JSON" && -f "$TASK_JSON" ]]; then
  JSON_STATUS=$(jq -r '.status // empty' "$TASK_JSON" 2>/dev/null || true)
  if [[ -n "$JSON_STATUS" ]]; then
    EXPECTED_EMOJI="${STATUS_MAP[$JSON_STATUS]:-}"
    if [[ -n "$EXPECTED_EMOJI" ]] && ! grep -q "| ${TASK_ID} | ${EXPECTED_EMOJI}" "$TRACKER_FILE"; then
      log "DESYNC detected for $TASK_ID: JSON=$JSON_STATUS, TRACKER doesn't match"
      log "Auto-fixing..."
      sed -i "s/| ${TASK_ID} | [^ ]* /| ${TASK_ID} | ${EXPECTED_EMOJI} ${JSON_STATUS} /" "$TRACKER_FILE"
      # Emit desync event for downstream
      echo "{\"event\":\"tracker.desync.detected\",\"task\":\"${TASK_ID}\",\"expected\":\"${JSON_STATUS}\"}"
    fi
  fi
fi

log "Handler complete for event=$EVENT task=$TASK_ID"
exit 0
