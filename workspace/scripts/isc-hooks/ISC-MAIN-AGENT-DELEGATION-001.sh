#!/usr/bin/env bash
# ISC-MAIN-AGENT-DELEGATION-001 — 主Agent委派铁律
# 扫描最近的agent日志，检测主Agent是否直接执行了实现工作
RULE_ID="ISC-MAIN-AGENT-DELEGATION-001"
WORKSPACE="/root/.openclaw/workspace"
VIOLATIONS=0
DETAIL=""

# 检查是否存在主Agent直接编辑代码文件的记录
LOG_DIR="$WORKSPACE/logs"
if [ -d "$LOG_DIR" ]; then
  # 扫描最近24小时的日志，查找主Agent直接write/edit代码文件的记录
  HITS=$(find "$LOG_DIR" -name "*.jsonl" -mtime -1 -exec grep -l '"agent_role":"main"' {} \; 2>/dev/null | head -5)
  if [ -n "$HITS" ]; then
    # 进一步检查是否有代码文件操作
    for f in $HITS; do
      CODE_OPS=$(grep -c '"agent_role":"main".*\.\(js\|py\|sh\|ts\)' "$f" 2>/dev/null || echo 0)
      VIOLATIONS=$((VIOLATIONS + CODE_OPS))
    done
  fi
fi

if [ "$VIOLATIONS" -gt 0 ]; then
  echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"fail\",\"detail\":\"检测到主Agent直接执行代码操作${VIOLATIONS}次\"}"
  exit 1
else
  echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"pass\",\"detail\":\"主Agent未直接执行实现工作\"}"
  exit 0
fi
