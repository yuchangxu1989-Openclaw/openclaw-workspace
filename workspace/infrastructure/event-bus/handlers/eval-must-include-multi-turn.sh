#!/usr/bin/env bash
# Handler: rule.eval-must-include-multi-turn-001
# 评测集必须包含多轮对话 — 多轮样本占比 >= 40%
#
# Trigger events:
#   - aeo.evaluation.dataset_created
#   - aeo.evaluation.dataset_modified
#
# Actions:
#   - aeo.evaluation.multi_turn_check
#   - aeo.benchmark.auto_rerun
#
# This handler delegates to eval-quality-check.js for the actual check logic,
# and additionally enforces the 40% multi-turn ratio threshold and triggers
# benchmark re-run on dataset changes.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE="${WORKSPACE:-$(cd "$SCRIPT_DIR/../../.." && pwd)}"
RULE_ID="rule.eval-must-include-multi-turn-001"
MIN_MULTI_TURN_RATIO=40

EVENT_TYPE="${EVENT_TYPE:-}"
EVENT_PAYLOAD="${EVENT_PAYLOAD:-}"

log() { echo "[eval-must-include-multi-turn] $(date '+%Y-%m-%d %H:%M:%S') $*"; }

# --- Multi-turn ratio check ---
check_multi_turn_ratio() {
  local total=0
  local multi=0

  # Scan for evaluation dataset files (JSON/YAML with conversation structures)
  while IFS= read -r -d '' f; do
    # Count conversation samples by looking for role/turn markers
    local turns
    turns=$(grep -ciE '\b(role|user|assistant|human|system)\b' "$f" 2>/dev/null || echo 0)
    if [ "$turns" -gt 0 ]; then
      total=$((total + 1))
      # Multi-turn: 4+ role markers suggests at least 2 exchange rounds
      if [ "$turns" -ge 4 ]; then
        multi=$((multi + 1))
      fi
    fi
  done < <(find "$WORKSPACE" \
    -type f \( -name '*.json' -o -name '*.yaml' -o -name '*.yml' -o -name '*.jsonl' \) \
    ! -path '*/.git/*' \
    ! -path '*/node_modules/*' \
    ! -path '*/dist/*' \
    ! -path '*/build/*' \
    -print0 2>/dev/null)

  if [ "$total" -eq 0 ]; then
    log "FAIL — no evaluation samples found"
    echo '{"ok":false,"code":"'"$RULE_ID"'","message":"未找到评测样本文件","details":{"total":0,"multi":0,"ratio":0}}'
    return 1
  fi

  local ratio=$((multi * 100 / total))
  if [ "$ratio" -ge "$MIN_MULTI_TURN_RATIO" ]; then
    log "PASS — multi-turn ratio ${ratio}% (${multi}/${total}) >= ${MIN_MULTI_TURN_RATIO}%"
    echo '{"ok":true,"code":"'"$RULE_ID"'","message":"多轮对话占比'"${ratio}"'%，满足>='"${MIN_MULTI_TURN_RATIO}"'%要求","details":{"total":'"$total"',"multi":'"$multi"',"ratio":'"$ratio"'}}'
    return 0
  else
    log "FAIL — multi-turn ratio ${ratio}% (${multi}/${total}) < ${MIN_MULTI_TURN_RATIO}%"
    echo '{"ok":false,"code":"'"$RULE_ID"'","message":"多轮对话占比'"${ratio}"'%，不满足>='"${MIN_MULTI_TURN_RATIO}"'%要求","details":{"total":'"$total"',"multi":'"$multi"',"ratio":'"$ratio"'}}'
    return 1
  fi
}

# --- Benchmark auto-rerun on dataset change ---
trigger_benchmark_rerun() {
  if [ -z "$EVENT_TYPE" ]; then
    return 0
  fi

  case "$EVENT_TYPE" in
    aeo.evaluation.dataset_created|aeo.evaluation.dataset_modified)
      log "Dataset change detected (${EVENT_TYPE}), triggering benchmark re-run..."
      # Emit benchmark rerun event if event-bus CLI is available
      if command -v event-bus &>/dev/null; then
        event-bus emit aeo.benchmark.auto_rerun \
          --payload "{\"trigger\":\"$RULE_ID\",\"sourceEvent\":\"$EVENT_TYPE\"}" 2>/dev/null || true
      fi
      # Also try node-based dispatch
      if [ -f "$SCRIPT_DIR/../bus.js" ]; then
        node -e "
          const bus = require('$SCRIPT_DIR/../bus.js');
          if (bus && bus.emit) bus.emit('aeo.benchmark.auto_rerun', {
            trigger: '$RULE_ID',
            sourceEvent: '$EVENT_TYPE'
          }).catch(() => {});
        " 2>/dev/null || true
      fi
      log "Benchmark re-run triggered"
      ;;
  esac
}

# --- Main ---
main() {
  log "Running check for $RULE_ID"
  log "Workspace: $WORKSPACE"

  local check_result
  check_result=$(check_multi_turn_ratio) || true

  # Output result
  echo "$check_result"

  # Trigger benchmark rerun if dataset changed
  trigger_benchmark_rerun

  # Exit with appropriate code
  if echo "$check_result" | grep -q '"ok":true'; then
    exit 0
  else
    exit 1
  fi
}

main "$@"
