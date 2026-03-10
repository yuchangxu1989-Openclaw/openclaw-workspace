#!/usr/bin/env bash
# ISC Handler: rule.project-tracker-hygiene-001
# Scans PROJECT-TRACKER.md for tasks not updated in >48h, outputs JSON alert list.
set -euo pipefail

TRACKER="${1:-/root/.openclaw/workspace/PROJECT-TRACKER.md}"
THRESHOLD_HOURS=48
NOW_EPOCH=$(date +%s)

# --- Input validation ---
if [[ ! -f "$TRACKER" ]]; then
  echo '{"status":"error","message":"PROJECT-TRACKER.md not found","alerts":[]}'
  exit 2
fi

# --- Parse and check ---
# Expected line format (markdown table row):
#   | Task ID | Description | Status | Owner | Updated |
# Updated column: YYYY-MM-DD or YYYY-MM-DD HH:MM
# We look for table rows with a date-like pattern in the last substantive column.

alerts_json="[]"
alert_count=0

while IFS= read -r line; do
  # Skip non-table or header/separator rows
  [[ "$line" != \|* ]] && continue
  echo "$line" | grep -qE '^\|[\s-]+\|' && continue

  # Extract columns (trim whitespace)
  cols=()
  while IFS='|' read -ra parts; do
    for p in "${parts[@]}"; do
      trimmed="$(echo "$p" | xargs 2>/dev/null || true)"
      [[ -n "$trimmed" ]] && cols+=("$trimmed")
    done
  done <<< "$line"

  # Need at least 5 columns: ID, Desc, Status, Owner, Updated
  (( ${#cols[@]} < 5 )) && continue

  task_id="${cols[0]}"
  description="${cols[1]}"
  status="${cols[2]}"
  updated_raw="${cols[4]}"

  # Skip header row
  [[ "$task_id" == "Task ID" || "$task_id" == "ID" || "$task_id" =~ ^-+$ ]] && continue

  # Try to parse date
  updated_epoch=""
  if [[ "$updated_raw" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2} ]]; then
    updated_epoch=$(date -d "$updated_raw" +%s 2>/dev/null || true)
  fi

  if [[ -z "$updated_epoch" ]]; then
    # Can't parse date — flag it
    alerts_json=$(echo "$alerts_json" | python3 -c "
import sys,json
a=json.load(sys.stdin)
a.append({'task_id':'$task_id','description':'$description','status':'$status','updated':'$updated_raw','reason':'unparseable_date','stale_hours':null})
json.dump(a,sys.stdout)")
    ((alert_count++)) || true
    continue
  fi

  diff_sec=$(( NOW_EPOCH - updated_epoch ))
  diff_hours=$(( diff_sec / 3600 ))

  if (( diff_hours > THRESHOLD_HOURS )); then
    alerts_json=$(echo "$alerts_json" | python3 -c "
import sys,json
a=json.load(sys.stdin)
a.append({'task_id':'$task_id','description':'$description','status':'$status','updated':'$updated_raw','reason':'stale_over_48h','stale_hours':$diff_hours})
json.dump(a,sys.stdout)")
    ((alert_count++)) || true
  fi
done < "$TRACKER"

# --- Output ---
if (( alert_count > 0 )); then
  echo "$alerts_json" | python3 -c "
import sys,json
a=json.load(sys.stdin)
print(json.dumps({'status':'violation','rule':'rule.project-tracker-hygiene-001','alert_count':len(a),'threshold_hours':48,'alerts':a},indent=2))"
  exit 1
else
  echo '{"status":"pass","rule":"rule.project-tracker-hygiene-001","alert_count":0,"threshold_hours":48,"alerts":[]}'
  exit 0
fi
