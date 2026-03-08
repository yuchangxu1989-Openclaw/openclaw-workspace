#!/usr/bin/env bash
# ISC Hook: rule.intent-post-commit-quality-gate-h8z2sz — post-commit质量门禁
# 检测提交后质量检查是否被触发
set -euo pipefail
RULE_ID="rule.intent-post-commit-quality-gate-h8z2sz"
WORKSPACE="${WORKSPACE:-/root/.openclaw/workspace}"
cd "$WORKSPACE"

# 检查最近commit的文件是否通过了基本质量检查
LAST_COMMIT=$(git log -1 --format="%H" 2>/dev/null || echo "")
if [ -z "$LAST_COMMIT" ]; then
  echo "{\"rule_id\":\"$RULE_ID\", \"status\":\"fail\", \"detail\":\"No commits found\"}"
  exit 1
fi

# 质量检查项：
# 1. commit message不能为空或太短
MSG=$(git log -1 --format="%s")
if [ ${#MSG} -lt 5 ]; then
  echo "{\"rule_id\":\"$RULE_ID\", \"status\":\"fail\", \"detail\":\"Commit message too short: '$MSG'\"}"
  exit 1
fi

# 2. 不能包含调试代码标记
FILES_CHANGED=$(git diff-tree --no-commit-id --name-only -r "$LAST_COMMIT" 2>/dev/null || echo "")
DEBUG_FOUND=""
for f in $FILES_CHANGED; do
  if [ -f "$f" ]; then
    if grep -qn "console\.log\|debugger\|TODO.*HACK\|FIXME.*URGENT" "$f" 2>/dev/null; then
      DEBUG_FOUND="$DEBUG_FOUND $f"
    fi
  fi
done

if [ -n "$DEBUG_FOUND" ]; then
  echo "{\"rule_id\":\"$RULE_ID\", \"status\":\"fail\", \"detail\":\"Debug markers found in:$DEBUG_FOUND\"}"
  exit 1
fi

echo "{\"rule_id\":\"$RULE_ID\", \"status\":\"pass\", \"detail\":\"Post-commit quality gate passed for $LAST_COMMIT\"}"
exit 0
