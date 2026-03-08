#!/usr/bin/env bash
# rule.subagent-report-queue-001 — 子Agent报告队列
# 检查任务看板文件是否存在且格式正确
RULE_ID="rule.subagent-report-queue-001"
BOARD="/root/.openclaw/workspace/logs/subagent-task-board.json"

if [ ! -f "$BOARD" ]; then
  echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"pass\",\"detail\":\"任务看板不存在，无需检查\"}"
  exit 0
fi

# 验证JSON格式且检查是否有超时未完成的任务
RESULT=$(python3 -c "
import json,sys,time
board=json.load(open('$BOARD'))
tasks=board if isinstance(board,list) else board.get('tasks',[])
stale=[]
now=time.time()
for t in tasks:
  status=t.get('status','unknown')
  if status in ('pending','running'):
    created=t.get('createTime',0)
    if isinstance(created,(int,float)) and now-created>3600:
      stale.append(t.get('taskId','?'))
if stale:
  print(f'stale_tasks={\";\".join(stale[:5])}')
  sys.exit(1)
else:
  print(f'total={len(tasks)},all_ok')
  sys.exit(0)
" 2>&1)

if [ $? -ne 0 ]; then
  echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"fail\",\"detail\":\"$RESULT\"}"
  exit 1
else
  echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"pass\",\"detail\":\"$RESULT\"}"
  exit 0
fi
