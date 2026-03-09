#!/usr/bin/env bash
# Handler: rule.eval-batch-size-limit-001
# Event:   eval.batch.requested
# Action:  Block batches > 10, auto-split into sub-batches of ≤10
#
# Expects JSON payload on stdin with field "batch_size" (integer)
# and "items" (array of eval items).

set -euo pipefail

RULE_ID="rule.eval-batch-size-limit-001"
MAX_BATCH=10
VIOLATION_CODE="BADCASE-EVAL-BATCH-OVERSIZE"

payload=$(cat)
batch_size=$(echo "$payload" | jq -r '.batch_size // (.items | length)')

if [ "$batch_size" -le "$MAX_BATCH" ]; then
  echo '{"status":"pass","rule":"'"$RULE_ID"'","batch_size":'"$batch_size"'}'
  exit 0
fi

# --- Violation: block and split ---
echo "[RULE $RULE_ID] BLOCKED: batch_size=$batch_size exceeds max=$MAX_BATCH (violation=$VIOLATION_CODE)" >&2

# Split items into sub-batches
num_batches=$(( (batch_size + MAX_BATCH - 1) / MAX_BATCH ))
echo "$payload" | jq -c --argjson max "$MAX_BATCH" '{
  status: "blocked_and_split",
  rule: "'"$RULE_ID"'",
  violation: "'"$VIOLATION_CODE"'",
  original_size: (.items | length),
  sub_batches: [range(0; ((.items | length) + $max - 1) / $max | floor) as $i
    | {batch_index: $i, items: .items[$i * $max : ($i + 1) * $max]}]
}'

exit 1
