#!/usr/bin/env bash
set -euo pipefail

TARGET_FILE="${1:-PROJECT-TRACKER.md}"
NOW_TS="${NOW_TS:-$(date +%s)}"
THRESHOLD_HOURS="${THRESHOLD_HOURS:-48}"
THRESHOLD_SEC=$((THRESHOLD_HOURS*3600))

if [[ ! -f "$TARGET_FILE" ]]; then
  echo '{"ok":false,"error":"PROJECT-TRACKER.md not found","alerts":[]}'
  exit 2
fi

alerts_json="[]"
while IFS= read -r line; do
  d="$(echo "$line" | grep -Eo '[0-9]{4}-[0-9]{2}-[0-9]{2}' | head -n1 || true)"
  [[ -z "$d" ]] && continue
  if ts=$(date -d "$d" +%s 2>/dev/null); then
    age=$((NOW_TS-ts))
    if (( age > THRESHOLD_SEC )); then
      hours=$((age/3600))
      esc=$(printf '%s' "$line" | sed 's/"/\\"/g')
      alerts_json=$(printf '%s' "$alerts_json" | jq --arg line "$esc" --arg date "$d" --argjson age_hours "$hours" '. + [{line:$line,last_update:$date,age_hours:$age_hours}]')
    fi
  fi
done < "$TARGET_FILE"

count=$(printf '%s' "$alerts_json" | jq 'length')
if (( count > 0 )); then
  jq -n --arg file "$TARGET_FILE" --argjson count "$count" --argjson alerts "$alerts_json" '{ok:false,file:$file,stale_count:$count,alerts:$alerts}'
  exit 1
else
  jq -n --arg file "$TARGET_FILE" '{ok:true,file:$file,stale_count:0,alerts:[]}'
  exit 0
fi
