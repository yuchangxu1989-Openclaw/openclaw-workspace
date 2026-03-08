#!/usr/bin/env bash
# ISC Hook: rule.day2-gap1-cron-event-bridge
set -euo pipefail
RULE_ID="rule.day2-gap1-cron-event-bridge"
CRON_ENTRIES=$(crontab -l 2>/dev/null | grep -v "^#" | grep -v "^$" | wc -l)
CRON_ENTRIES=$(echo "$CRON_ENTRIES" | tr -d '[:space:]')
EVENT_ROUTED=$(crontab -l 2>/dev/null | grep -c "event_bus\|openclaw.*emit\|isc-hook" || true)
EVENT_ROUTED=$(echo "$EVENT_ROUTED" | tr -d '[:space:]')
: "${CRON_ENTRIES:=0}"
: "${EVENT_ROUTED:=0}"
if [ "$CRON_ENTRIES" -gt 0 ] && [ "$EVENT_ROUTED" -lt "$CRON_ENTRIES" ]; then
  DIRECT=$((CRON_ENTRIES - EVENT_ROUTED))
  echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"fail\",\"detail\":\"$DIRECT/$CRON_ENTRIES cron entries bypass event bus\"}"
else
  echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"pass\",\"detail\":\"All $CRON_ENTRIES cron entries use event bus (or no cron entries)\"}"
fi
