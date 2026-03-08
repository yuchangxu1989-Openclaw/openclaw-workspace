#!/usr/bin/env bash
# rule.cron-task-model-requirement-001 — cron_task_model_requirement
# 检查openclaw cron任务是否都指定了model
RULE_ID="rule.cron-task-model-requirement-001"
CONFIG="/root/.openclaw/openclaw.json"
FAIL=0
DETAIL=""

if [ ! -f "$CONFIG" ]; then
  echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"pass\",\"detail\":\"openclaw.json不存在，无cron任务\"}"
  exit 0
fi

# 检查cron任务是否有model字段
CRON_WITHOUT_MODEL=$(python3 -c "
import json,sys
try:
  cfg=json.load(open('$CONFIG'))
  crons=cfg.get('cron',cfg.get('crons',[]))
  if isinstance(crons,dict): crons=list(crons.values())
  missing=[c.get('label','unknown') for c in crons if not c.get('model')]
  if missing: print(','.join(missing)); sys.exit(1)
  else: sys.exit(0)
except Exception as e: print(str(e)); sys.exit(0)
" 2>&1)

if [ $? -ne 0 ]; then
  echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"fail\",\"detail\":\"缺少model的cron任务: ${CRON_WITHOUT_MODEL}\"}"
  exit 1
else
  echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"pass\",\"detail\":\"所有cron任务均已指定model\"}"
  exit 0
fi
