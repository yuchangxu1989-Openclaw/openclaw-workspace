#!/usr/bin/env bash
set -euo pipefail
RULE_ID="rule.isc-rule-modified-dedup-scan-001"
WORKSPACE="/root/.openclaw/workspace"

# 检测: 规则间是否存在描述高度相似(简单词袋重叠检测)
RULES_DIR="$WORKSPACE/skills/isc-core/rules"
python3 -c "
import json,glob,sys
files=sorted(glob.glob('$RULES_DIR/rule.*.json'))
descs={}
for f in files:
  try:
    d=json.load(open(f))
    descs[f]=set(str(d.get('description','')).split())
  except: pass
dupes=[]
keys=list(descs.keys())
for i in range(len(keys)):
  for j in range(i+1,len(keys)):
    a,b=descs[keys[i]],descs[keys[j]]
    if len(a)>3 and len(b)>3:
      overlap=len(a&b)/min(len(a),len(b))
      if overlap>0.8:
        dupes.append(keys[i].split('/')[-1]+' ~ '+keys[j].split('/')[-1])
if dupes:
  print(json.dumps({'rule_id':'$RULE_ID','status':'fail','detail':'Potential duplicates: '+'; '.join(dupes[:5])}))
else:
  print(json.dumps({'rule_id':'$RULE_ID','status':'pass','detail':'No high-overlap rule pairs detected'}))
"

