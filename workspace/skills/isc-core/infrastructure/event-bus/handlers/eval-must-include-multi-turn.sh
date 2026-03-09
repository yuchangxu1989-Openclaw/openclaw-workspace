#!/usr/bin/env bash
# Handler: rule.eval-must-include-multi-turn-001
# Events:  aeo.evaluation.dataset_created, aeo.evaluation.dataset_modified
# Action:  1) Validate multi-turn ratio ≥ 40%
#          2) If dataset changed, trigger benchmark auto-rerun
#
# Expects JSON payload on stdin with:
#   "dataset_path" (string) — path to eval dataset (JSONL)
#   "event" (string) — triggering event name

set -euo pipefail

RULE_ID="rule.eval-must-include-multi-turn-001"
MIN_MULTI_TURN_RATIO=40  # percent

payload=$(cat)
dataset_path=$(echo "$payload" | jq -r '.dataset_path')
event_name=$(echo "$payload" | jq -r '.event // "unknown"')

if [ ! -f "$dataset_path" ]; then
  echo '{"status":"error","rule":"'"$RULE_ID"'","message":"dataset not found: '"$dataset_path"'"}' >&2
  exit 1
fi

total=$(wc -l < "$dataset_path")
if [ "$total" -eq 0 ]; then
  echo '{"status":"error","rule":"'"$RULE_ID"'","message":"dataset is empty"}' >&2
  exit 1
fi

# Count multi-turn samples (lines where turns array length > 1)
multi_turn=$(jq -c 'select((.turns | length) > 1)' "$dataset_path" | wc -l)
ratio=$(( multi_turn * 100 / total ))

result_base='"rule":"'"$RULE_ID"'","total":'"$total"',"multi_turn":'"$multi_turn"',"ratio_pct":'"$ratio"

if [ "$ratio" -lt "$MIN_MULTI_TURN_RATIO" ]; then
  echo "[RULE $RULE_ID] BLOCKED: multi-turn ratio ${ratio}% < required ${MIN_MULTI_TURN_RATIO}%" >&2
  echo '{"status":"blocked",'"$result_base"',"required_pct":'"$MIN_MULTI_TURN_RATIO"'}'
  exit 1
fi

echo '{"status":"pass",'"$result_base"'}'

# --- Auto-rerun benchmark on dataset modification ---
if [ "$event_name" = "aeo.evaluation.dataset_modified" ]; then
  echo "[RULE $RULE_ID] Dataset modified → triggering benchmark rerun" >&2
  # Emit rerun event (downstream handler or CI picks this up)
  echo '{"event":"aeo.benchmark.auto_rerun","triggered_by":"'"$RULE_ID"'","dataset":"'"$dataset_path"'"}' >&2
fi

exit 0
