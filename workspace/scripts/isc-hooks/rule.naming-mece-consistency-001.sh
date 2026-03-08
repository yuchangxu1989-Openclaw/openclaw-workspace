#!/usr/bin/env bash
set -euo pipefail
RULE_ID="rule.naming-mece-consistency-001"
WORKSPACE="/root/.openclaw/workspace"

# 检测: 同层级实体命名是否MECE(互斥且完整)
RULES_DIR="$WORKSPACE/skills/isc-core/rules"
python3 -c "
import json,glob,re
files=sorted(glob.glob('$RULES_DIR/rule.*.json'))
domains={}
for f in files:
  try:
    d=json.load(open(f))
    dom=d.get('domain','unknown')
    name=d.get('name',d.get('rule_name',''))
    domains.setdefault(dom,[]).append(name)
  except: pass
issues=[]
for dom,names in domains.items():
  words=[set(re.findall(r'[a-zA-Z一-鿿]+',n.lower())) for n in names]
  for i in range(len(words)):
    for j in range(i+1,len(words)):
      if len(words[i])>2 and len(words[j])>2:
        overlap=len(words[i]&words[j])/min(len(words[i]),len(words[j]))
        if overlap>0.7:
          issues.append(f'{names[i]} ~ {names[j]}')
if issues:
  print(json.dumps({'rule_id':'$RULE_ID','status':'fail','detail':'MECE violations: '+'; '.join(issues[:5])}))
else:
  print(json.dumps({'rule_id':'$RULE_ID','status':'pass','detail':'No MECE naming violations detected'}))
"

