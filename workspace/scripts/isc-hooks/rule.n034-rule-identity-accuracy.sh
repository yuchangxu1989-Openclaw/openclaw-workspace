#!/usr/bin/env bash
# rule.n034-rule-identity-accuracy — rule_identity_accuracy_validation
# 从文件系统实际扫描规则数量，与id字段交叉校验
RULE_ID="rule.n034-rule-identity-accuracy"
RULES_DIR="/root/.openclaw/workspace/skills/isc-core/rules"
FAIL=0

RESULT=$(python3 -c "
import json,os,sys
rules_dir='$RULES_DIR'
total=0; id_mismatch=[]
for f in sorted(os.listdir(rules_dir)):
  if not f.endswith('.json'): continue
  fp=os.path.join(rules_dir,f)
  if os.path.isdir(fp): continue
  total+=1
  try:
    r=json.load(open(fp))
    rid=r.get('id',r.get('rule_id',''))
    if not rid: id_mismatch.append(f+':no_id')
  except: id_mismatch.append(f+':parse_error')
if id_mismatch:
  print(f'total={total},issues={\";\".join(id_mismatch[:5])}')
  sys.exit(1)
else:
  print(f'total={total},all_valid')
  sys.exit(0)
" 2>&1)

if [ $? -ne 0 ]; then
  echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"fail\",\"detail\":\"$RESULT\"}"
  exit 1
else
  echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"pass\",\"detail\":\"$RESULT\"}"
  exit 0
fi
