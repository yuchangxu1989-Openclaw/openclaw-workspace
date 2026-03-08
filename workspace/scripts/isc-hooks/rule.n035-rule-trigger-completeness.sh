#!/usr/bin/env bash
# rule.n035-rule-trigger-completeness — rule_trigger_completeness_monitor
# 检查所有规则是否有完整的trigger定义
RULE_ID="rule.n035-rule-trigger-completeness"
RULES_DIR="/root/.openclaw/workspace/skills/isc-core/rules"

RESULT=$(python3 -c "
import json,os,sys
rules_dir='$RULES_DIR'
total=0; missing_trigger=[]
for f in sorted(os.listdir(rules_dir)):
  if not f.endswith('.json'): continue
  fp=os.path.join(rules_dir,f)
  if os.path.isdir(fp): continue
  total+=1
  try:
    r=json.load(open(fp))
    trigger=r.get('trigger',{})
    events=trigger.get('events',trigger.get('event'))
    if not events:
      missing_trigger.append(r.get('id',r.get('rule_id',f)))
  except: missing_trigger.append(f+':parse_error')
if missing_trigger:
  print(f'total={total},missing_trigger={len(missing_trigger)}:{\";\".join(missing_trigger[:5])}')
  sys.exit(1)
else:
  print(f'total={total},all_have_triggers')
  sys.exit(0)
" 2>&1)

if [ $? -ne 0 ]; then
  echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"fail\",\"detail\":\"$RESULT\"}"
  exit 1
else
  echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"pass\",\"detail\":\"$RESULT\"}"
  exit 0
fi
