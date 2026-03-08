#!/usr/bin/env bash
# ISC Hook: rule.auto-github-sync-trigger-001 — auto_github_sync
# 检测核心系统文件变更后是否已同步到GitHub
set -euo pipefail
RULE_ID="rule.auto-github-sync-trigger-001"
WORKSPACE="${WORKSPACE:-/root/.openclaw/workspace}"
cd "$WORKSPACE"

# 检查是否有未推送的核心文件变更
SCOPE_PATHS=("skills/isc-core" "skills/lto-core" "skills/cras" "skills/seef" "AGENTS.md" "HEARTBEAT.md" "CAPABILITY-ANCHOR.md")
UNPUSHED=0
for p in "${SCOPE_PATHS[@]}"; do
  if [ -e "$p" ]; then
    COUNT=$(git diff --name-only HEAD @{upstream} -- "$p" 2>/dev/null | wc -l || echo 0)
    UNPUSHED=$((UNPUSHED + COUNT))
  fi
done

if [ "$UNPUSHED" -gt 0 ]; then
  echo "{\"rule_id\":\"$RULE_ID\", \"status\":\"fail\", \"detail\":\"$UNPUSHED core files changed but not pushed to GitHub\"}"
  exit 1
else
  echo "{\"rule_id\":\"$RULE_ID\", \"status\":\"pass\", \"detail\":\"All core files in sync with remote\"}"
  exit 0
fi
