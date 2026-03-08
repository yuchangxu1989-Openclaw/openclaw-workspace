#!/usr/bin/env bash
# rule.project-mgmt-lesson-capture-001 — 项目管理经验沉淀门禁
# 检查是否存在经验教训文件和指标数据
RULE_ID="rule.project-mgmt-lesson-capture-001"
WORKSPACE="/root/.openclaw/workspace"
LESSONS_DIR="$WORKSPACE/skills/project-mgmt/lessons"
METRICS_DIR="$WORKSPACE/skills/project-mgmt/metrics"
FAIL=0
DETAIL=""

# 检查lessons目录是否存在且有内容
if [ ! -d "$LESSONS_DIR" ]; then
  DETAIL="lessons目录不存在; "
  # 不算严格失败，可能还没到sprint结束
fi

# 检查metrics目录
if [ ! -d "$METRICS_DIR" ]; then
  DETAIL="${DETAIL}metrics目录不存在; "
fi

# 检查anti-patterns文件
if [ -d "$LESSONS_DIR" ] && [ ! -f "$LESSONS_DIR/anti-patterns.md" ]; then
  DETAIL="${DETAIL}anti-patterns.md缺失; "
  FAIL=1
fi

if [ "$FAIL" -eq 1 ]; then
  echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"fail\",\"detail\":\"${DETAIL}\"}"
  exit 1
else
  echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"pass\",\"detail\":\"经验沉淀检查通过${DETAIL:+($DETAIL)}\"}"
  exit 0
fi
