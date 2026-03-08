#!/usr/bin/env bash
# rule.isc-standard-format-001 — isc_standard_file_format
# 检查所有ISC规则文件是否符合统一格式标准
RULE_ID="rule.isc-standard-format-001"
RULES_DIR="/root/.openclaw/workspace/skills/isc-core/rules"
FAIL=0
VIOLATIONS=""

for rule_file in "$RULES_DIR"/rule.*.json; do
  [ ! -f "$rule_file" ] && continue
  fname=$(basename "$rule_file")
  
  # 检查必需字段: id, name, description, trigger
  MISSING=$(python3 -c "
import json,sys
r=json.load(open('$rule_file'))
missing=[]
for f in ['id','name','description']:
  if not r.get(f): missing.append(f)
if not r.get('trigger',{}).get('events') and not r.get('trigger',{}).get('event'):
  missing.append('trigger.events')
if missing: print(','.join(missing)); sys.exit(1)
" 2>&1)
  
  if [ $? -ne 0 ]; then
    VIOLATIONS="${VIOLATIONS}${fname}:missing(${MISSING}); "
    FAIL=1
  fi
done

if [ "$FAIL" -eq 1 ]; then
  echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"fail\",\"detail\":\"格式不合规: ${VIOLATIONS}\"}"
  exit 1
else
  echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"pass\",\"detail\":\"所有规则文件格式合规\"}"
  exit 0
fi
