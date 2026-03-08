#!/usr/bin/env bash
# rule.vectorization-standard-enforcement-001 — unified_vectorization_standard_enforcement
# 检查向量文件合规性：维度=1024，引擎=zhipu，无TF-IDF
RULE_ID="rule.vectorization-standard-enforcement-001"
VECTORS_DIR="/root/.openclaw/workspace/infrastructure/vector-service/vectors"
FAIL=0
VIOLATIONS=""

if [ ! -d "$VECTORS_DIR" ]; then
  echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"pass\",\"detail\":\"向量目录不存在，跳过\"}"
  exit 0
fi

# 检查向量文件合规性
RESULT=$(python3 -c "
import json,os,sys,glob
vdir='$VECTORS_DIR'
violations=[]
total=0
for f in glob.glob(os.path.join(vdir,'*.json')):
  total+=1
  try:
    v=json.load(open(f))
    engine=v.get('engine','')
    dim=v.get('dimension',0)
    if engine in ('tfidf','bge-m3','local'):
      violations.append(os.path.basename(f)+':prohibited_engine('+engine+')')
    if dim and dim!=1024:
      violations.append(os.path.basename(f)+':wrong_dim('+str(dim)+')')
  except: pass
if violations:
  print(f'total={total},violations={\";\".join(violations[:5])}')
  sys.exit(1)
else:
  print(f'total={total},all_compliant')
  sys.exit(0)
" 2>&1)

if [ $? -ne 0 ]; then
  echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"fail\",\"detail\":\"$RESULT\"}"
  exit 1
else
  echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"pass\",\"detail\":\"$RESULT\"}"
  exit 0
fi
