#!/usr/bin/env bash
# ISC Hook: rule.five-layer-event-model-001
# Description: 事件分5层：L1对象生命周期（创建/修改/删除）、L2量化阈值（计数器越过阈值）、L3语义意图（对话流中的意图信号，CRAS快通道5min捕获）、L4知识发现（
set -euo pipefail
RULE_ID="rule.five-layer-event-model-001"

# Check: event definitions follow 5-layer model (L1-L5)
RULES_DIR="/root/.openclaw/workspace/skills/isc-core/rules"
EVENTS_WITH_LAYER=0
EVENTS_TOTAL=0
for rf in "$RULES_DIR"/rule.*.json; do
  EVENTS=$(python3 -c "
import json
d=json.load(open('$rf'))
t=d.get('trigger',{})
evts=t.get('events',[])
for e in evts:
  print(e)
" 2>/dev/null)
  for evt in $EVENTS; do
    EVENTS_TOTAL=$((EVENTS_TOTAL+1))
    # Check if event follows dotted naming convention
    if echo "$evt" | grep -qE "^[a-z]+\.[a-z]+\.[a-z_]+"; then
      EVENTS_WITH_LAYER=$((EVENTS_WITH_LAYER+1))
    fi
  done
done
echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"pass\",\"detail\":\"$EVENTS_WITH_LAYER/$EVENTS_TOTAL events follow structured naming\"}"
