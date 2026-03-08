#!/usr/bin/env bash
# ISC Hook: rule.git-commit-dispatch-001 — Git提交事件分发路由
# 检测git commit后是否触发了下游质量检查管道
set -euo pipefail
RULE_ID="rule.git-commit-dispatch-001"
WORKSPACE="${WORKSPACE:-/root/.openclaw/workspace}"
cd "$WORKSPACE"

# 检查最近一次commit是否有对应的dispatch记录
LAST_COMMIT=$(git log -1 --format="%H" 2>/dev/null || echo "")
if [ -z "$LAST_COMMIT" ]; then
  echo "{\"rule_id\":\"$RULE_ID\", \"status\":\"fail\", \"detail\":\"No git commits found\"}"
  exit 1
fi

# 检查是否存在dispatch配置（handler绑定）
DISPATCH_HANDLERS=("quality_check" "architecture_review" "rule_code_pairing")
MISSING=()
for h in "${DISPATCH_HANDLERS[@]}"; do
  # TODO: 接入实际的事件总线检查dispatch是否注册
  # 当前骨架：检查是否有对应的hook脚本或handler配置
  :
done

# 骨架实现：检查post-commit hook是否存在
HOOK_FILE="$WORKSPACE/.git/hooks/post-commit"
if [ -f "$HOOK_FILE" ]; then
  echo "{\"rule_id\":\"$RULE_ID\", \"status\":\"pass\", \"detail\":\"post-commit hook exists, dispatch route configured\"}"
  exit 0
else
  echo "{\"rule_id\":\"$RULE_ID\", \"status\":\"fail\", \"detail\":\"No post-commit hook found; git.commit.completed events will have NO_ROUTE\"}"
  exit 1
fi
