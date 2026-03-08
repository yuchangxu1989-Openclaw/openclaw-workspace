#!/usr/bin/env bash
# rule.isc-rule-creation-dedup-gate-001 — ISC规则创建去重门禁
# 扫描rules目录，检测是否有event重叠的规则对
RULE_ID="rule.isc-rule-creation-dedup-gate-001"
RULES_DIR="/root/.openclaw/workspace/skills/isc-core/rules"
FAIL=0
DETAIL=""

# 提取所有规则的events，检测完全相同的event集合
DUPES=$(python3 -c "
import json,os,sys
from collections import defaultdict
rules_dir='$RULES_DIR'
event_map=defaultdict(list)
for f in os.listdir(rules_dir):
  if not f.endswith('.json'): continue
  fp=os.path.join(rules_dir,f)
  try:
    r=json.load(open(fp))
    trigger=r.get('trigger',{})
    events=trigger.get('events',[])
    if isinstance(events,dict):
      evs=[]
      for v in events.values():
        evs.extend(v if isinstance(v,list) else [v])
      events=evs
    if not isinstance(events,list): events=[events]
    key=','.join(sorted(str(e) for e in events if isinstance(e,str)))
    if key: event_map[key].append(r.get('id',f))
  except: pass
dupes={k:v for k,v in event_map.items() if len(v)>1}
if dupes:
  for k,v in list(dupes.items())[:3]:
    print(f'{\"|\".join(v[:3])}')
  sys.exit(1)
" 2>&1)

if [ $? -ne 0 ] && [ -n "$DUPES" ]; then
  echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"fail\",\"detail\":\"发现event重叠规则对: $(echo $DUPES | tr '\n' '; ')\"}"
  exit 1
else
  echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"pass\",\"detail\":\"未发现完全重复的规则\"}"
  exit 0
fi
