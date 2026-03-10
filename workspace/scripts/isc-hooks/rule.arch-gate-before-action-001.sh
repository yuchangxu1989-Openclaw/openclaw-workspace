#!/usr/bin/env bash
# Handler: rule.arch-gate-before-action-001
# 重大行动前必须有门禁审查 — 检查重大操作(发布/部署/规则创建)前是否经过gate-check
set -euo pipefail

RULE_ID="rule.arch-gate-before-action-001"
WORKSPACE="${WORKSPACE:-$(git rev-parse --show-toplevel 2>/dev/null || echo .)}"
STATUS="pass"
UNGATED=()

# Check 1: Rules without quality_gate in trigger.actions
for rule_file in "$WORKSPACE"/skills/isc-core/rules/*.json; do
  [ -f "$rule_file" ] || continue
  python3 -c "
import json,sys
d=json.load(open('$rule_file'))
tid=d.get('id','')
trigger=d.get('trigger',{})
actions=trigger.get('actions',[])
action_types=[a.get('type','') for a in actions if isinstance(a,dict)]
# Major actions that need gates
events=trigger.get('events',[])
if isinstance(events,dict):
    all_evts=[]
    for v in events.values():
        if isinstance(v,list): all_evts.extend(v)
    events=all_evts
is_major=any(k in str(events) for k in ['published','deployed','created','closure'])
has_gate=any(k in str(action_types) for k in ['gate','check','block','review'])
if is_major and not has_gate:
    print(tid)
" 2>/dev/null && continue
  RESULT=$(python3 -c "
import json,sys
d=json.load(open('$rule_file'))
tid=d.get('id','')
trigger=d.get('trigger',{})
actions=trigger.get('actions',[])
action_types=[a.get('type','') for a in actions if isinstance(a,dict)]
events=trigger.get('events',[])
if isinstance(events,dict):
    all_evts=[]
    for v in events.values():
        if isinstance(v,list): all_evts.extend(v)
    events=all_evts
is_major=any(k in str(events) for k in ['published','deployed','created','closure'])
has_gate=any(k in str(action_types) for k in ['gate','check','block','review'])
if is_major and not has_gate:
    print(tid)
" 2>/dev/null || true)
  if [ -n "$RESULT" ]; then
    UNGATED+=("$RESULT")
    STATUS="fail"
  fi
done

# Check 2: Recent git commits for deployment/publish without gate tag
RECENT_COMMITS=$(git -C "$WORKSPACE" log --oneline -20 --format="%s" 2>/dev/null || true)
DEPLOY_NO_GATE=$(echo "$RECENT_COMMITS" | grep -iE 'deploy|publish|release' | grep -viE 'gate|review|approved' || true)
if [ -n "$DEPLOY_NO_GATE" ]; then
  while IFS= read -r line; do
    [ -n "$line" ] && UNGATED+=("commit: $line")
  done <<< "$DEPLOY_NO_GATE"
  STATUS="fail"
fi

DETAIL="${#UNGATED[@]} ungated major actions found"
UNGATED_JSON=$(printf '%s\n' "${UNGATED[@]}" 2>/dev/null | python3 -c "import sys,json;print(json.dumps([l.strip() for l in sys.stdin if l.strip()]))" 2>/dev/null || echo '[]')
printf '{"rule_id":"%s","status":"%s","detail":"%s","ungated_actions":%s}\n' "$RULE_ID" "$STATUS" "$DETAIL" "$UNGATED_JSON"
