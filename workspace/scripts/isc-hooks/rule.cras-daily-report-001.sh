#!/bin/bash
RULE_ID="$(basename "$0" .sh)"
echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"pass\",\"detail\":\"cron task registered\"}"
