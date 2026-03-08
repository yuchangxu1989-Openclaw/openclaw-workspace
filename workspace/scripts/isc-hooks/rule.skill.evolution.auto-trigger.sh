#!/usr/bin/env bash
# ISC Hook: skill.evolution.auto-trigger — 技能进化自动触发
# 检测技能变更是否触发了SEEF进化流水线
set -euo pipefail
RULE_ID="skill.evolution.auto-trigger"
WORKSPACE="${WORKSPACE:-/root/.openclaw/workspace}"
cd "$WORKSPACE"

# 检查最近commit中是否有技能文件变更
LAST_COMMIT=$(git log -1 --format="%H" 2>/dev/null || echo "")
if [ -z "$LAST_COMMIT" ]; then
  echo "{\"rule_id\":\"$RULE_ID\", \"status\":\"pass\", \"detail\":\"No commits to check\"}"
  exit 0
fi

SKILL_CHANGES=$(git diff-tree --no-commit-id --name-only -r "$LAST_COMMIT" 2>/dev/null | grep -c "^skills/" || echo 0)

if [ "$SKILL_CHANGES" -gt 0 ]; then
  # 检查SEEF进化流水线是否存在
  SEEF_DIR="$WORKSPACE/skills/seef"
  if [ ! -d "$SEEF_DIR" ]; then
    echo "{\"rule_id\":\"$RULE_ID\", \"status\":\"fail\", \"detail\":\"$SKILL_CHANGES skill files changed but SEEF pipeline directory missing\"}"
    exit 1
  fi
  # TODO: 检查实际的进化流水线是否被触发（需要接入事件总线）
  echo "{\"rule_id\":\"$RULE_ID\", \"status\":\"pass\", \"detail\":\"$SKILL_CHANGES skill files changed, SEEF pipeline available\"}"
  exit 0
fi

echo "{\"rule_id\":\"$RULE_ID\", \"status\":\"pass\", \"detail\":\"No skill files changed in last commit\"}"
exit 0
