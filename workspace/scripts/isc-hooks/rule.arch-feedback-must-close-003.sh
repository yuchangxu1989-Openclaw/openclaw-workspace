#!/usr/bin/env bash
# Handler: rule.arch-feedback-must-close-003
# 反馈必须闭环 — 检测反馈事件后是否有闭环动作
set -euo pipefail

RULE_ID="rule.arch-feedback-must-close-003"
WORKSPACE="${WORKSPACE:-$(git rev-parse --show-toplevel 2>/dev/null || echo .)}"
EVENTS_FILE="$WORKSPACE/infrastructure/event-bus/events.jsonl"
STATUS="pass"
OPEN_FEEDBACKS=()

if [ ! -f "$EVENTS_FILE" ]; then
  printf '{"rule_id":"%s","status":"skip","detail":"events.jsonl not found"}\n' "$RULE_ID"
  exit 0
fi

# Find feedback/report events without corresponding close/resolve events
python3 - "$EVENTS_FILE" << 'PY'
import json, sys

events_file = sys.argv[1]
feedback_events = []
closed_ids = set()
open_feedbacks = []

with open(events_file, 'r') as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        try:
            evt = json.loads(line)
        except:
            continue
        etype = evt.get('type', '')
        eid = evt.get('id', '')
        payload = evt.get('payload', {})
        
        # Track feedback/report/orphan events
        if any(k in etype for k in ['feedback', 'report', 'orphan', 'issue']):
            feedback_events.append({'id': eid, 'type': etype, 'ts': evt.get('timestamp', 0)})
        
        # Track resolution events
        if any(k in etype for k in ['resolved', 'closed', 'acknowledged', 'consumed']):
            consumed = evt.get('consumed_by', [])
            closed_ids.add(eid)
            for c in consumed:
                closed_ids.add(c)

# Check which feedbacks have no closure
for fb in feedback_events:
    consumed_by = []
    if fb['id'] not in closed_ids:
        open_feedbacks.append(fb['type'])

status = 'fail' if open_feedbacks else 'pass'
detail = f"{len(feedback_events)} feedback events, {len(open_feedbacks)} unclosed"
result = {
    'rule_id': 'rule.arch-feedback-must-close-003',
    'status': status,
    'detail': detail,
    'open_feedbacks': open_feedbacks[:20]
}
print(json.dumps(result, ensure_ascii=False))
PY
